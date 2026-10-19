import { beforeEach, describe, expect, it } from "vitest";

import {
  clearSentAccessCodeEmails,
  createSimulatedAccessCodeEmailSender,
  getAccessCodeEmailSender,
  getSentAccessCodeEmails,
  renderAccessCodeHtml,
  renderAccessCodeSubject,
  renderAccessCodeText,
  setAccessCodeEmailSender,
} from "./access-code.ts";

describe("access-code email service", () => {
  beforeEach(() => {
    clearSentAccessCodeEmails();
  });

  it("renders subject, plain text and html with the 6-digit code and expiry", () => {
    const payload = {
      to: "customer@example.com",
      code: "839201",
      expiresMinutes: 15,
    };

    const subject = renderAccessCodeSubject();
    expect(subject).toBe("Your J. Armando Access Code");

    const text = renderAccessCodeText(payload);
    expect(text).toContain("Your J. Armando access code is 839201. It expires in 15 minutes.");
    expect(text).toContain("J. Armando");

    const html = renderAccessCodeHtml(payload);
    expect(html).toContain("839201");
    expect(html).toContain("expires in 15 minutes");
    expect(html).toContain("J. Armando");
  });

  it("records sent emails in simulated email sender", async () => {
    const sender = getAccessCodeEmailSender();
    const result = await sender.sendAccessCode({
      to: "customer@example.com",
      code: "123456",
      expiresMinutes: 15,
    });

    expect(result.ok).toBe(true);
    expect(result.messageId).toMatch(/^msg_/);

    const sent = getSentAccessCodeEmails();
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("customer@example.com");
    expect(sent[0].text).toContain("123456");

    clearSentAccessCodeEmails();
    expect(getSentAccessCodeEmails()).toHaveLength(0);
  });

  it("throws when shouldFail is true", async () => {
    const customSender = createSimulatedAccessCodeEmailSender({
      shouldFail: true,
      failureError: new Error("Mail server down"),
    });
    setAccessCodeEmailSender(customSender);

    await expect(
      customSender.sendAccessCode({
        to: "fail@example.com",
        code: "999999",
      }),
    ).rejects.toThrow("Mail server down");

    setAccessCodeEmailSender(null);
  });
});
