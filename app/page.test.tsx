import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Page from "./page";

describe("landing page", () => {
  it("renders the store name as the main heading", () => {
    render(<Page />);
    expect(
      screen.getByRole("heading", { level: 1, name: "J. Armando" }),
    ).toBeTruthy();
  });

  it("renders English copy and states USD pricing", () => {
    render(<Page />);
    expect(screen.getByText(/Prices in USD/)).toBeTruthy();
    expect(screen.getByText(/United States/)).toBeTruthy();
  });
});
