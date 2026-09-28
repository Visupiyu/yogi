// SERVER-ONLY (Admin SDK). Small account checks shared by the customer routes.
import type { Firestore } from "firebase-admin/firestore";

/** Firestore-safe document id: no path separator, not reserved, bounded. */
export function isValidDocId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 200 &&
    !id.includes("/") &&
    id !== "." &&
    id !== ".." &&
    !/^__.*__$/.test(id)
  );
}

/**
 * The customer's profile, read once: whether an admin has blocked the account
 * (app/admin/customers writes users/{uid}.status) and the name to show on
 * anything public the customer writes. A missing profile is an unblocked
 * account, same as the checkout and firestore.rules' isNotBlocked().
 */
export async function loadCustomerProfile(
  db: Firestore,
  uid: string
): Promise<{ blocked: boolean; displayName: string }> {
  const snap = await db.collection("users").doc(uid).get();
  const data = snap.exists ? snap.data() || {} : {};
  const name = typeof data.name === "string" ? data.name.trim() : "";
  return {
    blocked: data.status === "Blocked",
    displayName: name ? name.slice(0, 100) : "Customer",
  };
}
