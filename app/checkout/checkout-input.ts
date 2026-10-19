export const US_STATES = [
  { code: "AL", name: "Alabama" },
  { code: "AK", name: "Alaska" },
  { code: "AZ", name: "Arizona" },
  { code: "AR", name: "Arkansas" },
  { code: "CA", name: "California" },
  { code: "CO", name: "Colorado" },
  { code: "CT", name: "Connecticut" },
  { code: "DE", name: "Delaware" },
  { code: "DC", name: "District of Columbia" },
  { code: "FL", name: "Florida" },
  { code: "GA", name: "Georgia" },
  { code: "HI", name: "Hawaii" },
  { code: "ID", name: "Idaho" },
  { code: "IL", name: "Illinois" },
  { code: "IN", name: "Indiana" },
  { code: "IA", name: "Iowa" },
  { code: "KS", name: "Kansas" },
  { code: "KY", name: "Kentucky" },
  { code: "LA", name: "Louisiana" },
  { code: "ME", name: "Maine" },
  { code: "MD", name: "Maryland" },
  { code: "MA", name: "Massachusetts" },
  { code: "MI", name: "Michigan" },
  { code: "MN", name: "Minnesota" },
  { code: "MS", name: "Mississippi" },
  { code: "MO", name: "Missouri" },
  { code: "MT", name: "Montana" },
  { code: "NE", name: "Nebraska" },
  { code: "NV", name: "Nevada" },
  { code: "NH", name: "New Hampshire" },
  { code: "NJ", name: "New Jersey" },
  { code: "NM", name: "New Mexico" },
  { code: "NY", name: "New York" },
  { code: "NC", name: "North Carolina" },
  { code: "ND", name: "North Dakota" },
  { code: "OH", name: "Ohio" },
  { code: "OK", name: "Oklahoma" },
  { code: "OR", name: "Oregon" },
  { code: "PA", name: "Pennsylvania" },
  { code: "RI", name: "Rhode Island" },
  { code: "SC", name: "South Carolina" },
  { code: "SD", name: "South Dakota" },
  { code: "TN", name: "Tennessee" },
  { code: "TX", name: "Texas" },
  { code: "UT", name: "Utah" },
  { code: "VT", name: "Vermont" },
  { code: "VA", name: "Virginia" },
  { code: "WA", name: "Washington" },
  { code: "WV", name: "West Virginia" },
  { code: "WI", name: "Wisconsin" },
  { code: "WY", name: "Wyoming" },
] as const;

export const VALID_US_STATE_CODES = new Set<string>(US_STATES.map((s) => s.code));

// RFC 5322 compliant regex for practical email validation
const EMAIL_REGEX =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

// US ZIP code: 5 digits, or 5+4 format (e.g. 10001 or 10001-1234)
const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;

export interface CheckoutContactAndAddressData {
  email: string;
  recipientName: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  zip: string;
  country: string;
  phone: string | null;
  password?: string;
}

export interface CheckoutInputErrors {
  email?: string;
  recipientName?: string;
  line1?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  phone?: string;
  password?: string;
}

export type ParseCheckoutResult =
  | { ok: true; data: CheckoutContactAndAddressData }
  | { ok: false; errors: CheckoutInputErrors };

/**
 * Validates checkout contact email and shipping address payload.
 * Trims values, lowercases email, uppercases state & country, and checks required formats.
 */
export function parseCheckoutContactAndAddress(raw: unknown): ParseCheckoutResult {
  if (typeof raw !== "object" || raw === null) {
    return {
      ok: false,
      errors: {
        email: "Invalid request body.",
      },
    };
  }

  const record = raw as Record<string, unknown>;
  const errors: CheckoutInputErrors = {};

  // Email
  const rawEmail = typeof record.email === "string" ? record.email.trim() : "";
  if (!rawEmail) {
    errors.email = "Email is required";
  } else if (!EMAIL_REGEX.test(rawEmail)) {
    errors.email = "Please enter a valid email address";
  }

  // Recipient Full Name
  const rawName = typeof record.recipientName === "string" ? record.recipientName.trim() : "";
  if (!rawName) {
    errors.recipientName = "Recipient full name is required";
  }

  // Address Line 1
  const rawLine1 = typeof record.line1 === "string" ? record.line1.trim() : "";
  if (!rawLine1) {
    errors.line1 = "Street address is required";
  }

  // Address Line 2 (optional)
  const rawLine2 = typeof record.line2 === "string" ? record.line2.trim() : "";

  // City
  const rawCity = typeof record.city === "string" ? record.city.trim() : "";
  if (!rawCity) {
    errors.city = "City is required";
  }

  // State
  const rawState =
    typeof record.state === "string" ? record.state.trim().toUpperCase() : "";
  if (!rawState) {
    errors.state = "State is required";
  } else if (!VALID_US_STATE_CODES.has(rawState)) {
    errors.state = "Please enter a valid 2-letter US state code";
  }

  // ZIP Code
  const rawZip = typeof record.zip === "string" ? record.zip.trim() : "";
  if (!rawZip) {
    errors.zip = "ZIP code is required";
  } else if (!US_ZIP_REGEX.test(rawZip)) {
    errors.zip = "Please enter a valid US ZIP code (e.g. 10001 or 10001-1234)";
  }

  // Country (US only)
  const rawCountry =
    typeof record.country === "string"
      ? record.country.trim().toUpperCase()
      : "US";
  if (rawCountry && rawCountry !== "US") {
    errors.country = "We currently ship only within the United States";
  }

  // Phone (optional)
  const rawPhone = typeof record.phone === "string" ? record.phone.trim() : "";

  // Password (optional Quick Access password, min 8 characters)
  const rawPassword = typeof record.password === "string" ? record.password : "";
  if (rawPassword.length > 0 && rawPassword.length < 8) {
    errors.password = "Password must be at least 8 characters long";
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      email: rawEmail.toLowerCase(),
      recipientName: rawName,
      line1: rawLine1,
      line2: rawLine2 ? rawLine2 : null,
      city: rawCity,
      state: rawState,
      zip: rawZip,
      country: "US",
      phone: rawPhone ? rawPhone : null,
      ...(rawPassword.length >= 8 ? { password: rawPassword } : {}),
    },
  };
}
