import { desc, eq, inArray } from "drizzle-orm";

import type { Db } from "./client.ts";
import type {
  OrderAddressSnapshot,
  OrderLineItem,
  OrderShippingMethodSnapshot,
} from "./order.ts";
import type { FulfillmentStatus, OrderStatus } from "./schema/index.ts";
import { address, order, orderLine, shippingMethod } from "./schema/index.ts";

export interface AdminOrderSummary {
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
  itemCount: number;
  lineCount: number;
}

export interface AdminOrderDetail {
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
  shippingAddress: OrderAddressSnapshot;
  shippingMethod: OrderShippingMethodSnapshot;
  lines: OrderLineItem[];
}

/**
 * Lists all orders across all customers/accounts for the admin backoffice,
 * ordered by creation timestamp descending (newest first).
 */
export async function listAllOrdersForAdmin(db: Db): Promise<AdminOrderSummary[]> {
  const orderRows = await db
    .select()
    .from(order)
    .orderBy(desc(order.createdAt), desc(order.id));

  if (orderRows.length === 0) {
    return [];
  }

  const orderIds = orderRows.map((r) => r.id);
  const lines = await db
    .select({
      orderId: orderLine.orderId,
      quantity: orderLine.quantity,
    })
    .from(orderLine)
    .where(inArray(orderLine.orderId, orderIds));

  const countsByOrderId = new Map<string, { lineCount: number; itemCount: number }>();
  for (const line of lines) {
    const current = countsByOrderId.get(line.orderId) ?? { lineCount: 0, itemCount: 0 };
    current.lineCount += 1;
    current.itemCount += line.quantity;
    countsByOrderId.set(line.orderId, current);
  }

  return orderRows.map((r) => {
    const counts = countsByOrderId.get(r.id) ?? { lineCount: 0, itemCount: 0 };
    return {
      id: r.id,
      reference: r.reference,
      accountId: r.accountId,
      contactEmail: r.contactEmail,
      status: r.status,
      fulfillmentStatus: r.fulfillmentStatus,
      subtotalCents: r.subtotalCents,
      shippingCents: r.shippingCents,
      taxCents: r.taxCents,
      totalCents: r.totalCents,
      currency: r.currency,
      createdAt: r.createdAt,
      paidAt: r.paidAt,
      itemCount: counts.itemCount,
      lineCount: counts.lineCount,
    };
  });
}

/**
 * Retrieves full order details across any customer by human-readable reference
 * for the admin backoffice, including frozen lines, shipping address, and shipping method.
 * Returns null if not found.
 */
export async function getOrderForAdmin(
  db: Db,
  reference: string,
): Promise<AdminOrderDetail | null> {
  if (!reference || !reference.trim()) {
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
    .where(eq(order.reference, reference.trim()))
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

export const VALID_FULFILLMENT_TRANSITIONS: Record<
  FulfillmentStatus,
  FulfillmentStatus[]
> = {
  unfulfilled: ["preparing"],
  preparing: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
};

export function getNextFulfillmentStatus(
  current: FulfillmentStatus | null,
): FulfillmentStatus | null {
  const currentKey: FulfillmentStatus = current ?? "unfulfilled";
  const transitions = VALID_FULFILLMENT_TRANSITIONS[currentKey];
  return transitions && transitions.length > 0 ? transitions[0] : null;
}

export type UpdateFulfillmentStatusResult =
  | { ok: true; order: AdminOrderDetail }
  | { ok: false; error: "not_found"; message: string }
  | { ok: false; error: "order_not_paid"; message: string }
  | {
      ok: false;
      error: "invalid_transition";
      message: string;
      currentStatus: FulfillmentStatus;
      requestedStatus: string;
    };

/**
 * Transitions an order's fulfillment status sequentially for the admin backoffice.
 * - Rejects if order does not exist ('not_found').
 * - Rejects if order is not paid ('order_not_paid').
 * - Rejects if the transition violates the sequential lifecycle ('invalid_transition'):
 *     unfulfilled -> preparing -> shipped -> delivered.
 * - Updates fulfillmentStatus and updatedAt on success.
 */
export async function updateOrderFulfillmentStatus(
  db: Db,
  reference: string,
  newFulfillmentStatus: string,
): Promise<UpdateFulfillmentStatusResult> {
  if (!reference || !reference.trim()) {
    return { ok: false, error: "not_found", message: "Order not found." };
  }

  const [existingOrder] = await db
    .select({
      id: order.id,
      reference: order.reference,
      status: order.status,
      fulfillmentStatus: order.fulfillmentStatus,
    })
    .from(order)
    .where(eq(order.reference, reference.trim()))
    .limit(1);

  if (!existingOrder) {
    return { ok: false, error: "not_found", message: "Order not found." };
  }

  if (existingOrder.status !== "paid") {
    return {
      ok: false,
      error: "order_not_paid",
      message: `Cannot update fulfillment for order with payment status '${existingOrder.status}'. Only paid orders can be fulfilled.`,
    };
  }

  const currentStatus: FulfillmentStatus =
    existingOrder.fulfillmentStatus ?? "unfulfilled";

  const validTargets = VALID_FULFILLMENT_TRANSITIONS[currentStatus] ?? [];
  if (!validTargets.includes(newFulfillmentStatus as FulfillmentStatus)) {
    return {
      ok: false,
      error: "invalid_transition",
      message: `Cannot transition fulfillment from '${currentStatus}' to '${newFulfillmentStatus}'.`,
      currentStatus,
      requestedStatus: newFulfillmentStatus,
    };
  }

  await db
    .update(order)
    .set({
      fulfillmentStatus: newFulfillmentStatus as FulfillmentStatus,
    })
    .where(eq(order.id, existingOrder.id));

  const updatedDetail = await getOrderForAdmin(db, reference.trim());
  if (!updatedDetail) {
    return {
      ok: false,
      error: "not_found",
      message: "Order not found after update.",
    };
  }

  return { ok: true, order: updatedDetail };
}
