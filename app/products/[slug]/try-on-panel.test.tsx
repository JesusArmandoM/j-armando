import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TryOnPanel } from "./try-on-panel";
import type { TryOnPanelVariant } from "./try-on-panel";

const variants: TryOnPanelVariant[] = [
  { size: "S", color: "Camel", colorHex: "#C19A6B", stockQty: 0 },
  { size: "M", color: "Camel", colorHex: "#C19A6B", stockQty: 14 },
  { size: "L", color: "Camel", colorHex: "#C19A6B", stockQty: 9 },
  { size: "M", color: "Charcoal", colorHex: "#3B4045", stockQty: 11 },
  { size: "L", color: "Charcoal", colorHex: "#3B4045", stockQty: 6 },
];

function pngFile(bytes = new Uint8Array([137, 80, 78, 71])) {
  return new File([bytes], "me.png", { type: "image/png" });
}

function oversizedJpeg() {
  return new File([new Uint8Array(4 * 1024 * 1024 + 1)], "large.jpg", {
    type: "image/jpeg",
  });
}

function exactLimitPng() {
  const bytes = new Uint8Array(4 * 1024 * 1024);
  bytes.set([137, 80, 78, 71], 0);
  return new File([bytes], "limit.png", { type: "image/png" });
}

function stubFetch(handler: (url: string, init?: RequestInit) => unknown) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function okImage(base64 = "cmVzdWx0") {
  return {
    ok: true,
    status: 200,
    json: async () => ({ image: { kind: "base64", base64, mimeType: "image/png" } }),
  };
}

function renderPanel(panelVariants: TryOnPanelVariant[] = variants) {
  render(
    <TryOnPanel
      productSlug="longline-wool-overcoat"
      productName="Longline Wool Overcoat"
      variants={panelVariants}
    />,
  );
}

function chooseFile(file: File = pngFile()) {
  const input = screen.getByLabelText("Your photo") as HTMLInputElement;
  fireEvent.change(input, { target: { files: [file] } });
}

function acceptNotice() {
  fireEvent.click(screen.getByLabelText(/I understand this preview/));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("TryOnPanel", () => {
  it("keeps Try on disabled until a photo is chosen and the notice is accepted (scenario 6)", () => {
    stubFetch(() => okImage());
    renderPanel();

    const button = screen.getByRole("button", { name: "Try on" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);

    chooseFile();
    expect(button.disabled).toBe(true);

    acceptNotice();
    expect(button.disabled).toBe(false);

    fireEvent.click(screen.getByLabelText(/I understand this preview/));
    expect(button.disabled).toBe(true);
  });

  it("sends the selected garment context with consent and shows a loading state (scenarios 1 and 2)", async () => {
    let resolveResponse: (value: unknown) => void = () => {};
    const fetchMock = stubFetch(
      () => new Promise((resolve) => (resolveResponse = resolve)),
    );
    renderPanel();

    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "L" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Charcoal" } });
    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    expect(await screen.findByTestId("try-on-loading")).toBeTruthy();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/try-on");

    const form = fetchMock.mock.calls[0][1]?.body as FormData;
    expect(form.get("productSlug")).toBe("longline-wool-overcoat");
    expect(form.get("size")).toBe("L");
    expect(form.get("color")).toBe("Charcoal");
    expect(form.get("consent")).toBe("accepted");
    expect((form.get("photo") as File).name).toBe("me.png");

    resolveResponse(okImage());
    const image = await screen.findByTestId("try-on-result");
    expect(image.getAttribute("alt")).toBe(
      "Virtual try-on of you wearing the Longline Wool Overcoat in Charcoal",
    );
  });

  it("displays the single generated result with meaningful alt text (scenario 1)", async () => {
    stubFetch(() => okImage("YWJj"));
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    const images = await screen.findAllByTestId("try-on-result");
    expect(images).toHaveLength(1);
    expect(images[0].getAttribute("src")).toBe("data:image/png;base64,YWJj");
    expect(images[0].getAttribute("alt")).toBe(
      "Virtual try-on of you wearing the Longline Wool Overcoat in Camel",
    );
  });

  it("replaces the result on a new generation", async () => {
    let call = 0;
    stubFetch(() => okImage(call++ === 0 ? "Zmlyc3Q=" : "c2Vjb25k"));
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));
    await screen.findByTestId("try-on-result");

    fireEvent.click(screen.getByRole("button", { name: "Try on" }));
    await waitFor(() =>
      expect(screen.getByTestId("try-on-result").getAttribute("src")).toBe(
        "data:image/png;base64,c2Vjb25k",
      ),
    );
    expect(screen.getAllByTestId("try-on-result")).toHaveLength(1);
  });

  it("renders a result from any provider implementation unchanged (scenario 4)", async () => {
    stubFetch(() => ({
      ok: true,
      status: 200,
      json: async () => ({ image: { kind: "url", url: "https://provider.example/a.png" } }),
    }));
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    const image = await screen.findByTestId("try-on-result");
    expect(image.getAttribute("src")).toBe("https://provider.example/a.png");
  });

  it("shows an idle hint and limits the picker to JPG, PNG and WebP (scenario 1)", () => {
    stubFetch(() => okImage());
    renderPanel();

    expect(screen.getByTestId("try-on-hint").textContent).toBe(
      "Choose a JPG, PNG or WebP photo up to 4 MB.",
    );
    const input = screen.getByLabelText("Your photo") as HTMLInputElement;
    expect(input.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
  });

  it("rejects an unsupported declared type before any request (scenario 1)", () => {
    const fetchMock = stubFetch(() => okImage());
    renderPanel();

    chooseFile(new File([new Uint8Array([1, 2, 3])], "photo.gif", { type: "image/gif" }));

    expect(screen.getByTestId("try-on-error").textContent).toBe(
      "Choose a JPG, PNG or WebP photo.",
    );
    expect((screen.getByLabelText("Your photo") as HTMLInputElement).value).toBe("");
    acceptNotice();
    expect((screen.getByRole("button", { name: "Try on" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a photo larger than 4 MiB, clears it, and sends no request (scenario 2)", () => {
    const fetchMock = stubFetch(() => okImage());
    renderPanel();

    chooseFile(oversizedJpeg());

    expect(screen.getByTestId("try-on-error").textContent).toBe(
      "Choose a photo smaller than 4 MB.",
    );
    const input = screen.getByLabelText("Your photo") as HTMLInputElement;
    expect(input.value).toBe("");
    acceptNotice();
    expect((screen.getByRole("button", { name: "Try on" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts exactly 4 MiB (inclusive boundary) (scenario 2)", () => {
    const fetchMock = stubFetch(() => okImage());
    renderPanel();

    chooseFile(exactLimitPng());
    acceptNotice();

    expect(screen.queryByTestId("try-on-error")).toBeNull();
    const button = screen.getByRole("button", { name: "Try on" }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);

    fireEvent.click(button);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows timeout-specific copy and a 'Try again' action without a partial result (scenario 3)", async () => {
    stubFetch(() => ({
      ok: false,
      status: 504,
      json: async () => ({ code: "provider_timeout", error: "provider text" }),
    }));
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    const error = await screen.findByTestId("try-on-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(error.textContent).toBe("The try-on took too long to finish. Please try again.");
    expect(error.textContent).not.toContain("provider text");
    expect(screen.queryByTestId("try-on-result")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("keeps the photo, size, color and consent and retries the same photo after a provider error (scenario 4)", async () => {
    let call = 0;
    const fetchMock = stubFetch(() => {
      call += 1;
      if (call === 1) {
        return {
          ok: false,
          status: 502,
          json: async () => ({ code: "provider_error", error: "provider body" }),
        };
      }
      return okImage("c2Vjb25k");
    });
    renderPanel();

    fireEvent.change(screen.getByLabelText("Size"), { target: { value: "L" } });
    fireEvent.change(screen.getByLabelText("Color"), { target: { value: "Charcoal" } });
    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    const error = await screen.findByTestId("try-on-error");
    expect(error.textContent).toBe(
      "The try-on couldn't be completed right now. Please try again.",
    );
    expect(error.textContent).not.toContain("provider body");

    // Input survives in memory, so no re-upload is required.
    expect((screen.getByLabelText("Your photo") as HTMLInputElement).disabled).toBe(false);
    expect((screen.getByLabelText("Size") as HTMLSelectElement).value).toBe("L");
    expect((screen.getByLabelText("Color") as HTMLSelectElement).value).toBe("Charcoal");
    expect((screen.getByLabelText(/I understand this preview/) as HTMLInputElement).checked).toBe(
      true,
    );

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    const image = await screen.findByTestId("try-on-result");
    expect(image.getAttribute("src")).toBe("data:image/png;base64,c2Vjb25k");
    expect(screen.queryByTestId("try-on-error")).toBeNull();
    expect(screen.getAllByTestId("try-on-result")).toHaveLength(1);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = fetchMock.mock.calls[0][1]?.body as FormData;
    const second = fetchMock.mock.calls[1][1]?.body as FormData;
    const firstPhoto = first.get("photo") as File;
    const secondPhoto = second.get("photo") as File;
    expect(secondPhoto).toBe(firstPhoto);
    expect(second.get("size")).toBe("L");
    expect(second.get("color")).toBe("Charcoal");
    expect(second.get("consent")).toBe("accepted");
  });

  it("maps a network failure to clear copy and allows a retry", async () => {
    const fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    expect((await screen.findByTestId("try-on-error")).textContent).toBe(
      "The try-on couldn't be completed right now. Please try again.",
    );
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("clears the selection when the server rejects the photo and never enables a retry (scenario 1)", async () => {
    stubFetch(() => ({
      ok: false,
      status: 400,
      json: async () => ({ code: "invalid_photo", error: "server text" }),
    }));
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));

    const error = await screen.findByTestId("try-on-error");
    expect(error.textContent).toBe("Choose a JPG, PNG or WebP photo smaller than 4 MB.");
    expect((screen.getByLabelText("Your photo") as HTMLInputElement).value).toBe("");
    expect((screen.getByRole("button", { name: "Try on" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("keeps photos and results out of browser storage", async () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    stubFetch(() => okImage());
    renderPanel();

    chooseFile();
    acceptNotice();
    fireEvent.click(screen.getByRole("button", { name: "Try on" }));
    await screen.findByTestId("try-on-result");

    expect(setItem).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("marks out-of-stock colors and keeps them selectable for try-on", () => {
    stubFetch(() => okImage());
    renderPanel();

    const color = screen.getByLabelText("Color") as HTMLSelectElement;
    expect([...color.options].map((option) => option.textContent)).toContain(
      "Camel — Out of stock",
    );
    fireEvent.change(color, { target: { value: "Camel" } });
    expect(color.value).toBe("Camel");
  });

  it("shows an unavailable message when the product has no variants", () => {
    renderPanel([]);

    expect(screen.getByTestId("try-on-unavailable").textContent).toContain(
      "Virtual try-on is unavailable for this garment.",
    );
    expect(screen.queryByRole("button", { name: "Try on" })).toBeNull();
  });

  it("does not change price or stock messaging (garment context only)", () => {
    renderPanel();

    expect(screen.getByTestId("try-on-panel").textContent).not.toContain("$");
  });
});
