// Seller Tax / GST profile + product GST classification + order tax snapshots.
//
// Dependency-free and pure, so the same rules run in the browser (to guide the
// seller), on the server route (where they are ENFORCED) and in tests. This is
// SELLER GST only — it is deliberately unrelated to YOMICO commission, which is
// currently 0% and carries no GST.
//
// Nothing here changes what a customer is charged: order totals are unchanged.
// GST is treated as INCLUSIVE in the displayed price (standard Indian retail),
// so a snapshot only EXTRACTS the tax component for the invoice/record — it
// never adds to the total.

export const GST_STATUSES = ["REGISTERED", "UNREGISTERED", "COMPOSITION"] as const;
export type GstStatus = (typeof GST_STATUSES)[number];

export const TAX_VERIFICATION_STATUSES = [
  "PENDING",
  "VERIFIED",
  "REJECTED",
] as const;
export type TaxVerificationStatus = (typeof TAX_VERIFICATION_STATUSES)[number];

export const CERTIFICATE_STATUSES = [
  "NOT_UPLOADED",
  "UPLOADED",
] as const;
export type CertificateStatus = (typeof CERTIFICATE_STATUSES)[number];

/**
 * Allowed GST rate slabs (%). Products classify individually — YOMICO does NOT
 * assume 18%. A product must carry one of these rates (0% is valid, e.g. for
 * exempt goods).
 */
export const GST_SLABS = [0, 5, 12, 18, 28] as const;
export type GstSlab = (typeof GST_SLABS)[number];

export function isValidPan(pan: unknown): boolean {
  return typeof pan === "string" && /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan.trim());
}

/** GSTIN: 2-digit state code, 10-char PAN, entity digit, 'Z', 1 checksum char. */
export function isValidGstin(gstin: unknown): boolean {
  return (
    typeof gstin === "string" &&
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(gstin.trim())
  );
}

/** The 2-digit state code embedded in a GSTIN, or null if malformed. */
export function gstinStateCode(gstin: unknown): string | null {
  if (!isValidGstin(gstin)) return null;
  return (gstin as string).trim().slice(0, 2);
}

/** The PAN embedded in a GSTIN (characters 3–12), or null if malformed. */
export function panFromGstin(gstin: unknown): string | null {
  if (!isValidGstin(gstin)) return null;
  return (gstin as string).trim().slice(2, 12);
}

export type SellerTaxProfileInput = {
  gstStatus?: unknown;
  gstin?: unknown;
  legalName?: unknown;
  tradeName?: unknown;
  pan?: unknown;
  businessState?: unknown;
  gstRegistrationState?: unknown;
};

export type SellerTaxProfile = {
  gstStatus: GstStatus;
  gstin: string; // "" when UNREGISTERED
  legalName: string;
  tradeName: string;
  pan: string;
  businessState: string;
  gstRegistrationState: string;
};

export type ValidationResult =
  | { ok: true; profile: SellerTaxProfile }
  | { ok: false; errors: string[] };

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * Validate and normalise a seller's tax profile. GSTIN is NOT blindly optional:
 *
 *   REGISTERED / COMPOSITION → a valid GSTIN is REQUIRED, and its embedded
 *     state code and PAN must agree with gstRegistrationState and pan.
 *   UNREGISTERED             → GSTIN must be EMPTY (an unregistered seller has
 *     no GSTIN; supplying one is a contradiction).
 *
 * legalName, pan and businessState are always required.
 */
export function validateSellerTaxProfile(
  input: SellerTaxProfileInput
): ValidationResult {
  const errors: string[] = [];

  const gstStatus = str(input.gstStatus) as GstStatus;
  if (!(GST_STATUSES as readonly string[]).includes(gstStatus)) {
    return { ok: false, errors: ["Select a valid GST status."] };
  }

  const gstin = str(input.gstin).toUpperCase();
  const legalName = str(input.legalName);
  const tradeName = str(input.tradeName);
  const pan = str(input.pan).toUpperCase();
  const businessState = str(input.businessState);
  const gstRegistrationState = str(input.gstRegistrationState);

  if (!legalName) errors.push("Legal name is required.");
  if (!businessState) errors.push("Business state is required.");
  if (!isValidPan(pan)) errors.push("A valid PAN is required.");

  const requiresGstin = gstStatus === "REGISTERED" || gstStatus === "COMPOSITION";

  if (requiresGstin) {
    if (!isValidGstin(gstin)) {
      errors.push("A valid GSTIN is required for a registered / composition seller.");
    } else {
      if (!gstRegistrationState) {
        errors.push("GST registration state is required.");
      }
      if (pan && panFromGstin(gstin) && panFromGstin(gstin) !== pan) {
        errors.push("The PAN in the GSTIN does not match the PAN provided.");
      }
    }
  } else {
    // UNREGISTERED
    if (gstin) {
      errors.push("An unregistered seller must not provide a GSTIN.");
    }
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    profile: {
      gstStatus,
      gstin: requiresGstin ? gstin : "",
      legalName,
      tradeName: tradeName || legalName,
      pan,
      businessState,
      gstRegistrationState: requiresGstin ? gstRegistrationState : "",
    },
  };
}

/**
 * STRICT listing policy (the approved choice): a seller may list/sell only when
 * REGISTERED or COMPOSITION with a valid, admin-VERIFIED GSTIN. UNREGISTERED
 * sellers are blocked.
 *
 * This is the ELIGIBILITY logic only. Wiring it to actually block product
 * creation is a separate, later step — enabling it here would not change
 * behaviour until a call site enforces it.
 */
/** Loose shape — vendor docs supply plain strings, not the narrowed unions. */
export type ListingProfileLike = {
  gstStatus?: unknown;
  gstin?: unknown;
  taxVerificationStatus?: unknown;
} | null | undefined;

export function canSellerList(profile: ListingProfileLike): boolean {
  if (!profile) return false;
  const status = profile.gstStatus;
  if (status !== "REGISTERED" && status !== "COMPOSITION") return false;
  if (!isValidGstin(profile.gstin)) return false;
  return profile.taxVerificationStatus === "VERIFIED";
}

/** A human reason a seller cannot list yet, or null when they can. */
export function sellerListingBlockReason(
  profile: ListingProfileLike
): string | null {
  if (!profile || !profile.gstStatus) {
    return "Complete your GST / tax profile to start selling.";
  }
  if (profile.gstStatus === "UNREGISTERED") {
    return "A GST registration (Regular or Composition) is required to list products.";
  }
  if (!isValidGstin(profile.gstin)) {
    return "Add a valid GSTIN to your tax profile to start selling.";
  }
  if (profile.taxVerificationStatus === "REJECTED") {
    return "Your GST details were not verified. Please review and resubmit your tax profile.";
  }
  if (profile.taxVerificationStatus !== "VERIFIED") {
    return "Your GST details are pending verification by our team.";
  }
  return null;
}

// --- order tax snapshot (inclusive extraction; totals unchanged) -----------

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export type LineTaxSnapshot = {
  gstRate: number;
  hsn: string;
  grossValue: number; // price * qty (what the customer pays for the line)
  taxableValue: number; // gross ex-GST
  gstAmount: number; // GST component contained in gross
};

/**
 * The immutable tax breakdown for ONE order line, extracted from the
 * GST-INCLUSIVE line value. Because it only splits the amount already charged,
 * the order total is unaffected. Snapshotted at order time so later product or
 * profile edits can never change a historical order/invoice.
 */
export function computeLineTaxSnapshot(
  unitPrice: number,
  qty: number,
  gstRate: number,
  hsn: string
): LineTaxSnapshot {
  const price = Number.isFinite(unitPrice) && unitPrice > 0 ? unitPrice : 0;
  const q = Number.isFinite(qty) && qty > 0 ? qty : 0;
  const rate = Number.isFinite(gstRate) && gstRate > 0 ? gstRate : 0;
  const grossValue = round2(price * q);
  const taxableValue = round2(grossValue * (100 / (100 + rate)));
  const gstAmount = round2(grossValue - taxableValue);
  return { gstRate: rate, hsn: hsn || "", grossValue, taxableValue, gstAmount };
}
