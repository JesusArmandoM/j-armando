import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogFilterOptions } from "@/db/catalog.ts";
import { FilterBar } from "./filter-bar";
import type { CatalogFilters } from "./filter-params";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

const options: CatalogFilterOptions = {
  categories: [
    { slug: "coats", name: "Coats" },
    { slug: "blazers", name: "Blazers" },
  ],
  sizes: ["XS", "S", "M", "L", "XL"],
  colors: ["Black", "Navy"],
};

const DEFAULT_FILTERS: CatalogFilters = { sort: "newest" };

beforeEach(() => {
  push.mockClear();
});

describe("FilterBar", () => {
  it("renders a labeled control for every facet and the sort", () => {
    render(<FilterBar options={options} current={DEFAULT_FILTERS} />);

    expect(screen.getByLabelText("Category")).toBeTruthy();
    expect(screen.getByLabelText("Size")).toBeTruthy();
    expect(screen.getByLabelText("Color")).toBeTruthy();
    expect(screen.getByLabelText("Max price")).toBeTruthy();
    expect(screen.getByLabelText("Sort")).toBeTruthy();
  });

  it("hides the reset affordance when no filter or sort is active", () => {
    render(<FilterBar options={options} current={DEFAULT_FILTERS} />);
    expect(screen.queryByRole("link", { name: "Reset" })).toBeNull();
  });

  it("pushes a new history entry when a size is selected", () => {
    render(<FilterBar options={options} current={DEFAULT_FILTERS} />);

    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "L" } });

    expect(push).toHaveBeenCalledWith("/catalog?size=L", { scroll: false });
  });

  it("combines a new facet with the current filters", () => {
    render(
      <FilterBar options={options} current={{ category: "blazers", sort: "newest" }} />,
    );

    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Navy" } });

    expect(push).toHaveBeenCalledWith("/catalog?category=blazers&color=Navy", { scroll: false });
  });

  it("pushes the sort param when a non-default sort is selected", () => {
    render(<FilterBar options={options} current={DEFAULT_FILTERS} />);

    fireEvent.change(screen.getByLabelText("Sort"), { target: { value: "name" } });

    expect(push).toHaveBeenCalledWith("/catalog?sort=name", { scroll: false });
  });

  it("shows a reset link to the bare catalog when a filter is active", () => {
    render(<FilterBar options={options} current={{ size: "M", sort: "newest" }} />);

    const reset = screen.getByRole("link", { name: "Reset" });
    expect(reset.getAttribute("href")).toBe("/catalog");
  });

  it("shows the reset link when only the sort is non-default", () => {
    render(<FilterBar options={options} current={{ sort: "price-asc" }} />);
    expect(screen.getByRole("link", { name: "Reset" })).toBeTruthy();
  });
});
