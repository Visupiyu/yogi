// SERVER-ONLY. Phase 2B-5B-3 — company owner provisioning decision (pure).
//
// Associates an existing Firebase Auth uid with a delivery company as its owner
// (the login identity resolveDeliveryActor recognises). This module holds ONLY
// the pure decision so it is unit-testable; the route supplies the facts it read
// from Firestore. NO Firebase Auth account is created here, and no money/
// execution fields are touched. ownerUid is server-written; a company user can
// never set it (this path is admin-only) and cannot change another company.
export type OwnerAssignmentFacts = {
  companyExists: boolean;
  currentOwnerUid: string | null; // the company's existing owner, if any
  ownerUid: string; // the uid the admin wants to assign
  ownerUidOwnsOtherCompany: boolean; // this uid already owns a DIFFERENT company
  ownerUidIsDeliveryPerson: boolean; // this uid is already a delivery person
};

export type OwnerAssignmentDecision =
  | { ok: true; action: "set" } // write ownerUid
  | { ok: true; action: "noop" } // already this exact owner — idempotent
  | { ok: false; status: number; error: string };

/**
 * Decide whether an owner assignment may proceed. Fail-closed:
 *  - missing uid                       -> 400
 *  - company not found                 -> 404
 *  - uid already owns another company  -> 409 (one owner : one company)
 *  - uid is already a delivery person  -> 409 (no dual role — would shadow the
 *                                         person, since company resolves first)
 *  - company already has a DIFFERENT owner -> 409 (no silent overwrite; no safe
 *                                         replacement operation exists yet)
 *  - company already has THIS owner    -> noop (idempotent)
 *  - otherwise                         -> set
 */
export function decideOwnerAssignment(f: OwnerAssignmentFacts): OwnerAssignmentDecision {
  if (!f.ownerUid) return { ok: false, status: 400, error: "ownerUid is required." };
  if (!f.companyExists) return { ok: false, status: 404, error: "Delivery company not found." };
  if (f.ownerUidOwnsOtherCompany)
    return { ok: false, status: 409, error: "That account already owns another delivery company." };
  if (f.ownerUidIsDeliveryPerson)
    return { ok: false, status: 409, error: "That account is already a delivery person and cannot be a company owner." };
  if (f.currentOwnerUid && f.currentOwnerUid !== f.ownerUid)
    return { ok: false, status: 409, error: "This company already has a different owner." };
  if (f.currentOwnerUid && f.currentOwnerUid === f.ownerUid)
    return { ok: true, action: "noop" };
  return { ok: true, action: "set" };
}
