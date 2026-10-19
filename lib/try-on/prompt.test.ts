import { describe, expect, it } from "vitest";

import { buildTryOnPrompt } from "./prompt.ts";

describe("buildTryOnPrompt", () => {
  const input = {
    productName: "Longline Wool Overcoat",
    color: "Camel",
    size: "M",
    composition: "Shell: 70% wool, 20% polyester, 10% cashmere.",
  };

  it("includes the product name, selected color, size and composition", () => {
    const prompt = buildTryOnPrompt(input);

    expect(prompt).toContain("Longline Wool Overcoat");
    expect(prompt).toContain("Camel");
    expect(prompt).toContain("size M");
    expect(prompt).toContain("Shell: 70% wool, 20% polyester, 10% cashmere.");
  });

  it("instructs the model to dress the person and preserve their identity", () => {
    const prompt = buildTryOnPrompt(input);

    expect(prompt.toLowerCase()).toContain("wearing");
    expect(prompt.toLowerCase()).toContain("preserve their identity");
    expect(prompt.toLowerCase()).toContain("photorealistic");
  });

  it("forbids text, logos and watermarks", () => {
    const prompt = buildTryOnPrompt(input).toLowerCase();

    expect(prompt).toContain("do not add text");
    expect(prompt).toContain("logos");
    expect(prompt).toContain("watermarks");
  });

  it("is deterministic and changes with the garment context", () => {
    expect(buildTryOnPrompt(input)).toBe(buildTryOnPrompt(input));
    expect(buildTryOnPrompt({ ...input, color: "Charcoal" })).not.toBe(
      buildTryOnPrompt(input),
    );
  });
});
