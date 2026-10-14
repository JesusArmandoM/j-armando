# ADR 0003 — Chat assistant uses OpenAI Chat Completions behind the `ChatAssistant` port

- Status: accepted
- Date: 2026-10-14
- Decided during: `chat-assistant`
- Source spec: `docs/specs/chat-assistant.md`

## Context

The storefront needs a chat assistant that answers product, sizing, fabric/care and shipping questions. `docs/technical-discovery.md` listed the LLM provider as an undecided integration, and `docs/risks-and-open-questions.md` tracked provider selection as a research task. Constraints from the surrounding decisions:

- External capabilities must sit behind repo-owned ports so providers are swappable/simulatable without touching store code (`ARCHITECTURE.md` → Layering Intent).
- The automated gate (`./init.sh`) must stay deterministic, free and key-free: no live provider calls and no configured API key (`CONSTRAINTS.md`).
- The app must build and boot without a provider key (configuration is read lazily).
- Market is US/USD with English copy; the assistant's topics are products, sizing, fabric/care and shipping.

## Decision

Use **OpenAI Chat Completions** as the first adapter behind the repo-owned `ChatAssistant` port.

- Port: `lib/chat/chat-assistant.ts` (`ChatMessage`, `ChatAnswer`, `ChatAssistant`, `ChatAssistantError`, `CHAT_SYSTEM_PROMPT`).
- Adapter: `lib/chat/openai-chat-assistant.ts` — `POST {baseUrl}/chat/completions`, bearer `Authorization`, `model`, system prompt + conversation, low temperature; parses `choices[0].message.content`.
- Factory: `lib/chat/index.ts` — `getChatAssistant()` reads `OPENAI_API_KEY`, `CHAT_ASSISTANT_MODEL` (default `gpt-4o-mini`) and optional `OPENAI_BASE_URL` lazily and caches one instance.
- Server seam: `app/api/chat/route.ts` (`POST`) — validates `{ messages }`, returns `{ reply }`; 400 malformed, 503 missing key, 502 provider error.
- UI: `app/chat/chat-panel.tsx` — talks only to `POST /api/chat` and imports only the port types.

Reasons:

- **Narrow, well-known HTTP contract.** Chat Completions is a stable, documented endpoint that is easy to fake offline (an injected `fetch` and an in-process HTTP server), which keeps the automated gate network-free.
- **Port-first.** The provider is an implementation detail behind `ChatAssistant`; swapping to another provider or a compatible gateway (`OPENAI_BASE_URL`) needs no UI or route change.
- **Lazy, optional configuration.** Missing `OPENAI_API_KEY` degrades to a 503 plus an in-panel error line instead of breaking the build or boot.

Rejected alternatives:

- **Another hosted provider (Anthropic/Google) first** — deferred, not rejected: nothing about the port blocks it; only the first adapter is chosen here.
- **A vendor SDK dependency** — rejected for this slice: a direct `fetch` adapter avoids a dependency, is trivially injectable for tests, and keeps the request shape explicit.
- **Tool-calling / catalog retrieval now** — out of scope (a later grounding feature; price correctness is owned by `chat-assistant-guardrails`).

Companion choices made here (see `ARCHITECTURE.md`, `CONSTRAINTS.md`, the spec):

- Conversations are **ephemeral** for this slice: the panel holds history in React state and the server is stateless (no database). Persistence/ownership is a follow-up.
- Streaming is deferred; one request returns the complete answer.
- The automated suite **never** calls the live provider: the adapter is proved with an injected `fetch` and an in-process HTTP server (constraint 5 in `CONSTRAINTS.md`). A live-provider run is a recorded manual check only.
- Prompt scoping (products/sizing/fabric-care/shipping) lives in the port; verified-policy/no-fabrication guardrails are owned by `chat-assistant-guardrails`.

## Consequences

- `OPENAI_API_KEY`, `CHAT_ASSISTANT_MODEL` and `OPENAI_BASE_URL` become the chat provider's configuration surface (documented in `.env.example`).
- The port is the stable seam: adding guardrails (a decorator around `ChatAssistant`) or a different provider is a drop-in change.
- Cost, latency and data-handling terms for OpenAI must be revisited before public launch; per the risks doc this is a recorded production consideration.
- A future persistence feature will introduce `Conversation`/`Message` tables and move history server-side; the current route is intentionally stateless.
