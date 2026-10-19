// ChatAssistant port: the storefront's chat capability expressed as a narrow
// interface. Providers (OpenAI today) are adapters behind this port, so the UI
// and route handler never depend on a concrete provider. See
// ARCHITECTURE.md → Layering Intent and CONSTRAINTS.md → AI providers.

/** A single turn in a conversation. Only these two roles are exchanged. */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

/** A complete (non-streaming) answer from the assistant. */
export interface ChatAnswer {
  content: string;
}

/**
 * Optional grounding passed by the guardrail decorator. `verifiedFacts` are the
 * only authoritative store facts for this answer; `instructions` are grounding
 * and refusal rules. Providers must treat both as system-level context and must
 * never merge user message text into it.
 */
export interface ChatAnswerContext {
  verifiedFacts?: readonly string[];
  instructions?: string;
}

/** The storefront-facing chat capability. */
export interface ChatAssistant {
  answer(messages: ChatMessage[], context?: ChatAnswerContext): Promise<ChatAnswer>;
}

/**
 * Error kinds a caller can react to. `configuration` means the adapter is not
 * usable yet (e.g. a missing API key) and maps to HTTP 503; `provider` means the
 * upstream provider failed or returned something unusable and maps to HTTP 502.
 */
export type ChatAssistantErrorKind = "configuration" | "provider";

/** Typed error surfaced by every {@link ChatAssistant} adapter. */
export class ChatAssistantError extends Error {
  readonly kind: ChatAssistantErrorKind;
  /** Upstream HTTP status, when the failure came from a provider response. */
  readonly status?: number;

  constructor(
    message: string,
    options: { kind?: ChatAssistantErrorKind; status?: number; cause?: unknown } = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ChatAssistantError";
    this.kind = options.kind ?? "provider";
    this.status = options.status;
  }
}

/**
 * System prompt for the J. Armando storefront assistant. English (US market),
 * scoped to products, sizing, fabric/care and shipping. It deliberately does
 * not ask the model to invent policies or prices (that behaviour — verified
 * policy/price grounding and refusal — is owned by `chat-assistant-guardrails`).
 */
export const CHAT_SYSTEM_PROMPT = [
  "You are the J. Armando store assistant, a quiet and knowledgeable guide for a US clothing house.",
  "Help shoppers with: product questions (garments, materials, fit and styling), sizing, fabric and care, and shipping.",
  "Answer in clear, concise English. Be warm, precise and never pushy.",
  "Do not invent prices, shipping costs, return policies or order details; if you are unsure, say you are not certain and suggest contacting the store.",
  "Keep answers short — a few sentences at most — and ask a clarifying question only when it is genuinely needed.",
].join(" ");
