// Server composition for the chat route: repo-owned knowledge + the lazy
// published catalog reader + the lazily resolved provider, all behind the same
// ChatAssistant port. Importing this module opens no database pool and needs no
// provider key (docs/adr/0004-chat-assistant-guardrails.md).

import { listPublishedProductFacts } from "@/db/catalog.ts";
import { getDb } from "@/db/client.ts";
import type { ChatAnswer, ChatMessage } from "@/lib/chat/chat-assistant.ts";
import { createGuardedChatAssistant } from "@/lib/chat/guarded-chat-assistant.ts";
import { STORE_KNOWLEDGE } from "@/lib/chat/guardrails/store-knowledge.ts";
import { getChatAssistant } from "@/lib/chat/index.ts";

/** Answers one chat request through the guardrail decorator. */
export async function answerChat(messages: ChatMessage[]): Promise<ChatAnswer> {
  const assistant = createGuardedChatAssistant({
    assistantFactory: () => getChatAssistant(),
    knowledge: STORE_KNOWLEDGE,
    catalog: {
      listPublishedProducts: () => listPublishedProductFacts(getDb()),
    },
  });
  return assistant.answer(messages);
}
