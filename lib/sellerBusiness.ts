// Seller Business — the ONE definition of a seller's business details: which
// existing `vendors` fields they are, how a change to them is validated, how
// sensitive values are masked, and what the seller is shown.
//
// Dependency-free (no Firebase) so the seller page, the server routes and the
// tests share it. It adds NO new business data: every field below already
// lives on the seller's vendors/{id} document, written at registration
// (app/vendor-register). GST is NOT here — it stays in vendors.taxProfile,
// owned by app/api/seller/tax-profile and admin verification; this module only
// reads it for display.
//
// CHANGE POLICY. These fields identify the business, where returns are
// collected from, and where payouts are sent. A seller never edits them
// directly any more (firestore.rules freeze them once KYC is approved, and the
// settings page no longer offers them): a change is a request
// (vendorChangeRequests) that an admin approves or rejects. Nothing here
// touches money — payout, settlement, commission and GST calculations never
// read these fields.

export const BUSINESS_TYPES = [
  "Sole Proprietorship",
  "Partnership",
  "Private Limited",
  "LLP",
  "Other",
] as const;

/** The groups a seller can ask to change, each a set of existing vendor fields. */
export const CHANGE_SECTIONS = {
  business: ["businessName", "fullName", "businessType"],
  contact: ["businessPhone", "email"],
  address: ["street", "unit", "zipCode", "city", "state"],
  bank: ["accountHolder", "bankName", "accountNumber", "ifsc"],
} as const;

export type ChangeSection = keyof typeof CHANGE_SECTIONS;
export type BusinessField = (typeof CHANGE_SECTIONS)[ChangeSection][number];

export const CHANGE_SECTION_LABELS: Record<ChangeSection, string> = {
  business: "Business identity",
  contact: "Business contact",
  address: "Business address",
  bank: "Bank / payout account",
};

export const FIELD_LABELS: Record<BusinessField, string> = {
  businessName: "Business name",
  fullName: "Owner name",
  businessType: "Business type",
  businessPhone: "Business phone",
  email: "Business email",
  street: "Street / area",
  unit: "Unit / building",
  zipCode: "PIN code",
  city: "City",
  state: "State",
  accountHolder: "Account holder name",
  bankName: "Bank name",
  accountNumber: "Account number",
  ifsc: "IFSC",
};

/** A bank change must carry proof (cancelled cheque / bank statement). */
export function sectionRequiresDocument(section: ChangeSection): boolean {
  return section === "bank";
}

/**
 * The vendors fields the storefront mirror (vendors_public) carries — the same
 * set app/vendor-register and app/seller/settings have always mirrored. An
 * approved change to one of these is copied there too.
 */
export const PUBLIC_MIRROR_FIELDS: readonly BusinessField[] = [
  "businessName",
  "fullName",
  "businessType",
  "businessPhone",
  "email",
  "city",
  "state",
];

export const CHANGE_REQUEST_STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELLED"] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];

export function isChangeSection(value: unknown): value is ChangeSection {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(CHANGE_SECTIONS, value);
}

// --- validation --------------------------------------------------------------

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function checkText(label: string, value: string, min: number, max: number, errors: string[]) {
  if (value.length < min || value.length > max || CONTROL_CHARS.test(value)) {
    errors.push(
      min > 0
        ? `${label} must be ${min}–${max} characters.`
        : `${label} must be at most ${max} characters.`
    );
  }
}

/**
 * Normalises and validates the FULL set of fields for one section. Returns the
 * normalised values (every field of the section, in its stored form) or the
 * reasons it was refused. Formats match what registration already enforces
 * (10-digit phone, 6-digit PIN, IFSC) so an approved change can never store a
 * value registration would have refused.
 */
export function validateSectionValues(
  section: ChangeSection,
  input: unknown
):
  | { ok: true; values: Record<string, string> }
  | { ok: false; errors: string[] } {
  const raw = (input && typeof input === "object" && !Array.isArray(input)
    ? input
    : {}) as Record<string, unknown>;
  const allowed = CHANGE_SECTIONS[section] as readonly string[];
  const errors: string[] = [];

  for (const key of Object.keys(raw)) {
    if (!allowed.includes(key)) errors.push(`${key} cannot be changed here.`);
  }

  const values: Record<string, string> = {};
  switch (section) {
    case "business": {
      values.businessName = text(raw.businessName);
      values.fullName = text(raw.fullName);
      values.businessType = text(raw.businessType);
      checkText("Business name", values.businessName, 2, 120, errors);
      checkText("Owner name", values.fullName, 2, 100, errors);
      if (!(BUSINESS_TYPES as readonly string[]).includes(values.businessType)) {
        errors.push("Choose a valid business type.");
      }
      break;
    }
    case "contact": {
      values.businessPhone = text(raw.businessPhone).replace(/\s/g, "");
      values.email = text(raw.email).toLowerCase();
      if (!/^\d{10}$/.test(values.businessPhone)) {
        errors.push("Business phone must be a 10 digit number.");
      }
      if (
        values.email.length > 254 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email)
      ) {
        errors.push("Enter a valid business email.");
      }
      break;
    }
    case "address": {
      values.street = text(raw.street);
      values.unit = text(raw.unit);
      values.zipCode = text(raw.zipCode).replace(/\s/g, "");
      values.city = text(raw.city);
      values.state = text(raw.state);
      checkText("Street / area", values.street, 3, 200, errors);
      checkText("Unit / building", values.unit, 0, 100, errors);
      checkText("City", values.city, 2, 80, errors);
      checkText("State", values.state, 2, 80, errors);
      if (!/^\d{6}$/.test(values.zipCode)) errors.push("PIN code must be 6 digits.");
      break;
    }
    case "bank": {
      values.accountHolder = text(raw.accountHolder);
      values.bankName = text(raw.bankName);
      values.accountNumber = text(raw.accountNumber).replace(/\s/g, "");
      values.ifsc = text(raw.ifsc).toUpperCase();
      checkText("Account holder name", values.accountHolder, 2, 100, errors);
      checkText("Bank name", values.bankName, 2, 100, errors);
      if (!/^\d{9,18}$/.test(values.accountNumber)) {
        errors.push("Account number must be 9–18 digits.");
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(values.ifsc)) errors.push("Enter a valid IFSC code.");
      break;
    }
  }

  return errors.length ? { ok: false, errors } : { ok: true, values };
}

/** The stored value of a vendor field, as the string a change is compared against. */
export function storedValue(vendor: Record<string, unknown> | null | undefined, field: string): string {
  const v = vendor?.[field];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return "";
}

/** Only the fields whose value actually changes, with their previous values. */
export function diffSection(
  section: ChangeSection,
  vendor: Record<string, unknown>,
  values: Record<string, string>
): { changes: Record<string, string>; previous: Record<string, string> } {
  const changes: Record<string, string> = {};
  const previous: Record<string, string> = {};
  for (const field of CHANGE_SECTIONS[section]) {
    const before = storedValue(vendor, field);
    if (before !== values[field]) {
      changes[field] = values[field];
      previous[field] = before;
    }
  }
  return { changes, previous };
}

/**
 * A bank-proof upload must be the seller's OWN file in the existing KYC folder
 * (storage.rules: owner create-only, image/PDF, < 10MB) — never another path.
 */
export function isOwnKycDocumentPath(uid: string, path: unknown): path is string {
  return (
    typeof path === "string" &&
    !!uid &&
    path.length <= 300 &&
    path.startsWith(`vendor-kyc/${uid}/`) &&
    path.length > `vendor-kyc/${uid}/`.length &&
    !path.includes("..") &&
    !path.slice(`vendor-kyc/${uid}/`.length).includes("/")
  );
}

// --- masking -----------------------------------------------------------------

/** Keep only the last `visible` characters. Empty in, empty out. */
export function maskTail(value: unknown, visible = 4): string {
  const s = typeof value === "string" ? value.replace(/\s/g, "") : "";
  if (!s) return "";
  if (s.length <= visible) return "•".repeat(s.length);
  return "•".repeat(s.length - visible) + s.slice(-visible);
}

export const maskAccountNumber = (v: unknown) => maskTail(v, 4);
export const maskPan = (v: unknown) => maskTail(v, 4);
export function maskAadhaar(v: unknown): string {
  const s = typeof v === "string" ? v.replace(/\s/g, "") : "";
  return s ? `•••• •••• ${s.slice(-4)}` : "";
}

/** A field value as the SELLER may see it in a change request (account number masked). */
export function displayValueForSeller(field: string, value: unknown): string {
  if (field === "accountNumber") return maskAccountNumber(value);
  return typeof value === "string" ? value : "";
}

// --- the seller's view -------------------------------------------------------

export type SellerBusinessView = {
  sellerNumber: string | null;
  accountStatus: string;
  kycStatus: string;
  emailVerified: boolean;
  business: { businessName: string; fullName: string; businessType: string };
  contact: { businessPhone: string; email: string };
  address: { street: string; unit: string; zipCode: string; city: string; state: string };
  bank: {
    accountHolder: string;
    bankName: string;
    accountNumberMasked: string;
    ifsc: string;
    onFile: boolean;
    updatedAt: string | null;
  };
  identity: { panMasked: string; aadhaarMasked: string; gstNumberDeclared: string };
  tax: {
    gstStatus: string | null;
    gstin: string;
    legalName: string;
    tradeName: string;
    verificationStatus: string | null;
    rejectionReason: string;
  };
  documents: { gst: boolean; aadhaar: boolean; cheque: boolean };
  agreementAccepted: boolean;
};

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

/**
 * What the seller is shown about their own business. Sensitive numbers (bank
 * account, PAN, Aadhaar) leave the server masked; KYC documents are reported
 * as present or not — never as a URL.
 */
export function buildSellerBusinessView(
  vendor: Record<string, unknown>,
  opts: { emailVerified: boolean }
): SellerBusinessView {
  const s = (f: string) => storedValue(vendor, f);
  const tax = (vendor.taxProfile && typeof vendor.taxProfile === "object"
    ? vendor.taxProfile
    : {}) as Record<string, unknown>;
  const t = (f: string) => (typeof tax[f] === "string" ? (tax[f] as string) : "");
  return {
    sellerNumber: typeof vendor.sellerNumber === "string" ? vendor.sellerNumber : null,
    accountStatus: s("status") || "Pending",
    kycStatus: s("kycStatus") || "Pending",
    emailVerified: opts.emailVerified,
    business: { businessName: s("businessName"), fullName: s("fullName"), businessType: s("businessType") },
    contact: { businessPhone: s("businessPhone"), email: s("email") },
    address: { street: s("street"), unit: s("unit"), zipCode: s("zipCode"), city: s("city"), state: s("state") },
    bank: {
      accountHolder: s("accountHolder"),
      bankName: s("bankName"),
      accountNumberMasked: maskAccountNumber(s("accountNumber")),
      ifsc: s("ifsc"),
      onFile: !!(s("accountNumber") && s("ifsc")),
      updatedAt: iso(vendor.bankDetailsUpdatedAt),
    },
    identity: {
      panMasked: maskPan(s("panNumber")),
      aadhaarMasked: maskAadhaar(s("aadhaarNumber")),
      gstNumberDeclared: s("gstNumber"),
    },
    tax: {
      gstStatus: t("gstStatus") || null,
      gstin: t("gstin"),
      legalName: t("legalName"),
      tradeName: t("tradeName"),
      verificationStatus:
        typeof vendor.taxVerificationStatus === "string" ? vendor.taxVerificationStatus : null,
      rejectionReason: s("taxRejectionReason"),
    },
    documents: { gst: !!s("gstDocUrl"), aadhaar: !!s("aadhaarDocUrl"), cheque: !!s("chequeDocUrl") },
    agreementAccepted: vendor.agreed === true,
  };
}
