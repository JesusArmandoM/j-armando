import { randomUUID } from "node:crypto";

export interface AccessCodeEmailPayload {
  to: string;
  code: string;
  expiresMinutes?: number;
}

export interface SentAccessCodeEmail {
  messageId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  payload: AccessCodeEmailPayload;
  sentAt: Date;
}

export interface AccessCodeEmailSender {
  sendAccessCode(
    payload: AccessCodeEmailPayload,
  ): Promise<{ ok: boolean; messageId: string }>;
  getSentEmails?(): SentAccessCodeEmail[];
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

export function renderAccessCodeSubject(): string {
  return "Your J. Armando Access Code";
}

export function renderAccessCodeText(payload: AccessCodeEmailPayload): string {
  const expires = payload.expiresMinutes ?? 15;
  return [
    "J. Armando",
    "",
    `Your J. Armando access code is ${payload.code}. It expires in ${expires} minutes.`,
    "",
    "If you did not request this code, you can safely ignore this email.",
  ].join("\n");
}

export function renderAccessCodeHtml(payload: AccessCodeEmailPayload): string {
  const expires = payload.expiresMinutes ?? 15;
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Your J. Armando Access Code</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #111; line-height: 1.5; padding: 24px;">
  <div style="max-width: 500px; margin: 0 auto; border: 1px solid #e5e5e5; padding: 32px;">
    <h1 style="font-size: 24px; font-weight: 600; margin-top: 0; letter-spacing: -0.02em;">J. Armando</h1>
    <p style="font-size: 16px; margin-bottom: 24px;">Your J. Armando access code is <strong>${escapeHtml(payload.code)}</strong>. It expires in ${expires} minutes.</p>
    <div style="background-color: #f5f5f5; padding: 16px; text-align: center; margin-bottom: 24px;">
      <span style="font-size: 32px; font-weight: 700; letter-spacing: 4px; font-family: monospace;">${escapeHtml(payload.code)}</span>
    </div>
    <p style="font-size: 14px; color: #777; margin-bottom: 0;">If you did not request this code, you can safely ignore this email.</p>
  </div>
</body>
</html>`;
}

export interface SimulatedAccessCodeEmailSenderOptions {
  shouldFail?: boolean;
  failureError?: Error;
}

export class SimulatedAccessCodeEmailSender implements AccessCodeEmailSender {
  private sentEmails: SentAccessCodeEmail[] = [];
  private options: SimulatedAccessCodeEmailSenderOptions;

  constructor(options: SimulatedAccessCodeEmailSenderOptions = {}) {
    this.options = options;
  }

  setOptions(options: SimulatedAccessCodeEmailSenderOptions): void {
    this.options = options;
  }

  async sendAccessCode(
    payload: AccessCodeEmailPayload,
  ): Promise<{ ok: boolean; messageId: string }> {
    if (this.options.shouldFail) {
      throw this.options.failureError ?? new Error("Simulated access code email delivery failure");
    }

    const messageId = `msg_${randomUUID()}`;
    const subject = renderAccessCodeSubject();
    const text = renderAccessCodeText(payload);
    const html = renderAccessCodeHtml(payload);

    const sentEmail: SentAccessCodeEmail = {
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

  getSentEmails(): SentAccessCodeEmail[] {
    return [...this.sentEmails];
  }

  clearSentEmails(): void {
    this.sentEmails = [];
  }
}

let defaultSender: SimulatedAccessCodeEmailSender | null = null;

export function createSimulatedAccessCodeEmailSender(
  options?: SimulatedAccessCodeEmailSenderOptions,
): SimulatedAccessCodeEmailSender {
  return new SimulatedAccessCodeEmailSender(options);
}

export function getAccessCodeEmailSender(): AccessCodeEmailSender {
  if (!defaultSender) {
    defaultSender = createSimulatedAccessCodeEmailSender();
  }
  return defaultSender;
}

export function setAccessCodeEmailSender(sender: SimulatedAccessCodeEmailSender | null): void {
  defaultSender = sender;
}

export function getSentAccessCodeEmails(): SentAccessCodeEmail[] {
  if (!defaultSender) {
    return [];
  }
  return defaultSender.getSentEmails();
}

export function clearSentAccessCodeEmails(): void {
  if (defaultSender) {
    defaultSender.clearSentEmails();
  }
}
