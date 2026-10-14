"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import type { ChatMessage } from "@/lib/chat/chat-assistant.ts";

// Storefront chat panel. Holds the conversation in ephemeral React state and
// talks only to POST /api/chat; it imports only the ChatAssistant port types,
// so swapping the adapter behind the port needs no change here (scenario 3).

const GENERIC_ERROR =
  "The assistant is unavailable right now. Please try again in a moment.";

export function ChatPanel() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;

    const withUserMessage: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(withUserMessage);
    setInput("");
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ messages: withUserMessage }),
      });

      if (!response.ok) {
        let message = GENERIC_ERROR;
        try {
          const data = (await response.json()) as { error?: unknown };
          if (typeof data?.error === "string" && data.error) message = data.error;
        } catch {
          // Keep the generic message.
        }
        setError(message);
        return;
      }

      const data = (await response.json()) as { reply?: unknown };
      if (typeof data?.reply !== "string" || data.reply.trim() === "") {
        setError("The assistant returned an empty answer. Please try again.");
        return;
      }
      setMessages((previous) => [
        ...previous,
        { role: "assistant", content: data.reply as string },
      ]);
    } catch {
      setError(GENERIC_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="chat" data-testid="chat">
      {open ? (
        <section className="chat__panel" aria-label="J. Armando Assistant">
          <header className="chat__header">
            <span className="chat__pip" aria-hidden="true" />
            <h2 className="chat__title">J. Armando Assistant</h2>
            <button
              type="button"
              className="chat__close"
              onClick={() => setOpen(false)}
              aria-label="Close assistant"
            >
              Close
            </button>
          </header>

          <div className="chat__log" role="log" aria-live="polite">
            {messages.length === 0 && (
              <p className="chat__intro">
                Ask about products, sizing, fabric and care, or shipping.
              </p>
            )}
            {messages.map((message, index) => (
              <p
                key={index}
                className={`chat__bubble chat__bubble--${message.role}`}
                data-testid={`chat-bubble-${message.role}`}
              >
                {message.content}
              </p>
            ))}
            {loading && (
              <p className="chat__loading" data-testid="chat-loading">
                Thinking&hellip;
              </p>
            )}
          </div>

          {error && (
            <p className="chat__error" role="alert" data-testid="chat-error">
              {error}
            </p>
          )}

          <form className="chat__form" onSubmit={handleSubmit}>
            <label className="chat__label" htmlFor="chat-input">
              Your question
            </label>
            <div className="chat__field">
              <input
                id="chat-input"
                className="chat__input"
                type="text"
                value={input}
                onChange={(event) => setInput(event.target.value)}
                disabled={loading}
                autoComplete="off"
              />
              <button
                type="submit"
                className="chat__send"
                disabled={loading || input.trim() === ""}
              >
                Send
              </button>
            </div>
          </form>
        </section>
      ) : (
        <button
          type="button"
          className="chat__launcher"
          onClick={() => setOpen(true)}
          aria-label="Open J. Armando Assistant"
          aria-expanded={false}
        >
          <span className="chat__pip" aria-hidden="true" />
          <span className="chat__launcher-label">Ask the assistant</span>
        </button>
      )}
    </div>
  );
}
