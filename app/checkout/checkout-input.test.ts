import { describe, expect, it } from "vitest";

import { parseCheckoutContactAndAddress } from "./checkout-input.ts";

describe("parseCheckoutContactAndAddress", () => {
  const validPayload = {
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

  it("accepts a valid complete payload and normalizes values", () => {
    const result = parseCheckoutContactAndAddress({
      ...validPayload,
      email: "  ALEXANDRA.VANCE@STUDIO.COM  ",
      state: "ny",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.data.email).toBe("alexandra.vance@studio.com");
    expect(result.data.recipientName).toBe("Alexandra Vance");
    expect(result.data.line1).toBe("123 Main Street");
    expect(result.data.line2).toBe("Apt 4B");
    expect(result.data.city).toBe("New York");
    expect(result.data.state).toBe("NY");
    expect(result.data.zip).toBe("10001");
    expect(result.data.country).toBe("US");
    expect(result.data.phone).toBe("+1 555-019-2834");
  });

  it("accepts valid 5+4 digit ZIP codes", () => {
    const result = parseCheckoutContactAndAddress({
      ...validPayload,
      zip: "10001-1234",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.zip).toBe("10001-1234");
  });

  it("accepts optional fields when omitted or empty", () => {
    const result = parseCheckoutContactAndAddress({
      email: "test@example.com",
      recipientName: "John Doe",
      line1: "456 Oak Rd",
      city: "Los Angeles",
      state: "CA",
      zip: "90001",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.line2).toBeNull();
    expect(result.data.phone).toBeNull();
    expect(result.data.country).toBe("US");
  });

  it("reports errors for all missing required fields", () => {
    const result = parseCheckoutContactAndAddress({});

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors.email).toBe("Email is required");
    expect(result.errors.recipientName).toBe("Recipient full name is required");
    expect(result.errors.line1).toBe("Street address is required");
    expect(result.errors.city).toBe("City is required");
    expect(result.errors.state).toBe("State is required");
    expect(result.errors.zip).toBe("ZIP code is required");
  });

  it("rejects invalid email formats", () => {
    const invalidEmails = ["not-an-email", "@missinguser.com", "user@", "user@domain", "user with space@domain.com"];

    for (const email of invalidEmails) {
      const result = parseCheckoutContactAndAddress({
        ...validPayload,
        email,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.email).toBe("Please enter a valid email address");
      }
    }
  });

  it("rejects invalid state codes", () => {
    const result = parseCheckoutContactAndAddress({
      ...validPayload,
      state: "XX",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.state).toBe("Please enter a valid 2-letter US state code");
    }
  });

  it("rejects invalid ZIP codes", () => {
    const invalidZips = ["123", "abcde", "10001-1", "100011", "90210-"];

    for (const zip of invalidZips) {
      const result = parseCheckoutContactAndAddress({
        ...validPayload,
        zip,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.zip).toBe("Please enter a valid US ZIP code (e.g. 10001 or 10001-1234)");
      }
    }
  });

  it("rejects non-US countries", () => {
    const result = parseCheckoutContactAndAddress({
      ...validPayload,
      country: "CA",
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.country).toBe("We currently ship only within the United States");
    }
  });

  it("rejects non-object body", () => {
    const result = parseCheckoutContactAndAddress("not an object");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.email).toBe("Invalid request body.");
    }
  });
});
