// Seller KYC review: the states, the admin decision rules and the seller's
// resubmission rules. Dependency-free, so the server routes, the pages and the
// tests share one definition.
//
// Lifecycle (vendors.kycStatus):
//   Pending  --admin approve-->  Approved
//   Pending  --admin reject (reason required)-->  Rejected
//   Rejected --seller corrects + resubmits-->  Pending   (back in the review queue)
//   Approved --admin reject (reason required)-->  Rejected   (revocation)
// Every transition is made by a server route on the Admin SDK
// (app/api/admin/kyc/decision, app/api/seller/kyc). firestore.rules already
// freeze kycStatus, status and the document pointers against the seller's own
// writes, so a seller can never approve themselves.
import { validateSectionValues, isOwnKycDocumentPath } from "@/lib/sellerBusiness";
import { isValidGstin } from "@/lib/sellerTax";

export type KycStatus = "Pending" | "Approved" | "Rejected";
export type KycDecision = "APPROVE" | "REJECT";

/** The KYC state of a vendor record, read the same way vendor-login always has. */
export function kycStatusOf(vendor: Record<string, unknown> | null | undefined): KycStatus {
  const raw = vendor?.kycStatus ?? vendor?.kycstatus;
  if (raw === "Approved" || raw === "Rejected" || raw === "Pending") return raw;
  return vendor?.status === "Approved" ? "Approved" : "Pending";
}

export const REJECTION_REASON_MIN = 5;
export const REJECTION_REASON_MAX = 500;
const CONTROL_CHARS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

/** A rejection must tell the seller what to fix. Returns the cleaned reason or an error. */
export function validateRejectionReason(value: unknown): { ok: true; reason: string } | { ok: false; error: string } {
  const reason = typeof value === "string" ? value.trim() : "";
  if (reason.length < REJECTION_REASON_MIN) {
    return { ok: false, error: `A rejection reason is required (at least ${REJECTION_REASON_MIN} characters).` };
  }
  if (reason.length > REJECTION_REASON_MAX) {
    return { ok: false, error: `The rejection reason must be at most ${REJECTION_REASON_MAX} characters.` };
  }
  if (CONTROL_CHARS.test(reason)) return { ok: false, error: "The rejection reason contains invalid characters." };
  return { ok: true, reason };
}

/** Whether an admin decision applies to the current state (no repeat decisions). */
export function decisionAllowed(current: KycStatus, action: KycDecision): boolean {
  return action === "APPROVE" ? current !== "Approved" : current !== "Rejected";
}

/**
 * The account `status` that goes with a KYC decision. A Blocked account stays
 * Blocked: blocking is a separate admin action that KYC review never lifts.
 */
export function accountStatusFor(kyc: KycStatus, currentStatus: unknown): string {
  return currentStatus === "Blocked" ? "Blocked" : kyc;
}

// --- seller resubmission -------------------------------------------------

/** Identity and payout fields a rejected seller may correct before resubmitting. */
export const KYC_IDENTITY_FIELDS = ["gstNumber", "panNumber", "aadhaarNumber"] as const;
export const KYC_BANK_FIELDS = ["accountHolder", "bankName", "accountNumber", "ifsc"] as const;
export const KYC_FIELDS = [...KYC_IDENTITY_FIELDS, ...KYC_BANK_FIELDS] as const;
export type KycField = (typeof KYC_FIELDS)[number];

export const KYC_DOCUMENTS = {
  gst: "gstDocUrl",
  aadhaar: "aadhaarDocUrl",
  cheque: "chequeDocUrl",
} as const;
export type KycDocument = keyof typeof KYC_DOCUMENTS;

export type KycResubmission = {
  values: Record<KycField, string>;
  /** New uploads only: document type -> the seller's own vendor-kyc/{uid}/ object path. */
  documents: Partial<Record<KycDocument, string>>;
};

const clean = (v: unknown) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "");

/**
 * Validates a resubmission. Formats match vendor-register: Aadhaar 12 digits,
 * PAN AAAAA9999A, GSTIN — each optional, as at registration —, bank fields as the
 * business-change flow checks them. New documents must be the seller's own
 * files in vendor-kyc/{uid}/ (storage.rules: owner create-only, image/PDF).
 */
export function validateResubmission(
  uid: string,
  input: unknown
): { ok: true; data: KycResubmission } | { ok: false; errors: string[] } {
  const raw = (input && typeof input === "object" && !Array.isArray(input) ? input : {}) as Record<string, unknown>;
  const fields = (raw.values && typeof raw.values === "object" && !Array.isArray(raw.values) ? raw.values : {}) as Record<string, unknown>;
  const docs = (raw.documents && typeof raw.documents === "object" && !Array.isArray(raw.documents) ? raw.documents : {}) as Record<string, unknown>;
  const errors: string[] = [];

  for (const key of Object.keys(fields)) {
    if (!(KYC_FIELDS as readonly string[]).includes(key)) errors.push(`${key} cannot be changed here.`);
  }
  for (const key of Object.keys(docs)) {
    if (!(key in KYC_DOCUMENTS)) errors.push(`Unknown document: ${key}.`);
  }

  const gstNumber = clean(fields.gstNumber).toUpperCase().replace(/\s/g, "");
  const panNumber = clean(fields.panNumber).toUpperCase().replace(/\s/g, "");
  const aadhaarNumber = clean(fields.aadhaarNumber).replace(/\s/g, "");
  if (gstNumber && !isValidGstin(gstNumber)) errors.push("Enter a valid GSTIN.");
  if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(panNumber)) errors.push("Enter a valid PAN number.");
  if (aadhaarNumber && !/^\d{12}$/.test(aadhaarNumber)) errors.push("Enter a valid 12 digit Aadhaar number.");

  const bank = validateSectionValues("bank", {
    accountHolder: fields.accountHolder,
    bankName: fields.bankName,
    accountNumber: fields.accountNumber,
    ifsc: fields.ifsc,
  });
  if (!bank.ok) errors.push(...bank.errors);

  const documents: Partial<Record<KycDocument, string>> = {};
  for (const key of Object.keys(KYC_DOCUMENTS) as KycDocument[]) {
    const path = docs[key];
    if (path === undefined || path === null || path === "") continue;
    if (!isOwnKycDocumentPath(uid, path)) errors.push(`The ${key} document must be your own uploaded file.`);
    else documents[key] = path;
  }

  if (errors.length) return { ok: false, errors };
  const b = (bank as { ok: true; values: Record<string, string> }).values;
  return {
    ok: true,
    data: {
      values: {
        gstNumber,
        panNumber,
        aadhaarNumber,
        accountHolder: b.accountHolder,
        bankName: b.bankName,
        accountNumber: b.accountNumber,
        ifsc: b.ifsc,
      },
      documents,
    },
  };
}

/** The fields whose value differs from what the vendor record holds. */
export function changedKycFields(vendor: Record<string, unknown>, values: Record<KycField, string>): KycField[] {
  return KYC_FIELDS.filter((f) => {
    const stored = vendor[f];
    const before = typeof stored === "string" ? stored : typeof stored === "number" ? String(stored) : "";
    return before !== values[f];
  });
}

/**
 * A stored KYC document pointer is either a Firebase Storage download URL
 * (vendor-register) or an object path (resubmission). The object path in both
 * cases, or null.
 */
export function kycDocumentObjectPath(stored: unknown): string | null {
  if (typeof stored !== "string" || !stored) return null;
  if (stored.startsWith("vendor-kyc/")) return stored;
  try {
    const match = new URL(stored).pathname.match(/\/o\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    return null;
  }
}
