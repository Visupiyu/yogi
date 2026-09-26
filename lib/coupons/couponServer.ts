// SERVER-ONLY (Admin SDK). Coupon lookups shared by the web pricing pass and
// both mobile order routes, so every server path finds coupons and prior
// redemptions the same way. The pricing rules themselves live in the
// dependency-free lib/coupons/couponRules.ts.
import type { Firestore } from "firebase-admin/firestore";

/**
 * The coupon document for a canonical (UPPERCASE) code, or null. Coupons are
 * created with addDoc() (random id), so the code is a field, not the doc id.
 */
export async function loadCouponByCode(
  db: Firestore,
  code: string
): Promise<Record<string, unknown> | null> {
  const snap = await db.collection("coupons").where("code", "==", code).limit(1).get();
  return snap.empty ? null : (snap.docs[0].data() as Record<string, unknown>);
}

/**
 * Whether this customer already redeemed this code. Queries by the stored
 * fields rather than the doc id, so it finds both the deterministic
 * couponRedemptions/{uid}_{CODE} records and any legacy random-id ones.
 * A pre-check only: the atomic guarantee is the deterministic record read and
 * written inside each order transaction.
 */
export async function hasPriorCouponRedemption(
  db: Firestore,
  uid: string,
  code: string
): Promise<boolean> {
  const snap = await db
    .collection("couponRedemptions")
    .where("userId", "==", uid)
    .where("code", "==", code)
    .limit(1)
    .get();
  return !snap.empty;
}
