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
