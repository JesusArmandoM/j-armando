import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";

import type { Db } from "./client.ts";
import type { FulfillmentStatus, OrderStatus } from "./schema/index.ts";
import {
  account,
  accountRole,
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
import type { EmailSender, OrderConfirmationLine } from "@/lib/email/order-confirmation.ts";
import { getEmailSender } from "@/lib/email/order-confirmation.ts";
import type { PaymentFailureReason, PaymentProvider } from "@/payments/payment-provider.ts";
import { createSimulatedPaymentProvider } from "@/payments/simulated-provider.ts";
import type { PaymentScenario } from "@/payments/simulated-provider.ts";

export type { PaymentScenario };

export interface CreatePaidOrderOptions {
  provider?: PaymentProvider;
  scenario?: PaymentScenario;
  failureReason?: PaymentFailureReason;
  emailSender?: EmailSender;
}

export class OutOfStockError extends Error {
  readonly variantId: string;
  readonly productName: string;

  constructor(details: { variantId: string; productName: string }) {
    super(`Variant ${details.variantId} (${details.productName}) is out of stock`);
    this.name = "OutOfStockError";
    this.variantId = details.variantId;
    this.productName = details.productName;
  }
}

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
  accountId: string | null;
  isNewAccount?: boolean;
  hasPassword?: boolean;
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

export interface OrderSummary {
  id: string;
  reference: string;
  accountId: string | null;
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
  lineCount: number;
  itemCount: number;
  lines: OrderLineItem[];
  shippingAddress: OrderAddressSnapshot;
  shippingMethod: OrderShippingMethodSnapshot;
}

export type CreatePaidOrderResult =
  | {
      ok: true;
      order: {
        id: string;
        reference: string;
        totalCents: number;
        contactEmail: string;
        accountId?: string | null;
        hasPassword?: boolean;
      };
      accountId: string;
      isNewAccount: boolean;
      hasPassword: boolean;
    }
  | {
      ok: false;
      reason:
        | "cart_not_found"
        | "cart_empty"
        | "address_required"
        | "shipping_method_required"
        | "payment_failed"
        | "out_of_stock";
      paymentOutcome?: string;
      failureReason?: PaymentFailureReason;
      variantId?: string;
      productName?: string;
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
  providerOrOptions?: PaymentProvider | CreatePaidOrderOptions,
  emailSender?: EmailSender,
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
  let paymentProvider: PaymentProvider;
  if (providerOrOptions && "createPayment" in providerOrOptions) {
    paymentProvider = providerOrOptions;
  } else if (providerOrOptions && "provider" in providerOrOptions && providerOrOptions.provider) {
    paymentProvider = providerOrOptions.provider;
  } else {
    const scenario = (providerOrOptions as CreatePaidOrderOptions | undefined)?.scenario ?? "succeed";
    const failureReason =
      (providerOrOptions as CreatePaidOrderOptions | undefined)?.failureReason ?? "card_declined";
    paymentProvider = createSimulatedPaymentProvider({ scenario, failureReason });
  }

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

  // 6. Execute atomic transaction to reserve stock, freeze snapshot, create/link account, and create order
  let transactionResult: {
    ok: true;
    order: {
      id: string;
      reference: string;
      totalCents: number;
      contactEmail: string;
      accountId: string;
      hasPassword: boolean;
    };
    accountId: string;
    isNewAccount: boolean;
    hasPassword: boolean;
  };

  try {
    transactionResult = await db.transaction(async (tx) => {
      const txDb = tx as unknown as Db;

      // 6a. Sort cart lines deterministically by variantId to prevent database deadlocks
      const sortedLines = [...lines].sort((a, b) => {
        if (!a.variantId || !b.variantId) return 0;
        return a.variantId.localeCompare(b.variantId);
      });

      // 6b. Atomic conditional stock decrement for each variant
      for (const line of sortedLines) {
        if (!line.variantId) continue;

        const updated = await txDb
          .update(variant)
          .set({
            stockQty: sql`${variant.stockQty} - ${line.quantity}`,
          })
          .where(and(eq(variant.id, line.variantId), gte(variant.stockQty, line.quantity)))
          .returning({ id: variant.id, newStockQty: variant.stockQty });

        if (updated.length === 0) {
          throw new OutOfStockError({
            variantId: line.variantId,
            productName: line.productName,
          });
        }
      }

      // Normalize contact email
      const normalizedEmail = session.email.trim().toLowerCase();

      // Look up existing account
      const [existingAccount] = await txDb
        .select({ id: account.id, passwordHash: account.passwordHash })
        .from(account)
        .where(eq(account.email, normalizedEmail))
        .limit(1);

      let targetAccountId: string;
      let finalHasPassword = false;

      if (existingAccount) {
        targetAccountId = existingAccount.id;
        if (!existingAccount.passwordHash && session.passwordHash) {
          await txDb
            .update(account)
            .set({
              passwordHash: session.passwordHash,
              updatedAt: new Date(),
            })
            .where(eq(account.id, targetAccountId));
          finalHasPassword = true;
        } else {
          finalHasPassword = Boolean(existingAccount.passwordHash);
        }
      } else {
        const passwordHashToSet = session.passwordHash ?? null;
        const [newAccount] = await txDb
          .insert(account)
          .values({
            email: normalizedEmail,
            passwordHash: passwordHashToSet,
          })
          .returning({ id: account.id });
        targetAccountId = newAccount.id;
        finalHasPassword = Boolean(passwordHashToSet);

        await txDb.insert(accountRole).values({
          accountId: targetAccountId,
          role: "customer",
        });
      }

      // 6c. Insert address snapshot (linked to targetAccountId)
      const [insertedAddress] = await txDb
        .insert(address)
        .values({
          accountId: targetAccountId,
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

      // 6d. Generate unique reference and insert order
      const reference = generateOrderReference();
      const now = new Date();

      const [createdOrder] = await txDb
        .insert(order)
        .values({
          reference,
          accountId: targetAccountId,
          contactEmail: normalizedEmail,
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

      // 6e. Insert frozen order lines
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

      // 6f. Insert payment row
      await txDb.insert(payment).values({
        orderId: createdOrder.id,
        status: "succeeded",
        provider: "simulated",
        amountCents: totalCents,
        createdAt: now,
        updatedAt: now,
      });

      // 6g. Update cart to converted and link accountId
      await txDb
        .update(cart)
        .set({
          accountId: targetAccountId,
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
          accountId: targetAccountId,
          hasPassword: finalHasPassword,
        },
        accountId: targetAccountId,
        isNewAccount: !existingAccount,
        hasPassword: finalHasPassword,
      } as const;
    });
  } catch (error) {
    if (error instanceof OutOfStockError) {
      return {
        ok: false,
        reason: "out_of_stock",
        variantId: error.variantId,
        productName: error.productName,
      };
    }
    throw error;
  }

  const activeEmailSender =
    emailSender ??
    (providerOrOptions && "emailSender" in providerOrOptions && providerOrOptions.emailSender
      ? providerOrOptions.emailSender
      : undefined) ??
    getEmailSender();
  try {
    const confirmationLines: OrderConfirmationLine[] = lines.map((line) => {
      const unitPriceCents = line.priceOverrideCents ?? line.basePriceCents;
      const lineTotalCents = unitPriceCents * line.quantity;
      return {
        productName: line.productName,
        size: line.size,
        color: line.color,
        quantity: line.quantity,
        unitPriceCents,
        lineTotalCents,
      };
    });

    await activeEmailSender.sendOrderConfirmation({
      to: session.email,
      reference: transactionResult.order.reference,
      lines: confirmationLines,
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents,
      shippingAddress: {
        recipientName: session.recipientName,
        line1: session.line1,
        city: session.city,
        state: session.state,
        zip: session.zip,
      },
    });
  } catch (emailError) {
    // Non-blocking graceful degradation: order creation succeeded, do not roll back or fail.
    // Avoid logging sensitive personal data or secrets.
    console.error(
      `[order-confirmation-email] Failed to send confirmation email for order ${transactionResult.order.reference}:`,
      emailError instanceof Error ? emailError.message : "unknown error",
    );
  }

  return transactionResult;
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

  let isNewAccount: boolean | undefined = undefined;
  let hasPassword: boolean | undefined = undefined;
  if (orderRow.order.accountId) {
    const ordersForAccount = await db
      .select({ id: order.id })
      .from(order)
      .where(eq(order.accountId, orderRow.order.accountId))
      .orderBy(asc(order.createdAt));
    if (ordersForAccount.length > 0) {
      isNewAccount = ordersForAccount[0].id === orderRow.order.id;
    }

    const [acc] = await db
      .select({ passwordHash: account.passwordHash })
      .from(account)
      .where(eq(account.id, orderRow.order.accountId))
      .limit(1);
    hasPassword = Boolean(acc?.passwordHash);
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
    accountId: orderRow.order.accountId,
    isNewAccount,
    hasPassword,
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

/**
 * Lists all orders placed by an account, ordered by creation date descending.
 * Includes line items, item counts, and frozen financial totals.
 */
export async function listOrdersForAccount(
  db: Db,
  accountId: string,
): Promise<OrderSummary[]> {
  if (!accountId) {
    return [];
  }

  const orderRows = await db
    .select({
      order: order,
      address: address,
      shippingMethod: shippingMethod,
    })
    .from(order)
    .innerJoin(address, eq(address.id, order.addressId))
    .innerJoin(shippingMethod, eq(shippingMethod.id, order.shippingMethodId))
    .where(eq(order.accountId, accountId))
    .orderBy(desc(order.createdAt));

  if (orderRows.length === 0) {
    return [];
  }

  const orderIds = orderRows.map((r) => r.order.id);
  const lines = await db
    .select({
      id: orderLine.id,
      orderId: orderLine.orderId,
      variantId: orderLine.variantId,
      productName: orderLine.productName,
      variantSize: orderLine.variantSize,
      variantColor: orderLine.variantColor,
      unitPriceCents: orderLine.unitPriceCents,
      quantity: orderLine.quantity,
      lineTotalCents: orderLine.lineTotalCents,
    })
    .from(orderLine)
    .where(inArray(orderLine.orderId, orderIds));

  const linesByOrderId = new Map<string, OrderLineItem[]>();
  for (const line of lines) {
    const existing = linesByOrderId.get(line.orderId) ?? [];
    existing.push({
      id: line.id,
      variantId: line.variantId,
      productName: line.productName,
      variantSize: line.variantSize,
      variantColor: line.variantColor,
      unitPriceCents: line.unitPriceCents,
      quantity: line.quantity,
      lineTotalCents: line.lineTotalCents,
    });
    linesByOrderId.set(line.orderId, existing);
  }

  return orderRows.map((r) => {
    const orderLines = linesByOrderId.get(r.order.id) ?? [];
    const lineCount = orderLines.length;
    const itemCount = orderLines.reduce((acc, l) => acc + l.quantity, 0);

    return {
      id: r.order.id,
      reference: r.order.reference,
      accountId: r.order.accountId,
      contactEmail: r.order.contactEmail,
      status: r.order.status,
      fulfillmentStatus: r.order.fulfillmentStatus,
      subtotalCents: r.order.subtotalCents,
      shippingCents: r.order.shippingCents,
      taxCents: r.order.taxCents,
      totalCents: r.order.totalCents,
      currency: r.order.currency,
      createdAt: r.order.createdAt,
      paidAt: r.order.paidAt,
      lineCount,
      itemCount,
      lines: orderLines,
      shippingAddress: {
        recipientName: r.address.recipientName,
        line1: r.address.line1,
        line2: r.address.line2,
        city: r.address.city,
        state: r.address.state,
        zip: r.address.zip,
        country: r.address.country,
        phone: r.address.phone,
      },
      shippingMethod: {
        id: r.shippingMethod.id,
        name: r.shippingMethod.name,
        costCents: r.shippingMethod.costCents,
        deliveryEstimate: r.shippingMethod.deliveryEstimate,
      },
    };
  });
}

/**
 * Retrieves an order by its reference strictly matching the specified accountId.
 * If the order does not exist or belongs to another customer, returns null.
 */
export async function getOrderByReferenceForAccount(
  db: Db,
  reference: string,
  accountId: string,
): Promise<OrderWithDetails | null> {
  if (!reference || !accountId) {
    return null;
  }

  const [orderRow] = await db
    .select({
      order: order,
      address: address,
      shippingMethod: shippingMethod,
    })
    .from(order)
    .innerJoin(address, eq(address.id, order.addressId))
    .innerJoin(shippingMethod, eq(shippingMethod.id, order.shippingMethodId))
    .where(and(eq(order.reference, reference), eq(order.accountId, accountId)))
    .limit(1);

  if (!orderRow) {
    return null;
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
    accountId: orderRow.order.accountId,
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

