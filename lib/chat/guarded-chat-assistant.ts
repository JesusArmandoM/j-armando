// ChatAssistant decorator that makes policy, price and out-of-scope answers
// deterministic before any LLM call (docs/adr/0004-chat-assistant-guardrails.md).
//
// Policy questions are answered verbatim from the repo-owned knowledge module,
// prices come from the published-only catalog reader and are formatted from
// integer cents, and clearly unrelated requests get a fixed refusal. Only
// in-scope conversation reaches the configured provider, with verified facts
// injected as context; an unverified dollar amount in its reply is discarded.

import type { ChatAnswer, ChatAssistant, ChatMessage } from "./chat-assistant.ts";
import {
  CANNOT_CONFIRM_PRICE_REPLY,
  composeProductInfoAnswer,
  composeProductPriceAnswer,
  composeProductSizingAnswer,
  composePriceWithFactsAnswer,
  composeVerifiedFactsAnswer,
  formatProductGroundingFact,
} from "./guardrails/answer.ts";
import { guardLlmAnswer } from "./guardrails/answer-guard.ts";
import {
  OUT_OF_SCOPE_REPLY,
  hasPriceIntent,
  hasProductInfoIntent,
  hasSizingIntent,
  isOutOfScope,
  matchPolicyTopics,
} from "./guardrails/intents.ts";
import { GUARDRAIL_INSTRUCTIONS } from "./guardrails/instructions.ts";
import { matchProducts } from "./guardrails/product-match.ts";
import type { ProductFact } from "./guardrails/product-match.ts";
import { STORE_KNOWLEDGE } from "./guardrails/store-knowledge.ts";
import type { VerifiedFact } from "./guardrails/store-knowledge.ts";

/** Published-only catalog facts the decorator may price and ground answers with. */
export interface ChatCatalogReader {
  listPublishedProducts(): Promise<readonly ProductFact[]>;
}

export interface GuardedChatAssistantOptions {
  /** Lazy provider factory; only invoked when a question is in scope. */
  assistantFactory: () => ChatAssistant;
  /** Lazy published catalog reader (DB-backed in composition.ts). */
  catalog: ChatCatalogReader;
  knowledge?: readonly VerifiedFact[];
}

function latestUserMessage(messages: readonly ChatMessage[]): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index].role === "user") return messages[index].content;
  }
  return undefined;
}

/** Latest user message plus the two before it, for follow-ups like "and how much is it?". */
function lookupTexts(messages: readonly ChatMessage[]): { latest: string; withAntecedent: string } {
  const userTexts = messages
    .filter((message) => message.role === "user")
    .map((message) => message.content);
  const latest = userTexts.at(-1) ?? "";
  const previous = userTexts.slice(-3, -1).join(" ");
  return {
    latest,
    withAntecedent: previous === "" ? latest : `${previous} ${latest}`,
  };
}

/** Matches on the latest message first; only a miss falls back to earlier turns. */
function matchWithAntecedent(
  messages: readonly ChatMessage[],
  facts: readonly ProductFact[],
): ProductFact[] {
  const { latest, withAntecedent } = lookupTexts(messages);
  const direct = matchProducts(latest, facts);
  if (direct.length > 0) return direct;
  return withAntecedent === latest ? [] : matchProducts(withAntecedent, facts);
}

export function createGuardedChatAssistant(
  options: GuardedChatAssistantOptions,
): ChatAssistant {
  const knowledge = options.knowledge ?? STORE_KNOWLEDGE;

  async function readPublishedProducts(): Promise<ProductFact[] | null> {
    try {
      return [...(await options.catalog.listPublishedProducts())];
    } catch {
      return null;
    }
  }

  return {
    async answer(messages: ChatMessage[]): Promise<ChatAnswer> {
      const latest = latestUserMessage(messages);
      if (latest === undefined || latest.trim() === "") {
        return { content: OUT_OF_SCOPE_REPLY };
      }

      const facts = matchPolicyTopics(latest, knowledge);

      // Policy questions: answered verbatim, never generated. A catalog failure
      // cannot degrade a policy answer, so it simply skips the optional price.
      if (facts.length > 0) {
        if (hasPriceIntent(latest)) {
          const products = await readPublishedProducts();
          const matched =
            products === null ? [] : matchWithAntecedent(messages, products);
          if (matched.length > 0) {
            return { content: composePriceWithFactsAnswer(matched, facts) };
          }
        }
        return { content: composeVerifiedFactsAnswer(facts) };
      }

      // Price questions: published catalog rows only, never the LLM.
      if (hasPriceIntent(latest)) {
        const products = await readPublishedProducts();
        if (products === null) {
          return { content: CANNOT_CONFIRM_PRICE_REPLY };
        }
        return { content: composeProductPriceAnswer(matchWithAntecedent(messages, products)) };
      }

      // Clearly unrelated requests: fixed refusal, no generated content.
      if (isOutOfScope(latest)) {
        return { content: OUT_OF_SCOPE_REPLY };
      }

      // Sizing/fit: answer from published variants, never from the LLM.
      if (hasSizingIntent(latest)) {
        const products = await readPublishedProducts();
        const matched =
          products === null ? [] : matchWithAntecedent(messages, products);
        return { content: composeProductSizingAnswer(matched) };
      }

      // Style/fabric/care/availability: answer from published product facts.
      if (hasProductInfoIntent(latest)) {
        const products = await readPublishedProducts();
        const matched =
          products === null ? [] : matchWithAntecedent(messages, products);
        if (matched.length > 0) {
          return { content: composeProductInfoAnswer(matched) };
        }
      }

      // In-scope conversation: ground the provider with verified facts only.
      const products = (await readPublishedProducts()) ?? [];
      const matched = matchWithAntecedent(messages, products);
      const verifiedFacts = [
        ...facts.map((fact) => fact.answer),
        ...matched.map(formatProductGroundingFact),
      ];

      const reply = await options.assistantFactory().answer(messages, {
        verifiedFacts,
        instructions: GUARDRAIL_INSTRUCTIONS,
      });
      return { content: guardLlmAnswer(reply.content, verifiedFacts) };
    },
  };
}
