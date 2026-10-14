import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./chat-panel";

// Minimal Response stand-in: the panel only reads `ok`, `status` and `json()`.
function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
    handler(url, init),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okReply(reply: string) {
  return { ok: true, status: 200, json: async () => ({ reply }) };
}

function errorReply(error: string, status = 502) {
  return { ok: false, status, json: async () => ({ error }) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function openPanel() {
  render(<ChatPanel />);
  fireEvent.click(
    screen.getByRole("button", { name: /open j\. armando assistant/i }),
  );
  return screen.getByLabelText("Your question");
}

function ask(input: HTMLElement, question: string) {
  fireEvent.change(input, { target: { value: question } });
  fireEvent.click(screen.getByRole("button", { name: "Send" }));
}

describe("ChatPanel", () => {
  it("answers a product, sizing, fabric and shipping question each with a non-empty reply (scenario 1)", async () => {
    const fetchMock = stubFetch(() => okReply("A considered answer."));
    const input = openPanel();

    const questions = [
      "What is the longline overcoat made of?",
      "How does sizing run?",
      "How should I care for the merino blazer?",
      "When will my order ship?",
    ];

    for (const [index, question] of questions.entries()) {
      ask(input, question);
      await waitFor(() =>
        expect(screen.getAllByTestId("chat-bubble-assistant")).toHaveLength(
          index + 1,
        ),
      );
    }

    const userBubbles = screen.getAllByTestId("chat-bubble-user");
    expect(userBubbles).toHaveLength(questions.length);
    for (const [index, question] of questions.entries()) {
      expect(userBubbles[index].textContent).toBe(question);
    }

    const assistantBubbles = screen.getAllByTestId("chat-bubble-assistant");
    expect(assistantBubbles).toHaveLength(questions.length);
    for (const bubble of assistantBubbles) {
      expect(bubble.textContent?.trim()).not.toBe("");
    }

    // Every question reached the server endpoint verbatim.
    const forwarded = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body)).messages,
    );
    questions.forEach((question, index) => {
      expect(forwarded[index].at(-1)).toEqual({ role: "user", content: question });
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/chat");
  });

  it("renders an assistant reply from any implementation unchanged (scenario 3)", async () => {
    stubFetch(() => okReply("Sizes run true to measure; size up for a relaxed fit."));
    const input = openPanel();

    ask(input, "How does the blazer fit?");

    const bubble = await screen.findByTestId("chat-bubble-assistant");
    expect(bubble.textContent).toBe(
      "Sizes run true to measure; size up for a relaxed fit.",
    );
  });

  it("shows an error line on provider failure and stays usable (scenario 4)", async () => {
    stubFetch(() => errorReply("The chat provider returned an error (HTTP 502)."));
    const input = openPanel();

    ask(input, "Hello?");

    const errorLine = await screen.findByTestId("chat-error");
    expect(errorLine.getAttribute("role")).toBe("alert");
    expect(errorLine.textContent).toContain("error");

    // The panel remains usable: the input is enabled and a retry can succeed.
    expect((input as HTMLInputElement).disabled).toBe(false);
    stubFetch(() => okReply("Back online."));
    ask(input, "Are you there?");
    await screen.findByText("Back online.");
  });

  it("shows a plain error line (no crash) on a network failure (scenario 4)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("network down");
      }),
    );
    const input = openPanel();

    ask(input, "Hello?");

    expect(await screen.findByTestId("chat-error")).toBeTruthy();
    expect(screen.getByLabelText("Your question")).toBeTruthy();
  });

  it("opens and closes accessibly with a labelled input (scenario 5)", async () => {
    stubFetch(() => okReply("Hello."));

    render(<ChatPanel />);
    const launcher = screen.getByRole("button", {
      name: "Open J. Armando Assistant",
    });
    expect(launcher).toBeTruthy();

    fireEvent.click(launcher);

    const panel = screen.getByRole("region", { name: "J. Armando Assistant" });
    expect(panel).toBeTruthy();
    const input = screen.getByLabelText("Your question");
    expect(input).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Close assistant" }));

    // On close the launcher is restored and reachable again.
    expect(
      screen.getByRole("button", { name: "Open J. Armando Assistant" }),
    ).toBeTruthy();
    expect(screen.queryByRole("region", { name: "J. Armando Assistant" })).toBeNull();
  });

  it("disables Send until there is input", () => {
    stubFetch(() => okReply("Hello."));
    openPanel();

    const send = screen.getByRole("button", { name: "Send" });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Your question"), {
      target: { value: "Hi" },
    });
    expect((send as HTMLButtonElement).disabled).toBe(false);
  });
});
