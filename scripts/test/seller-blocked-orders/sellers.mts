/*
 * LOCAL TEST helper — seller records for emulator harnesses.
 *
 * Every order path now refuses a product whose seller has no Approved
 * `vendors` record (lib/sellerApproval, B1). Harnesses written before that
 * seeded products with a bare vendorId and no seller behind it; they call
 * ensureApprovedSellers() after seeding so the seller they always assumed to
 * exist does. It only ADDS a record for a seller that has none — a seller a
 * suite seeded itself (Blocked, Rejected, ...) is left exactly as it is.
 */
import type { Firestore } from "firebase-admin/firestore";

export async function ensureApprovedSellers(db: Firestore): Promise<void> {
  const products = await db.collection("products").get();
  const sellerIds = new Set<string>();
  for (const d of products.docs) {
    const v = d.data()?.vendorId;
    if (typeof v === "string" && v) sellerIds.add(v);
  }
  for (const uid of sellerIds) {
    const existing = await db.collection("vendors").where("uid", "==", uid).limit(1).get();
    if (existing.empty) {
      await db.collection("vendors").add({ uid, status: "Approved", kycStatus: "Approved", businessName: uid });
    }
  }
}

/** What app/admin/vendors writes when it blocks/unblocks: vendors + mirror. */
export async function setSellerStatus(db: Firestore, uid: string, status: string): Promise<void> {
  const records = await db.collection("vendors").where("uid", "==", uid).get();
  for (const d of records.docs) await d.ref.update({ status });
  const mirror = db.collection("vendors_public").doc(uid);
  if ((await mirror.get()).exists) await mirror.update({ status });
}
