import type { Firestore } from "firebase/firestore";
import { auth } from "@/lib/firebase";

type ReturnRecord = {
  id: string;
  userId?: string;
  userEmail?: string;
  refundAmount?: number;
  [key: string]: unknown;
};

// Shared by the two admin surfaces that manage the old-style `returns`
// collection (app/admin/refunds and app/admin/returns), so both change a
// return's status — and credit reward points on "Refunded" — identically.
//
// The work runs on the SERVER (app/api/admin/returns/[id]/status, Admin SDK):
// the status change, the one-time points credit with its ledger row, and the
// customer notification. This browser helper no longer writes balances,
// ledger rows or notifications itself. A return is credited at most once —
// Refunded -> Approved -> Refunded no longer pays twice.
//
// The signature is unchanged so the admin pages need no edit; `db` is unused.
export async function applyReturnStatusUpdate(
  _db: Firestore,
  returnRecord: ReturnRecord,
  status: string
): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");

  const res = await fetch(`/api/admin/returns/${encodeURIComponent(returnRecord.id)}/status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${await user.getIdToken()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ status }),
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: unknown };
    throw new Error(typeof body.error === "string" ? body.error : "Could not update the return.");
  }
}
