import { and, asc, eq } from "drizzle-orm";

import type { Db } from "./client.ts";
import type { FulfillmentStatus, OrderStatus } from "./schema/index.ts";
import {
  address,
  cart,
  cartLine,
  checkoutSession,
  order,
  orderLine,
  payment,
  product,
  shippingMethod,
  variant,
} from "./schema/index.ts";
import { calculateSalesTax } from "@/lib/tax/sales-tax.ts";
import type { PaymentFailureReason, PaymentProvider } from "@/payments/payment-provider.ts";
import { createSimulatedPaymentProvider } from "@/payments/simulated-provider.ts";

// Order repository. Orders represent immutable purchases with frozen snapshots
// of product names, sizes, colors, and prices in integer cents.
// Guest checkout orders hold `accountId: null` until account creation links them.

export interface OrderLineItem {
  id: string;
  variantId: string | null;
  productName: string;
  variantSize: string;
  variantColor: string;
  unitPriceCents: number;
  quantity: number;
  lineTotalCents: number;
}

export interface OrderAddressSnapshot {
  recipientName: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
}

export interface OrderShippingMethodSnapshot {
  id: string;
  name: string;
  costCents: number;
  deliveryEstimate: string;
}

export interface OrderWithDetails {
  id: string;
  reference: string;
  contactEmail: string;
  status: OrderStatus;
  fulfillmentStatus: FulfillmentStatus | null;
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  currency: string;
  createdAt: Date;
  paidAt: Date | null;
  shippingAddress: OrderAddressSnapshot;
  shippingMethod: OrderShippingMethodSnapshot;
  lines: OrderLineItem[];
}

export type CreatePaidOrderResult =
  | {
      ok: true;
      order: {
        id: string;
        reference: string;
        totalCents: number;
        contactEmail: string;
      };
    }
  | {
      ok: false;
      reason:
        | "cart_not_found"
        | "cart_empty"
        | "address_required"
        | "shipping_method_required"
        | "payment_failed";
      paymentOutcome?: string;
      failureReason?: PaymentFailureReason;
    };

/**
 * Generates a human-readable order reference like JA-123456.
 */
export function generateOrderReference(): string {
  const number = Math.floor(100000 + Math.random() * 900000);
  return `JA-${number}`;
}

/**
 * Creates a paid order from the current checkout session for the given cart session token.
 * Executes the payment through PaymentProvider, freezes lines/prices in an atomic transaction,
 * marks the cart converted, and returns the created order details.
 */
export async function createPaidOrderFromCheckout(
  db: Db,
  sessionToken: string,
  provider?: PaymentProvider,
): Promise<CreatePaidOrderResult> {
  // 1. Fetch active cart
  const [activeCart] = await db
    .select({ id: cart.id })
    .from(cart)
    .where(and(eq(cart.sessionToken, sessionToken), eq(cart.status, "active")))
    .limit(1);

  if (!activeCart) {
    return { ok: false, reason: "cart_not_found" };
  }

  // 2. Fetch cart lines
  const lines = await db
    .select({
      cartLineId: cartLine.id,
      variantId: cartLine.variantId,
      quantity: cartLine.quantity,
      productName: product.name,
      size: variant.size,
      color: variant.color,
      basePriceCents: product.basePriceCents,
      priceOverrideCents: variant.priceOverrideCents,
    })
    .from(cartLine)
    .innerJoin(variant, eq(variant.id, cartLine.variantId))
    .innerJoin(product, eq(product.id, variant.productId))
    .where(eq(cartLine.cartId, activeCart.id))
    .orderBy(asc(product.name), asc(variant.size), asc(variant.color));

  if (lines.length === 0) {
    return { ok: false, reason: "cart_empty" };
  }

  // 3. Fetch checkout session and selected shipping method
  const [sessionRow] = await db
    .select({
      session: checkoutSession,
      shippingMethod: shippingMethod,
    })
    .from(checkoutSession)
    .leftJoin(shippingMethod, eq(checkoutSession.shippingMethodId, shippingMethod.id))
    .where(eq(checkoutSession.cartId, activeCart.id))
    .limit(1);

  if (!sessionRow || !sessionRow.session) {
    return { ok: false, reason: "address_required" };
  }

  const session = sessionRow.session;
  if (!session.recipientName || !session.line1 || !session.city || !session.state || !session.zip) {
    return { ok: false, reason: "address_required" };
  }

  if (!sessionRow.shippingMethod) {
    return { ok: false, reason: "shipping_method_required" };
  }

  const selectedShipping = sessionRow.shippingMethod;

  // 4. Calculate frozen financial breakdown in integer cents
  const subtotalCents = lines.reduce((acc, line) => {
    const unitPrice = line.priceOverrideCents ?? line.basePriceCents;
    return acc + unitPrice * line.quantity;
  }, 0);

  const shippingCents = selectedShipping.costCents;
  const taxCalculation = calculateSalesTax(subtotalCents, session.state);
  const taxCents = taxCalculation.taxCents;
  const totalCents = subtotalCents + shippingCents + taxCents;

  // 5. Process Payment via PaymentProvider
  const paymentProvider = provider ?? createSimulatedPaymentProvider({ scenario: "succeed" });
  const paymentAttempt = await paymentProvider.createPayment({
    reference: `checkout_${activeCart.id}`,
    amountCents: totalCents,
    currency: "USD",
    method: { kind: "card", token: "tok_simulated" },
  });

  if (paymentAttempt.type !== "payment.succeeded") {
    return {
      ok: false,
      reason: "payment_failed",
      paymentOutcome: paymentAttempt.type,
      failureReason: paymentAttempt.type === "payment.failed" ? paymentAttempt.reason : undefined,
    };
  }

  // 6. Execute atomic transaction to freeze snapshot and create order
  return db.transaction(async (tx) => {
    const txDb = tx as unknown as Db;

    // 6a. Insert address snapshot (accountId null for guest checkout)
    const [insertedAddress] = await txDb
      .insert(address)
      .values({
        accountId: null,
        recipientName: session.recipientName,
        line1: session.line1,
        line2: session.line2,
        city: session.city,
        state: session.state,
        zip: session.zip,
        country: session.country,
        phone: session.phone,
      })
      .returning();

    // 6b. Generate unique reference and insert order
    const reference = generateOrderReference();
    const now = new Date();

    const [createdOrder] = await txDb
      .insert(order)
      .values({
        reference,
        accountId: null,
        contactEmail: session.email,
        status: "paid",
        fulfillmentStatus: "unfulfilled",
        addressId: insertedAddress.id,
        shippingMethodId: selectedShipping.id,
        subtotalCents,
        shippingCents,
        taxCents,
        totalCents,
        currency: "USD",
        createdAt: now,
        paidAt: now,
      })
      .returning();

    // 6c. Insert frozen order lines
    const lineValues = lines.map((line) => {
      const unitPriceCents = line.priceOverrideCents ?? line.basePriceCents;
      const lineTotalCents = unitPriceCents * line.quantity;
      return {
        orderId: createdOrder.id,
        variantId: line.variantId,
        productName: line.productName,
        variantSize: line.size,
        variantColor: line.color,
        unitPriceCents,
        quantity: line.quantity,
        lineTotalCents,
      };
    });

    await txDb.insert(orderLine).values(lineValues);

    // 6d. Insert payment row
    await txDb.insert(payment).values({
      orderId: createdOrder.id,
      status: "succeeded",
      provider: "simulated",
      amountCents: totalCents,
      createdAt: now,
      updatedAt: now,
    });

    // 6e. Update cart to converted
    await txDb
      .update(cart)
      .set({
        status: "converted",
        updatedAt: now,
      })
      .where(eq(cart.id, activeCart.id));

    return {
      ok: true,
      order: {
        id: createdOrder.id,
        reference: createdOrder.reference,
        totalCents: createdOrder.totalCents,
        contactEmail: createdOrder.contactEmail,
      },
    } as const;
  });
}

/**
 * Retrieves a complete order by its human-readable reference, including
 * frozen lines, shipping address, and shipping method.
 */
export async function getOrderByReference(
  db: Db,
  reference: string,
): Promise<OrderWithDetails | undefined> {
  const [orderRow] = await db
    .select({
      order: order,
      address: address,
      shippingMethod: shippingMethod,
    })
    .from(order)
    .innerJoin(address, eq(address.id, order.addressId))
    .innerJoin(shippingMethod, eq(shippingMethod.id, order.shippingMethodId))
    .where(eq(order.reference, reference))
    .limit(1);

  if (!orderRow) {
    return undefined;
  }

  const lines = await db
    .select({
      id: orderLine.id,
      variantId: orderLine.variantId,
      productName: orderLine.productName,
      variantSize: orderLine.variantSize,
      variantColor: orderLine.variantColor,
      unitPriceCents: orderLine.unitPriceCents,
      quantity: orderLine.quantity,
      lineTotalCents: orderLine.lineTotalCents,
    })
    .from(orderLine)
    .where(eq(orderLine.orderId, orderRow.order.id));

  return {
    id: orderRow.order.id,
    reference: orderRow.order.reference,
    contactEmail: orderRow.order.contactEmail,
    status: orderRow.order.status,
    fulfillmentStatus: orderRow.order.fulfillmentStatus,
    subtotalCents: orderRow.order.subtotalCents,
    shippingCents: orderRow.order.shippingCents,
    taxCents: orderRow.order.taxCents,
    totalCents: orderRow.order.totalCents,
    currency: orderRow.order.currency,
    createdAt: orderRow.order.createdAt,
    paidAt: orderRow.order.paidAt,
    shippingAddress: {
      recipientName: orderRow.address.recipientName,
      line1: orderRow.address.line1,
      line2: orderRow.address.line2,
      city: orderRow.address.city,
      state: orderRow.address.state,
      zip: orderRow.address.zip,
      country: orderRow.address.country,
      phone: orderRow.address.phone,
    },
    shippingMethod: {
      id: orderRow.shippingMethod.id,
      name: orderRow.shippingMethod.name,
      costCents: orderRow.shippingMethod.costCents,
      deliveryEstimate: orderRow.shippingMethod.deliveryEstimate,
    },
    lines,
  };
}
