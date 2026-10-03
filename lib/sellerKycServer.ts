// Server-side seller KYC transitions (Admin SDK). Called by
// app/api/admin/kyc/decision (admin approve / reject) and app/api/seller/kyc
// (the seller's own status + resubmission). Authorization happens in those
// routes from the verified token; these functions only apply the rules in
// lib/sellerKyc.ts, inside one transaction each, with an audit_logs entry.
import type { Firestore } from "firebase-admin/firestore";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import {
  KYC_DOCUMENTS,
  accountStatusFor,
  changedKycFields,
  decisionAllowed,
  kycStatusOf,
  type KycDecision,
  type KycDocument,
  type KycResubmission,
  type KycStatus,
} from "@/lib/sellerKyc";
import { findSellerVendor } from "@/lib/sellerBusinessServer";

export type KycActor = { uid: string; email: string | null };

export type DecideOutcome =
  | { kind: "not-found" }
  | { kind: "already"; kycStatus: KycStatus }
  | { kind: "done"; kycStatus: KycStatus; status: string };

/** Admin approve / reject. `reason` must already be validated for REJECT. */
export async function decideKyc(
  db: Firestore,
  params: { vendorId: string; action: KycDecision; reason: string | null; actor: KycActor }
): Promise<DecideOutcome> {
  const { vendorId, action, reason, actor } = params;
  const vendorRef = db.collection("vendors").doc(vendorId);
  return db.runTransaction<DecideOutcome>(async (tx) => {
    const snap = await tx.get(vendorRef);
    if (!snap.exists) return { kind: "not-found" };
    const vendor = snap.data() || {};
    const current = kycStatusOf(vendor);
    if (!decisionAllowed(current, action)) return { kind: "already", kycStatus: current };

    const uid = typeof vendor.uid === "string" ? vendor.uid : "";
    const publicRef = uid ? db.collection("vendors_public").doc(uid) : null;
    const publicSnap = publicRef ? await tx.get(publicRef) : null;

    const next: KycStatus = action === "APPROVE" ? "Approved" : "Rejected";
    const status = accountStatusFor(next, vendor.status);
    const now = Timestamp.now();
    tx.update(vendorRef, {
      kycStatus: next,
      status,
      kycReviewedAt: now,
      kycReviewedBy: actor.uid,
      // The seller reads the reason on /seller-kyc; an approval clears it.
      kycRejectionReason: action === "REJECT" ? reason : FieldValue.delete(),
      ...(action === "REJECT" ? { kycRejectedAt: now } : {}),
    });
    if (publicRef && publicSnap?.exists) tx.update(publicRef, { status });
    tx.set(db.collection("audit_logs").doc(), {
      actorUid: actor.uid,
      actorEmail: actor.email || "",
      action: action === "APPROVE" ? "kyc_approved" : "kyc_rejected",
      targetId: vendorId,
      details: { oldStatus: current, newStatus: next, ...(reason ? { reason } : {}) },
      createdAt: now,
    });
    return { kind: "done", kycStatus: next, status };
  });
}

export type SellerKycView = {
  kycStatus: KycStatus;
  status: string;
  rejectionReason: string | null;
  rejectedAt: string | null;
  resubmittedAt: string | null;
  values: Record<string, string>;
  documents: Record<KycDocument, boolean>;
};

const iso = (v: unknown) => {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
};
const s = (v: unknown) => (typeof v === "string" ? v : "");

/** What the seller sees on /seller-kyc. Only their own record; no document URLs. */
export function sellerKycView(vendor: Record<string, unknown>): SellerKycView {
  const kycStatus = kycStatusOf(vendor);
  return {
    kycStatus,
    status: s(vendor.status) || "Pending",
    rejectionReason: kycStatus === "Rejected" ? s(vendor.kycRejectionReason) || null : null,
    rejectedAt: kycStatus === "Rejected" ? iso(vendor.kycRejectedAt) : null,
    resubmittedAt: iso(vendor.kycResubmittedAt),
    values: {
      gstNumber: s(vendor.gstNumber),
      panNumber: s(vendor.panNumber),
      aadhaarNumber: s(vendor.aadhaarNumber),
      accountHolder: s(vendor.accountHolder),
      bankName: s(vendor.bankName),
      accountNumber: s(vendor.accountNumber),
      ifsc: s(vendor.ifsc),
    },
    documents: {
      gst: !!s(vendor.gstDocUrl),
      aadhaar: !!s(vendor.aadhaarDocUrl),
      cheque: !!s(vendor.chequeDocUrl),
    },
  };
}

export type ResubmitOutcome =
  | { kind: "no-vendor" }
  | { kind: "duplicate" }
  | { kind: "not-rejected"; kycStatus: KycStatus }
  | { kind: "blocked" }
  | { kind: "nothing-changed" }
  | { kind: "missing-document"; document: KycDocument }
  | { kind: "done" };

/**
 * A rejected seller's corrections go back into the review queue (Pending).
 * Only a Rejected record can be resubmitted; the seller must change at least
 * one field or upload at least one new document. `fileExists` confirms each
 * new upload really exists before the record is pointed at it.
 */
export async function resubmitKyc(
  db: Firestore,
  params: { actor: KycActor; data: KycResubmission; fileExists: (path: string) => Promise<boolean> }
): Promise<ResubmitOutcome> {
  const { actor, data, fileExists } = params;

  for (const [doc, path] of Object.entries(data.documents) as [KycDocument, string][]) {
    if (!(await fileExists(path))) return { kind: "missing-document", document: doc };
  }

  return db.runTransaction<ResubmitOutcome>(async (tx) => {
    const lookup = await findSellerVendor(db, actor.uid, tx);
    if (lookup.kind === "none") return { kind: "no-vendor" };
    if (lookup.kind === "duplicate") return { kind: "duplicate" };
    const vendor = lookup.data;
    const current = kycStatusOf(vendor);
    if (vendor.status === "Blocked") return { kind: "blocked" };
    if (current !== "Rejected") return { kind: "not-rejected", kycStatus: current };

    const changed = changedKycFields(vendor, data.values);
    const newDocs = Object.keys(data.documents) as KycDocument[];
    if (changed.length === 0 && newDocs.length === 0) return { kind: "nothing-changed" };

    const uid = actor.uid;
    const publicRef = db.collection("vendors_public").doc(uid);
    const publicSnap = await tx.get(publicRef);

    const now = Timestamp.now();
    const update: Record<string, unknown> = {
      kycStatus: "Pending",
      status: accountStatusFor("Pending", vendor.status),
      kycResubmittedAt: now,
      kycResubmissionCount: FieldValue.increment(1),
      // Kept for the admin reviewer: what the previous rejection said.
      kycPreviousRejectionReason: s(vendor.kycRejectionReason) || null,
      kycRejectionReason: FieldValue.delete(),
    };
    for (const f of changed) update[f] = data.values[f];
    for (const d of newDocs) update[KYC_DOCUMENTS[d]] = data.documents[d];
    tx.update(lookup.ref, update);
    if (publicSnap.exists) tx.update(publicRef, { status: update.status });
    tx.set(db.collection("audit_logs").doc(), {
      actorUid: uid,
      actorEmail: actor.email || "",
      action: "kyc_resubmitted",
      targetId: lookup.ref.id,
      details: { fields: changed, documents: newDocs },
      createdAt: now,
    });
    return { kind: "done" };
  });
}
