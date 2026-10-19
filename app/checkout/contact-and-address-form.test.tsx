import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ContactAndAddressForm } from "./contact-and-address-form.tsx";
import type { CheckoutSessionData } from "./contact-and-address-form.tsx";

const refreshMock = vi.fn();
const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: pushMock,
  }),
}));

const mockSession: CheckoutSessionData = {
  id: "session-1",
  email: "alexandra.vance@studio.com",
  recipientName: "Alexandra Vance",
  line1: "123 Main Street",
  line2: "Apt 4B",
  city: "New York",
  state: "NY",
  zip: "10001",
  country: "US",
  phone: "+1 555-019-2834",
};

describe("ContactAndAddressForm", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the empty form with all fields when no initial session is present", () => {
    render(<ContactAndAddressForm />);

    expect(screen.getByTestId("step-contact-and-address")).toBeTruthy();
    expect(screen.getByTestId("input-email")).toBeTruthy();
    expect(screen.getByTestId("input-recipient-name")).toBeTruthy();
    expect(screen.getByTestId("input-line1")).toBeTruthy();
    expect(screen.getByTestId("input-line2")).toBeTruthy();
    expect(screen.getByTestId("input-city")).toBeTruthy();
    expect(screen.getByTestId("select-state")).toBeTruthy();
    expect(screen.getByTestId("input-zip")).toBeTruthy();
    expect(screen.getByTestId("input-country")).toBeTruthy();
    expect(screen.getByTestId("input-phone")).toBeTruthy();
    expect(screen.getByTestId("checkout-submit-address")).toBeTruthy();

    // Step 2 is in upcoming state
    expect(screen.getByText("Pending Step 1")).toBeTruthy();
  });

  it("shows inline validation errors when submitting with empty required fields", async () => {
    render(<ContactAndAddressForm />);

    const submitBtn = screen.getByTestId("checkout-submit-address");
    fireEvent.click(submitBtn);

    const emailErr = await screen.findByTestId("error-email");
    expect(emailErr.textContent).toBe("Email is required");
    expect(screen.getByTestId("error-recipient-name").textContent).toBe(
      "Recipient full name is required",
    );
    expect(screen.getByTestId("error-line1").textContent).toBe("Street address is required");
    expect(screen.getByTestId("error-city").textContent).toBe("City is required");
    expect(screen.getByTestId("error-zip").textContent).toBe("ZIP code is required");
  });

  it("shows inline validation errors for invalid email and invalid ZIP", async () => {
    render(<ContactAndAddressForm />);

    fireEvent.change(screen.getByTestId("input-email"), { target: { value: "invalid-email" } });
    fireEvent.change(screen.getByTestId("input-recipient-name"), {
      target: { value: "Alexandra Vance" },
    });
    fireEvent.change(screen.getByTestId("input-line1"), { target: { value: "123 Main St" } });
    fireEvent.change(screen.getByTestId("input-city"), { target: { value: "New York" } });
    fireEvent.change(screen.getByTestId("input-zip"), { target: { value: "abc" } });

    fireEvent.click(screen.getByTestId("checkout-submit-address"));

    const emailErr = await screen.findByTestId("error-email");
    expect(emailErr.textContent).toBe("Please enter a valid email address");
    expect(screen.getByTestId("error-zip").textContent).toBe(
      "Please enter a valid US ZIP code (e.g. 10001 or 10001-1234)",
    );
  });

  it("submits valid details, advances to completed Step 1 summary, and activates Step 2", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        checkoutSession: mockSession,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactAndAddressForm />);

    fireEvent.change(screen.getByTestId("input-email"), {
      target: { value: "alexandra.vance@studio.com" },
    });
    fireEvent.change(screen.getByTestId("input-recipient-name"), {
      target: { value: "Alexandra Vance" },
    });
    fireEvent.change(screen.getByTestId("input-line1"), {
      target: { value: "123 Main Street" },
    });
    fireEvent.change(screen.getByTestId("input-line2"), { target: { value: "Apt 4B" } });
    fireEvent.change(screen.getByTestId("input-city"), { target: { value: "New York" } });
    fireEvent.change(screen.getByTestId("select-state"), { target: { value: "NY" } });
    fireEvent.change(screen.getByTestId("input-zip"), { target: { value: "10001" } });
    fireEvent.change(screen.getByTestId("input-phone"), {
      target: { value: "+1 555-019-2834" },
    });

    fireEvent.click(screen.getByTestId("checkout-submit-address"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/checkout/contact-and-address",
        expect.objectContaining({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "alexandra.vance@studio.com",
            recipientName: "Alexandra Vance",
            line1: "123 Main Street",
            line2: "Apt 4B",
            city: "New York",
            state: "NY",
            zip: "10001",
            country: "US",
            phone: "+1 555-019-2834",
          }),
        }),
      );
    });

    // Summary card is displayed
    const summaryCard = await screen.findByTestId("address-summary-card");
    expect(summaryCard).toBeTruthy();
    expect(screen.getByTestId("summary-email").textContent).toBe(
      "alexandra.vance@studio.com",
    );
    expect(screen.getByTestId("summary-recipient-name").textContent).toBe(
      "Alexandra Vance",
    );
    expect(screen.getByTestId("summary-address").textContent).toBe(
      "123 Main Street, Apt 4B",
    );
    expect(screen.getByTestId("summary-location").textContent).toBe("New York, NY 10001");
    expect(screen.getByTestId("summary-phone").textContent).toBe("Phone: +1 555-019-2834");

    // Step 2 is ready
    expect(screen.getByTestId("shipping-step-ready").textContent).toBe(
      "Ready for Selection",
    );

    vi.unstubAllGlobals();
  });

  it("renders completed summary card directly when initialSession is provided", () => {
    render(<ContactAndAddressForm initialSession={mockSession} />);

    expect(screen.getByTestId("address-summary-card")).toBeTruthy();
    expect(screen.getByTestId("summary-email").textContent).toBe(
      "alexandra.vance@studio.com",
    );
    expect(screen.getByTestId("summary-recipient-name").textContent).toBe(
      "Alexandra Vance",
    );
    expect(screen.getByTestId("shipping-step-ready")).toBeTruthy();
  });

  it("clicking Modify opens form with pre-populated values, allowing updates", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        checkoutSession: {
          ...mockSession,
          line1: "456 Broadway",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactAndAddressForm initialSession={mockSession} />);

    // Click modify
    const editBtn = screen.getByTestId("edit-contact-address");
    fireEvent.click(editBtn);

    // Form is now visible with values pre-populated
    const line1Input = screen.getByTestId("input-line1") as HTMLInputElement;
    expect(line1Input.value).toBe("123 Main Street");
    expect((screen.getByTestId("input-email") as HTMLInputElement).value).toBe(
      "alexandra.vance@studio.com",
    );

    // Update address line 1
    fireEvent.change(line1Input, { target: { value: "456 Broadway" } });

    fireEvent.click(screen.getByTestId("checkout-submit-address"));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const updatedAddr = await screen.findByTestId("summary-address");
    expect(updatedAddr.textContent).toBe("456 Broadway, Apt 4B");

    vi.unstubAllGlobals();
  });

  it("displays server error when API returns 400 with errors object", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Please correct the errors in the form.",
        errors: {
          email: "Invalid email domain.",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<ContactAndAddressForm />);

    fireEvent.change(screen.getByTestId("input-email"), {
      target: { value: "test@domain.com" },
    });
    fireEvent.change(screen.getByTestId("input-recipient-name"), {
      target: { value: "User" },
    });
    fireEvent.change(screen.getByTestId("input-line1"), { target: { value: "Street" } });
    fireEvent.change(screen.getByTestId("input-city"), { target: { value: "City" } });
    fireEvent.change(screen.getByTestId("input-zip"), { target: { value: "10001" } });

    fireEvent.click(screen.getByTestId("checkout-submit-address"));

    const emailErr = await screen.findByTestId("error-email");
    expect(emailErr.textContent).toBe("Invalid email domain.");

    vi.unstubAllGlobals();
  });

  it("completing Step 2 activates Step 3 (Ready for Payment)", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("shipping-method")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            ok: true,
            checkoutSession: {
              ...mockSession,
              shippingMethodId: "d0000000-0000-4000-8000-000000000001",
              shippingMethod: {
                id: "d0000000-0000-4000-8000-000000000001",
                slug: "standard",
                name: "Standard Shipping",
                description: "Free standard shipping across the United States.",
                costCents: 0,
                deliveryEstimate: "3–5 business days",
              },
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, checkoutSession: mockSession }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    // Initial state with Step 1 completed
    render(<ContactAndAddressForm initialSession={mockSession} />);

    // Step 2 is ready for selection
    expect(screen.getByTestId("shipping-step-ready")).toBeTruthy();
    expect(screen.getByTestId("checkout-submit-shipping")).toBeTruthy();

    // Step 3 is currently pending
    expect(screen.queryByTestId("payment-step-ready")).toBeNull();

    // Select standard shipping and submit
    fireEvent.click(screen.getByTestId("radio-shipping-standard"));
    fireEvent.click(screen.getByTestId("checkout-submit-shipping"));

    // Step 2 displays completed summary card
    const shippingSummary = await screen.findByTestId("shipping-summary-card");
    expect(shippingSummary).toBeTruthy();
    expect(screen.getByTestId("summary-shipping-name").textContent).toBe(
      "Standard Shipping",
    );

    // Step 3 is now activated
    const paymentReady = await screen.findByTestId("payment-step-ready");
    expect(paymentReady.textContent).toBe("Ready for Payment");
    expect(screen.getByTestId("payment-step-content")).toBeTruthy();
    expect(screen.getByTestId("place-order-button")).toBeTruthy();

    vi.unstubAllGlobals();
  });

  it("renders Place Order button with total amount and redirects to confirmation on payment success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        reference: "JA-998877",
        redirectUrl: "/checkout/confirmation/JA-998877",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const sessionWithShipping: CheckoutSessionData = {
      ...mockSession,
      shippingMethodId: "standard-id",
      shippingMethod: {
        id: "standard-id",
        slug: "standard",
        name: "Standard Shipping",
        description: "Free standard shipping",
        costCents: 0,
        deliveryEstimate: "3-5 business days",
      },
    };

    render(
      <ContactAndAddressForm
        initialSession={sessionWithShipping}
        subtotalCents={24900}
        totalCents={26892}
      />,
    );

    expect(screen.getByTestId("payment-step-ready")).toBeTruthy();
    expect(screen.getByTestId("payment-total-amount").textContent).toContain("$268.92");

    const payBtn = screen.getByTestId("place-order-button");
    expect(payBtn.textContent).toBe("Place Order (Simulated)");

    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "succeed" }),
      });
      expect(pushMock).toHaveBeenCalledWith("/checkout/confirmation/JA-998877");
    });

    vi.unstubAllGlobals();
  });

  it("displays error message when payment simulation fails", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        error: "Card declined by simulated provider.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const sessionWithShipping: CheckoutSessionData = {
      ...mockSession,
      shippingMethodId: "standard-id",
      shippingMethod: {
        id: "standard-id",
        slug: "standard",
        name: "Standard Shipping",
        description: "Free standard shipping",
        costCents: 0,
        deliveryEstimate: "3-5 business days",
      },
    };

    render(
      <ContactAndAddressForm
        initialSession={sessionWithShipping}
        subtotalCents={24900}
        totalCents={26892}
      />,
    );

    const payBtn = screen.getByTestId("place-order-button");
    fireEvent.click(payBtn);

    const errorMsg = await screen.findByTestId("payment-error");
    expect(errorMsg.textContent).toBe("Card declined by simulated provider.");
    expect((payBtn as HTMLButtonElement).disabled).toBe(false);

    vi.unstubAllGlobals();
  });

  it("displays out of stock error and return to cart link when API returns out_of_stock", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({
        ok: false,
        code: "out_of_stock",
        error:
          "One or more items in your cart are no longer available in the requested quantity. Please review your cart.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const sessionWithShipping: CheckoutSessionData = {
      ...mockSession,
      shippingMethodId: "standard-id",
      shippingMethod: {
        id: "standard-id",
        slug: "standard",
        name: "Standard Shipping",
        description: "Free standard shipping",
        costCents: 0,
        deliveryEstimate: "3-5 business days",
      },
    };

    render(
      <ContactAndAddressForm
        initialSession={sessionWithShipping}
        subtotalCents={24900}
        totalCents={26892}
      />,
    );

    const payBtn = screen.getByTestId("place-order-button");
    fireEvent.click(payBtn);

    const errorMsg = await screen.findByTestId("payment-error");
    expect(errorMsg.textContent).toContain(
      "One or more items in your cart are no longer available in the requested quantity",
    );

    const cartLink = screen.getByTestId("out-of-stock-cart-link");
    expect(cartLink.getAttribute("href")).toBe("/cart");
    expect(cartLink.textContent).toBe("Return to cart");
    expect((payBtn as HTMLButtonElement).disabled).toBe(false);

    vi.unstubAllGlobals();
  });

  it("allows selecting simulated failure scenario and displays failure error with enabled retry", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({
        ok: false,
        error: "Payment failed: The payment was declined. Please try another payment method.",
        code: "payment_failed",
        retryable: true,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const sessionWithShipping: CheckoutSessionData = {
      ...mockSession,
      shippingMethodId: "standard-id",
      shippingMethod: {
        id: "standard-id",
        slug: "standard",
        name: "Standard Shipping",
        description: "Free standard shipping",
        costCents: 0,
        deliveryEstimate: "3-5 business days",
      },
    };

    render(
      <ContactAndAddressForm
        initialSession={sessionWithShipping}
        subtotalCents={24900}
        totalCents={26892}
      />,
    );

    // Select fail scenario
    const failRadio = screen.getByTestId("scenario-fail");
    fireEvent.click(failRadio);
    expect((failRadio as HTMLInputElement).checked).toBe(true);

    const payBtn = screen.getByTestId("place-order-button");
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("/api/checkout/pay", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenario: "fail" }),
      });
    });

    const errorMsg = await screen.findByTestId("payment-error");
    expect(errorMsg.textContent).toBe(
      "Payment failed: The payment was declined. Please try another payment method.",
    );
    expect((payBtn as HTMLButtonElement).disabled).toBe(false);

    vi.unstubAllGlobals();
  });

  it("allows retrying payment after failure and redirects on success", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({
          ok: false,
          error: "Payment failed: The payment was declined. Please try another payment method.",
          code: "payment_failed",
          retryable: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          reference: "JA-554433",
          redirectUrl: "/checkout/confirmation/JA-554433",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const sessionWithShipping: CheckoutSessionData = {
      ...mockSession,
      shippingMethodId: "standard-id",
      shippingMethod: {
        id: "standard-id",
        slug: "standard",
        name: "Standard Shipping",
        description: "Free standard shipping",
        costCents: 0,
        deliveryEstimate: "3-5 business days",
      },
    };

    render(
      <ContactAndAddressForm
        initialSession={sessionWithShipping}
        subtotalCents={24900}
        totalCents={26892}
      />,
    );

    // Initial attempt: fail
    const failRadio = screen.getByTestId("scenario-fail");
    fireEvent.click(failRadio);

    const payBtn = screen.getByTestId("place-order-button");
    fireEvent.click(payBtn);

    const errorMsg = await screen.findByTestId("payment-error");
    expect(errorMsg.textContent).toContain("Payment failed");
    expect((payBtn as HTMLButtonElement).disabled).toBe(false);

    // Switch scenario to succeed and retry
    const succeedRadio = screen.getByTestId("scenario-succeed");
    fireEvent.click(succeedRadio);
    fireEvent.click(payBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(pushMock).toHaveBeenCalledWith("/checkout/confirmation/JA-554433");
    });

    vi.unstubAllGlobals();
  });

  describe("Quick Access Password field", () => {
    it("renders the optional password field with helper text", () => {
      render(<ContactAndAddressForm />);

      const passwordInput = screen.getByTestId("input-password");
      expect(passwordInput).toBeTruthy();
      expect(passwordInput.getAttribute("type")).toBe("password");
      expect(screen.getByTestId("password-help-text").textContent).toContain(
        "Minimum 8 characters. Skip if you prefer not to set a password now.",
      );
    });

    it("displays inline validation error when password is shorter than 8 characters", async () => {
      render(<ContactAndAddressForm />);

      fireEvent.change(screen.getByTestId("input-email"), {
        target: { value: "test@example.com" },
      });
      fireEvent.change(screen.getByTestId("input-recipient-name"), {
        target: { value: "Jane Doe" },
      });
      fireEvent.change(screen.getByTestId("input-line1"), {
        target: { value: "100 Broadway" },
      });
      fireEvent.change(screen.getByTestId("input-city"), {
        target: { value: "New York" },
      });
      fireEvent.change(screen.getByTestId("input-zip"), {
        target: { value: "10001" },
      });
      fireEvent.change(screen.getByTestId("input-password"), {
        target: { value: "short" },
      });

      fireEvent.click(screen.getByTestId("checkout-submit-address"));

      const passwordErr = await screen.findByTestId("error-password");
      expect(passwordErr.textContent).toBe("Password must be at least 8 characters long");
    });

    it("submits valid password and displays Quick Access status in summary", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          ok: true,
          checkoutSession: {
            ...mockSession,
            hasPassword: true,
          },
        }),
      });
      vi.stubGlobal("fetch", fetchMock);

      render(<ContactAndAddressForm />);

      fireEvent.change(screen.getByTestId("input-email"), {
        target: { value: "alexandra.vance@studio.com" },
      });
      fireEvent.change(screen.getByTestId("input-recipient-name"), {
        target: { value: "Alexandra Vance" },
      });
      fireEvent.change(screen.getByTestId("input-line1"), {
        target: { value: "123 Main Street" },
      });
      fireEvent.change(screen.getByTestId("input-city"), {
        target: { value: "New York" },
      });
      fireEvent.change(screen.getByTestId("input-zip"), {
        target: { value: "10001" },
      });
      fireEvent.change(screen.getByTestId("input-password"), {
        target: { value: "ValidPassword123" },
      });

      fireEvent.click(screen.getByTestId("checkout-submit-address"));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          "/api/checkout/contact-and-address",
          expect.objectContaining({
            body: expect.stringContaining('"password":"ValidPassword123"'),
          }),
        );
      });

      expect(await screen.findByTestId("summary-quick-access")).toBeTruthy();
      expect(screen.getByTestId("summary-quick-access").textContent).toBe(
        "Password set for quick access",
      );

      vi.unstubAllGlobals();
    });

    it("displays 'No password set (guest checkout)' when initialSession has no password", () => {
      render(<ContactAndAddressForm initialSession={mockSession} />);

      const quickAccessStatus = screen.getByTestId("summary-quick-access");
      expect(quickAccessStatus.textContent).toBe("No password set (guest checkout)");
    });

    it("displays 'Password set for quick access' when initialSession has a password", () => {
      render(
        <ContactAndAddressForm
          initialSession={{ ...mockSession, hasPassword: true }}
        />,
      );

      const quickAccessStatus = screen.getByTestId("summary-quick-access");
      expect(quickAccessStatus.textContent).toBe("Password set for quick access");
    });
  });
});


