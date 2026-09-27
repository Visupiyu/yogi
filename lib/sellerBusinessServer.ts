// SERVER-ONLY (Admin SDK). Shared lookups for the Seller Business routes
// (app/api/seller/business, app/api/admin/business-change-requests).
import type {
  DocumentReference,
  DocumentSnapshot,
  Firestore,
  Transaction,
} from "firebase-admin/firestore";
import {
  CHANGE_SECTIONS,
  displayValueForSeller,
  isChangeSection,
  maskAccountNumber,
  type ChangeSection,
} from "@/lib/sellerBusiness";

export const CHANGE_REQUESTS = "vendorChangeRequests";

export type SellerVendorLookup =
  | { kind: "none" }
  | { kind: "duplicate" }
  | { kind: "ok"; ref: DocumentReference; data: Record<string, unknown> };

/**
 * The seller's ONE vendor record, found by the verified uid. Two records for
 * one uid are refused rather than guessed between: a business/bank change
 * applied to one of them would leave the other disagreeing.
 */
export async function findSellerVendor(
  db: Firestore,
  uid: string,
  tx?: Transaction
): Promise<SellerVendorLookup> {
  const q = db.collection("vendors").where("uid", "==", uid).limit(2);
  const snap = tx ? await tx.get(q) : await q.get();
  if (snap.empty) return { kind: "none" };
  if (snap.size > 1) return { kind: "duplicate" };
  return { kind: "ok", ref: snap.docs[0].ref, data: snap.docs[0].data() || {} };
}

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

function stringMap(v: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (v && typeof v === "object" && !Array.isArray(v)) {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      if (typeof val === "string") out[k] = val;
    }
  }
  return out;
}

function sectionOf(data: Record<string, unknown>): ChangeSection | null {
  return isChangeSection(data.section) ? data.section : null;
}

/** A change request as its SELLER sees it — the account number masked on both sides. */
export function sellerRequestView(snap: DocumentSnapshot) {
  const d = snap.data() || {};
  const mask = (m: Record<string, string>) =>
    Object.fromEntries(Object.entries(m).map(([k, v]) => [k, displayValueForSeller(k, v)]));
  return {
    id: snap.id,
    section: sectionOf(d),
    status: typeof d.status === "string" ? d.status : "PENDING",
    changes: mask(stringMap(d.changes)),
    previous: mask(stringMap(d.previous)),
    hasDocument: typeof d.documentPath === "string" && d.documentPath.length > 0,
    createdAt: iso(d.createdAt),
    decidedAt: iso(d.decidedAt),
    decisionReason: typeof d.decisionReason === "string" ? d.decisionReason : "",
  };
}

/**
 * A change request as the ADMIN reviewer sees it. The proposed values are in
 * full (the reviewer checks a new account number against the uploaded proof);
 * the account number being replaced is masked — it is not needed to decide.
 */
export function adminRequestView(snap: DocumentSnapshot) {
  const d = snap.data() || {};
  const previous = stringMap(d.previous);
  if (previous.accountNumber) previous.accountNumber = maskAccountNumber(previous.accountNumber);
  const section = sectionOf(d);
  return {
    id: snap.id,
    vendorUid: typeof d.vendorUid === "string" ? d.vendorUid : "",
    vendorDocId: typeof d.vendorDocId === "string" ? d.vendorDocId : "",
    vendorName: typeof d.vendorName === "string" ? d.vendorName : "",
    section,
    fields: section ? (CHANGE_SECTIONS[section] as readonly string[]).filter((f) => f in stringMap(d.changes)) : [],
    status: typeof d.status === "string" ? d.status : "PENDING",
    changes: stringMap(d.changes),
    previous,
    hasDocument: typeof d.documentPath === "string" && d.documentPath.length > 0,
    createdAt: iso(d.createdAt),
    decidedAt: iso(d.decidedAt),
    decidedBy: typeof d.decidedByEmail === "string" ? d.decidedByEmail : "",
    decisionReason: typeof d.decisionReason === "string" ? d.decisionReason : "",
  };
}

/** Newest first, by createdAt. */
export function newestFirst(a: DocumentSnapshot, b: DocumentSnapshot): number {
  const t = (s: DocumentSnapshot) =>
    (s.data()?.createdAt as { toMillis?: () => number } | undefined)?.toMillis?.() ?? 0;
  return t(b) - t(a);
}
