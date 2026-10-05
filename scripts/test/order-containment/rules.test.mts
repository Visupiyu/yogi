/*
 * LOCAL-ONLY Firestore RULES test (emulator) — B2 containment.
 *
 * Orders can no longer be deleted by any client, admin included, and the
 * archive marker (archived, archivedAt, archivedBy, archiveReason) is
 * server-only: it is written by app/api/admin/orders/[id]/archive with the
 * Admin SDK. This proves that:
 *   - no customer, vendor, stranger or admin browser can delete an order;
 *   - no client, admin browser included, can set, change or clear the marker;
 *   - the legitimate client order access that remains (owner/admin reads,
 *     admin status updates) still works, on archived orders too.
 * The archive route itself is exercised by scripts/test/order-containment/run.mts.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/order-containment/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { addDoc, collection, deleteDoc, deleteField, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";

const hostPort = process.env.FIRESTORE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-test",
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const C = "cust_owner";
const S = "stranger";
const V = "vendor_v1";
const ADMIN_EMAIL = "adminyogimart@gmail.com";
const emailOf = (uid: string) => `${uid}@example.com`;
const as = (uid: string) => env.authenticatedContext(uid, { email: emailOf(uid), email_verified: true }).firestore();
const admin = () => env.authenticatedContext("adminUid", { email: ADMIN_EMAIL, email_verified: true }).firestore();

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "users", C), { uid: C, role: "customer", email: emailOf(C) });
  await setDoc(doc(f, "users", S), { uid: S, role: "customer", email: emailOf(S) });
  await setDoc(doc(f, "vendors", V), { uid: V, status: "Approved" });
  const order = { userId: C, vendorIds: [V], status: "Confirmed", finalTotal: 900, rewardValue: 0, items: [{ id: "p1", vendorId: V, price: 900, quantity: 1 }] };
  await setDoc(doc(f, "orders", "o_live"), order);
  await setDoc(doc(f, "orders", "o_arch"), { ...order, archived: true, archivedAt: new Date(), archivedBy: "adminUid", archiveReason: "test" });
  // H1 fixtures: one order per operational stage, plus a rider-assigned one.
  for (const st of ["Pending", "Packed", "Shipped", "Out For Delivery", "Delivered"]) {
    await setDoc(doc(f, "orders", `o_h1_${st.replace(/ /g, "_")}`), { ...order, status: st, ...(st === "Delivered" ? { deliveredAt: new Date() } : {}) });
  }
  await setDoc(doc(f, "deliveryPartners", "dp_h1"), { uid: "rider_h1", name: "Rider" });
  await setDoc(doc(f, "orders", "o_h1_rider"), { ...order, status: "Out For Delivery", deliveryPartnerId: "dp_h1" });
  // H3 fixtures: a YOMICO-funded coupon order and a legacy (unstamped) coupon order.
  await setDoc(doc(f, "orders", "o_h3_yomico"), { ...order, discount: 90, couponCode: "SAVE10", couponFundedBy: "yomico" });
  await setDoc(doc(f, "orders", "o_h3_legacy"), { ...order, discount: 90, couponCode: "SAVE10" });
});

const Cdb = as(C);
const Sdb = as(S);
const Vdb = as(V);
const ADb = admin();

// ================= delete =================
await check("D1 customer cannot delete their own order (live or archived)", async () => {
  await assertFails(deleteDoc(doc(Cdb, "orders", "o_live")));
  await assertFails(deleteDoc(doc(Cdb, "orders", "o_arch")));
});
await check("D2 vendor cannot delete an order carrying their items", async () => {
  await assertFails(deleteDoc(doc(Vdb, "orders", "o_live")));
});
await check("D3 another signed-in user and a signed-out client cannot delete an order", async () => {
  await assertFails(deleteDoc(doc(Sdb, "orders", "o_live")));
  await assertFails(deleteDoc(doc(env.unauthenticatedContext().firestore(), "orders", "o_live")));
});
await check("D4 admin browser cannot delete an order (live or archived) — archive route instead", async () => {
  await assertFails(deleteDoc(doc(ADb, "orders", "o_live")));
  await assertFails(deleteDoc(doc(ADb, "orders", "o_arch")));
});

// ================= archive marker =================
await check("M1 customer, vendor and stranger cannot archive an order (any marker field)", async () => {
  for (const db of [Cdb, Vdb, Sdb]) {
    await assertFails(updateDoc(doc(db, "orders", "o_live"), { archived: true }));
    await assertFails(updateDoc(doc(db, "orders", "o_live"), { archived: true, archivedAt: serverTimestamp(), archivedBy: "x", archiveReason: "x" }));
  }
});
await check("M2 admin browser cannot set any archive field directly", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archived: true }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archivedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archivedBy: "adminUid" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { archiveReason: "x" }));
  await assertFails(setDoc(doc(ADb, "orders", "o_live"), { archived: true }, { merge: true }));
});
await check("M3 admin browser cannot un-archive, re-stamp or strip the marker", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archived: false }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archived: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archivedBy: "someoneElse" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { archiveReason: deleteField() }));
});
await check("M4 no client can create an order that is born archived", async () => {
  await assertFails(setDoc(doc(Cdb, "orders", "o_new"), { userId: C, status: "Pending", archived: true, items: [] }));
  await assertFails(setDoc(doc(ADb, "orders", "o_new"), { userId: C, status: "Pending", archived: true, items: [] }));
});
await check("M5 a customer cannot forge an order_archived audit entry", async () => {
  await assertFails(addDoc(collection(Cdb, "audit_logs"), { actorUid: C, action: "order_archived", targetId: "o_live", createdAt: serverTimestamp() }));
});

// ================= legitimate access preserved =================
await check("L1 the owner and admin can still read the live and the archived order; a stranger cannot", async () => {
  await assertSucceeds(getDoc(doc(Cdb, "orders", "o_live")));
  await assertSucceeds(getDoc(doc(Cdb, "orders", "o_arch")));
  await assertSucceeds(getDoc(doc(ADb, "orders", "o_arch")));
  await assertFails(getDoc(doc(Sdb, "orders", "o_arch")));
});
await check("L2 admin browser non-status edits still work, on archived orders too (marker untouched)", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_live"), { needsReview: false, courierName: "Blue" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_arch"), { needsReview: false, courierName: "Blue" }));
});

// ================= H1: no admin status shortcut =================
// Packing, shipping and delivery are recorded by app/api/seller/advance-item
// and the Delivery Engine; confirm / cancel by their API routes (all Admin
// SDK). An admin browser write to status or deliveredAt is refused.
const h1 = (st: string) => doc(ADb, "orders", `o_h1_${st.replace(/ /g, "_")}`);
await check("H1-1 admin browser cannot force Packed / Shipped / Out For Delivery / Delivered (one step or skipping ahead)", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { status: "Packed" }));
  await assertFails(updateDoc(h1("Packed"), { status: "Shipped" }));
  await assertFails(updateDoc(h1("Shipped"), { status: "Out For Delivery" }));
  await assertFails(updateDoc(h1("Out For Delivery"), { status: "Delivered", deliveredAt: serverTimestamp() }));
  await assertFails(updateDoc(h1("Out For Delivery"), { status: "Delivered" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { status: "Delivered", deliveredAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_arch"), { status: "Packed" }));
});
await check("H1-2 admin browser cannot move an order backwards, confirm or cancel it directly, or touch deliveredAt", async () => {
  await assertFails(updateDoc(h1("Delivered"), { status: "Pending" }));
  await assertFails(updateDoc(h1("Shipped"), { status: "Confirmed" }));
  await assertFails(updateDoc(h1("Pending"), { status: "Confirmed" }));
  await assertFails(updateDoc(h1("Pending"), { status: "Cancelled" }));
  await assertFails(updateDoc(h1("Delivered"), { deliveredAt: serverTimestamp() }));
  await assertFails(updateDoc(h1("Delivered"), { deliveredAt: deleteField() }));
});
await check("H1-3 the assigned delivery partner's own status update still works (rider branch unchanged)", async () => {
  await assertSucceeds(updateDoc(doc(as("rider_h1"), "orders", "o_h1_rider"), {
    status: "Delivered", deliveredAt: serverTimestamp(), updatedAt: serverTimestamp(), deliveryNotes: "Handed over",
  }));
});
// ================= H3: who funds the coupon is server-only =================
await check("H3-R1 admin browser cannot remove, change or add couponFundedBy (it decides the seller's payout)", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_h3_yomico"), { couponFundedBy: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_h3_yomico"), { couponFundedBy: "seller" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_h3_legacy"), { couponFundedBy: "yomico" }));
});
await check("H3-R2 other admin edits on a coupon order still work; customer and seller still cannot write the order", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_h3_yomico"), { needsReview: false, courierName: "Blue" }));
  await assertFails(updateDoc(doc(Cdb, "orders", "o_h3_legacy"), { couponFundedBy: "yomico" }));
  await assertFails(updateDoc(doc(Vdb, "orders", "o_h3_legacy"), { couponFundedBy: "yomico" }));
});
{
  const page = fs.readFileSync(path.join(REPO, "app/admin/orders/page.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(REPO, "app/admin/page.tsx"), "utf8");
  await check("H1-4 the Admin Orders page has no status dropdown and no direct status write; dashboard shortcut removed", async () => {
    if (/<option value="(Packed|Shipped|Out For Delivery|Delivered)"/.test(page)) throw new Error("status dropdown option still present");
    if (/updateDoc\(doc\(db, "orders", [^)]*\), \{\s*status\b/.test(page)) throw new Error("direct status write still present");
    if (!page.includes("/api/confirm-order") || !page.includes("/api/cancel-order")) throw new Error("confirm / cancel routes no longer used");
    if (/updateOrderStatus|doc\(db, "orders"/.test(dashboard)) throw new Error("dashboard still writes orders");
  });
}

console.log(`\n${pass}/${pass + fail} order-containment rules checks passed`);
await env.cleanup();
process.exit(fail === 0 ? 0 : 1);
