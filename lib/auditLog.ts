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
