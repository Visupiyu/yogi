import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// Best-effort, append-only audit trail for admin money/trust actions.
// Never throws — a logging failure must not block or roll back the
// underlying admin action it's recording.
export async function logAdminAction(
  action: string,
  targetId: string,
  details?: Record<string, unknown>
) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      actorUid: auth.currentUser?.uid || "",
      actorEmail: auth.currentUser?.email || "",
      action,
      targetId,
      details: details || {},
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}

// Separate from logAdminAction because the Firestore rule authorizing it
// is different and deliberately narrow: audit_logs' create rule only lets
// a non-admin caller self-attest their own uid on an entry of exactly
// this one action type (see firestore.rules). Never reuse this for any
// other action — the rule wouldn't allow it anyway.
export async function logDeliveryPartnerAction(
  action: "delivery_payment_confirmed",
  targetId: string,
  details?: Record<string, unknown>
) {
  try {
    await addDoc(collection(db, "audit_logs"), {
      actorUid: auth.currentUser?.uid || "",
      actorEmail: auth.currentUser?.email || "",
      action,
      targetId,
      details: details || {},
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    console.error("Failed to write audit log:", error);
  }
}
