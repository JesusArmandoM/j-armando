import { randomUUID } from "node:crypto";
import { formatPriceUSD } from "@/lib/money.ts";

export interface OrderConfirmationLine {
  productName: string;
  size: string;
  color: string;
  quantity: number;
  unitPriceCents: number;
  lineTotalCents: number;
}

export interface OrderConfirmationShippingAddress {
  recipientName?: string | null;
  line1: string;
  city: string;
  state: string;
  zip: string;
}

export interface OrderConfirmationEmailPayload {
  to: string;
  reference: string;
  lines: OrderConfirmationLine[];
  subtotalCents: number;
  shippingCents: number;
  taxCents: number;
  totalCents: number;
  shippingAddress: OrderConfirmationShippingAddress;
}

export interface SentConfirmationEmail {
  messageId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  payload: OrderConfirmationEmailPayload;
  sentAt: Date;
}

export interface EmailSender {
  sendOrderConfirmation(
    payload: OrderConfirmationEmailPayload,
  ): Promise<{ ok: boolean; messageId: string }>;
  getSentEmails?(): SentConfirmationEmail[];
  clearSentEmails?(): void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function renderOrderConfirmationSubject(reference: string): string {
  return `Order Confirmation - ${reference}`;
}

export function renderOrderConfirmationText(payload: OrderConfirmationEmailPayload): string {
  const linesText = payload.lines
    .map(
      (line) =>
        `- ${line.productName} (${line.color}, Size ${line.size}) x ${line.quantity}: ${formatPriceUSD(
          line.lineTotalCents,
        )} (${formatPriceUSD(line.unitPriceCents)} each)`,
    )
    .join("\n");

  const addressParts = [
    payload.shippingAddress.recipientName,
    payload.shippingAddress.line1,
    `${payload.shippingAddress.city}, ${payload.shippingAddress.state} ${payload.shippingAddress.zip}`,
  ].filter(Boolean);

  return [
    `J. Armando`,
    `Thank you for your order!`,
    ``,
    `Order Reference: ${payload.reference}`,
    ``,
    `Items:`,
    linesText,
    ``,
    `Summary:`,
    `Subtotal: ${formatPriceUSD(payload.subtotalCents)}`,
    `Shipping: ${formatPriceUSD(payload.shippingCents)}`,
    `Estimated Tax: ${formatPriceUSD(payload.taxCents)}`,
    `Total: ${formatPriceUSD(payload.totalCents)}`,
    ``,
    `Shipping Destination:`,
    addressParts.join("\n"),
  ].join("\n");
}

export function renderOrderConfirmationHtml(payload: OrderConfirmationEmailPayload): string {
  const lineRows = payload.lines
    .map(
      (line) => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${escapeHtml(line.productName)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5;">${escapeHtml(line.color)} / ${escapeHtml(line.size)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: center;">${line.quantity}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPriceUSD(line.unitPriceCents)}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e5e5; text-align: right;">${formatPriceUSD(line.lineTotalCents)}</td>
        </tr>`,
    )
    .join("");

  const addressParts = [
    payload.shippingAddress.recipientName ? escapeHtml(payload.shippingAddress.recipientName) : null,
    escapeHtml(payload.shippingAddress.line1),
    `${escapeHtml(payload.shippingAddress.city)}, ${escapeHtml(payload.shippingAddress.state)} ${escapeHtml(payload.shippingAddress.zip)}`,
  ]
    .filter(Boolean)
    .join("<br />");

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Order Confirmation - ${escapeHtml(payload.reference)}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111; line-height: 1.5; padding: 24px;">
  <div style="max-width: 600px; margin: 0 auto; border: 1px solid #e5e5e5; padding: 32px;">
    <h1 style="font-size: 24px; font-weight: 600; margin-top: 0; letter-spacing: -0.02em;">J. Armando</h1>
    <p style="font-size: 16px; margin-bottom: 8px;">Thank you for your order!</p>
    <p style="font-size: 14px; color: #555; margin-top: 0;">Order Reference: <strong style="color: #111;">${escapeHtml(payload.reference)}</strong></p>

    <h2 style="font-size: 18px; margin-top: 32px; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 6px;">Order Items</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; margin-bottom: 24px;">
      <thead>
        <tr style="background-color: #f9f9f9; text-align: left;">
          <th style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Product</th>
          <th style="padding: 8px 12px; border-bottom: 1px solid #ddd;">Color / Size</th>
          <th style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: center;">Qty</th>
          <th style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right;">Price</th>
          <th style="padding: 8px 12px; border-bottom: 1px solid #ddd; text-align: right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${lineRows}
      </tbody>
    </table>

    <h2 style="font-size: 18px; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 6px;">Summary</h2>
    <table style="width: 100%; font-size: 14px; margin-bottom: 24px;">
      <tr>
        <td style="padding: 4px 0;">Subtotal</td>
        <td style="padding: 4px 0; text-align: right;">${formatPriceUSD(payload.subtotalCents)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0;">Shipping</td>
        <td style="padding: 4px 0; text-align: right;">${formatPriceUSD(payload.shippingCents)}</td>
      </tr>
      <tr>
        <td style="padding: 4px 0;">Estimated Tax</td>
        <td style="padding: 4px 0; text-align: right;">${formatPriceUSD(payload.taxCents)}</td>
      </tr>
      <tr style="font-weight: 600; font-size: 16px; border-top: 1px solid #111;">
        <td style="padding: 8px 0;">Total</td>
        <td style="padding: 8px 0; text-align: right;">${formatPriceUSD(payload.totalCents)}</td>
      </tr>
    </table>

    <h2 style="font-size: 18px; margin-top: 24px; margin-bottom: 12px; border-bottom: 2px solid #111; padding-bottom: 6px;">Shipping Destination</h2>
    <p style="font-size: 14px; margin: 0; line-height: 1.6;">${addressParts}</p>
  </div>
</body>
</html>`;
}

export interface SimulatedEmailSenderOptions {
  shouldFail?: boolean;
  failureError?: Error;
}

export class SimulatedEmailSender implements EmailSender {
  private sentEmails: SentConfirmationEmail[] = [];
  private options: SimulatedEmailSenderOptions;

  constructor(options: SimulatedEmailSenderOptions = {}) {
    this.options = options;
  }

  setOptions(options: SimulatedEmailSenderOptions): void {
    this.options = options;
  }

  async sendOrderConfirmation(
    payload: OrderConfirmationEmailPayload,
  ): Promise<{ ok: boolean; messageId: string }> {
    if (this.options.shouldFail) {
      throw this.options.failureError ?? new Error("Simulated email delivery failure");
    }

    const messageId = `msg_${randomUUID()}`;
    const subject = renderOrderConfirmationSubject(payload.reference);
    const text = renderOrderConfirmationText(payload);
    const html = renderOrderConfirmationHtml(payload);

    const sentEmail: SentConfirmationEmail = {
      messageId,
      to: payload.to,
      subject,
      text,
      html,
      payload,
      sentAt: new Date(),
    };

    this.sentEmails.push(sentEmail);
    return { ok: true, messageId };
  }

  getSentEmails(): SentConfirmationEmail[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }
}

let defaultSender: SimulatedEmailSender | null = null;

export function createSimulatedEmailSender(
  options?: SimulatedEmailSenderOptions,
): SimulatedEmailSender {
  return new SimulatedEmailSender(options);
}

export function getEmailSender(): EmailSender {
  if (!defaultSender) {
    defaultSender = createSimulatedEmailSender();
  }
  return defaultSender;
}

export function setEmailSender(sender: SimulatedEmailSender | null): void {
  defaultSender = sender;
}

export function getSentConfirmationEmails(): SentConfirmationEmail[] {
  if (!defaultSender) {
    return [];
  }
  return defaultSender.getSentEmails();
}

export function clearSentEmails(): void {
  if (defaultSender) {
    defaultSender.clearSentEmails();
  }
}
