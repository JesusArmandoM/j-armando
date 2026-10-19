import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSentEmails,
  createSimulatedEmailSender,
  getEmailSender,
  getSentConfirmationEmails,
  renderOrderConfirmationHtml,
  renderOrderConfirmationSubject,
  renderOrderConfirmationText,
  setEmailSender,
} from "./order-confirmation.ts";
import type { OrderConfirmationEmailPayload } from "./order-confirmation.ts";

describe("order-confirmation email module (lib/email/order-confirmation.ts)", () => {
  const samplePayload: OrderConfirmationEmailPayload = {
    to: "customer@example.com",
    reference: "JA-998877",
    lines: [
      {
        productName: "Longline Wool Overcoat",
        size: "M",
        color: "Camel",
        quantity: 1,
        unitPriceCents: 34900,
        lineTotalCents: 34900,
      },
      {
        productName: "Silk Slip Dress",
        size: "S",
        color: "Emerald",
        quantity: 2,
        unitPriceCents: 18900,
        lineTotalCents: 37800,
      },
    ],
    subtotalCents: 72700,
    shippingCents: 1500,
    taxCents: 5816,
    totalCents: 80016,
    shippingAddress: {
      recipientName: "Jane Doe",
      line1: "456 Fashion Ave",
      city: "New York",
      state: "NY",
      zip: "10018",
    },
  };

  beforeEach(() => {
    setEmailSender(null);
    clearSentEmails();
  });

  describe("renderOrderConfirmationSubject", () => {
    it("formats the subject line with order reference", () => {
      const subject = renderOrderConfirmationSubject("JA-123456");
      expect(subject).toBe("Order Confirmation - JA-123456");
    });
  });

  describe("renderOrderConfirmationText", () => {
    it("renders store name, order reference, item details with USD prices, and summary breakdown", () => {
      const text = renderOrderConfirmationText(samplePayload);

      expect(text).toContain("J. Armando");
      expect(text).toContain("Thank you for your order!");
      expect(text).toContain("Order Reference: JA-998877");

      // Items
      expect(text).toContain("Longline Wool Overcoat (Camel, Size M) x 1: $349.00 ($349.00 each)");
      expect(text).toContain("Silk Slip Dress (Emerald, Size S) x 2: $378.00 ($189.00 each)");

      // Financial breakdown
      expect(text).toContain("Subtotal: $727.00");
      expect(text).toContain("Shipping: $15.00");
      expect(text).toContain("Estimated Tax: $58.16");
      expect(text).toContain("Total: $800.16");

      // Destination
      expect(text).toContain("Jane Doe");
      expect(text).toContain("456 Fashion Ave");
      expect(text).toContain("New York, NY 10018");
    });
  });

  describe("renderOrderConfirmationHtml", () => {
    it("renders valid HTML with escaped values and table rows", () => {
      const html = renderOrderConfirmationHtml({
        ...samplePayload,
        reference: "JA-<123>&",
        shippingAddress: {
          recipientName: "Jane & Co <VIP>",
          line1: "123 Main St",
          city: "Metropolis",
          state: "NY",
          zip: "10001",
        },
      });

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("J. Armando");
      expect(html).toContain("Order Reference: <strong style=\"color: #111;\">JA-&lt;123&gt;&amp;</strong>");
      expect(html).toContain("Jane &amp; Co &lt;VIP&gt;");
      expect(html).toContain("$727.00");
      expect(html).toContain("$15.00");
      expect(html).toContain("$58.16");
      expect(html).toContain("$800.16");
    });
  });

  describe("SimulatedEmailSender", () => {
    it("sends order confirmation and records sent emails in memory", async () => {
      const sender = createSimulatedEmailSender();
      expect(sender.getSentEmails()).toHaveLength(0);

      const result = await sender.sendOrderConfirmation(samplePayload);

      expect(result.ok).toBe(true);
      expect(result.messageId).toMatch(/^msg_[0-9a-f-]{36}$/);

      const sent = sender.getSentEmails();
      expect(sent).toHaveLength(1);
      expect(sent[0].to).toBe("customer@example.com");
      expect(sent[0].subject).toBe("Order Confirmation - JA-998877");
      expect(sent[0].payload.reference).toBe("JA-998877");
      expect(sent[0].payload.totalCents).toBe(80016);
      expect(sent[0].sentAt).toBeInstanceOf(Date);

      sender.clearSentEmails();
      expect(sender.getSentEmails()).toHaveLength(0);
    });

    it("throws an error when configured to fail", async () => {
      const sender = createSimulatedEmailSender({
        shouldFail: true,
        failureError: new Error("SMTP connection refused"),
      });

      await expect(sender.sendOrderConfirmation(samplePayload)).rejects.toThrow(
        "SMTP connection refused",
      );
      expect(sender.getSentEmails()).toHaveLength(0);
    });
  });

  describe("global singleton getEmailSender / getSentConfirmationEmails", () => {
    it("uses default simulated email sender across calls", async () => {
      const sender = getEmailSender();
      expect(getSentConfirmationEmails()).toHaveLength(0);

      const result = await sender.sendOrderConfirmation(samplePayload);
      expect(result.ok).toBe(true);

      const emails = getSentConfirmationEmails();
      expect(emails).toHaveLength(1);
      expect(emails[0].to).toBe("customer@example.com");

      clearSentEmails();
      expect(getSentConfirmationEmails()).toHaveLength(0);
    });
  });
});
