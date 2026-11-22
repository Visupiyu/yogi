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
 *     admin status updates) still works, on archived orders too;
 *   - C1: the inventory evidence app/api/cancel-order trusts (items,
 *     stockShortfall, stockDeductedQty, inventoryRestore) is server-only —
 *     no browser, admin included, can set, change or remove it;
 *   - MF: finalTotal and paymentMethod never change in a browser, and
 *     paymentStatus moves only AwaitingVerification -> Paid, stamped with the
 *     verifying admin's own uid;
 *   - DA / DP / CH: no browser can assign an order to a delivery partner, no
 *     admin browser can give a partner record their own uid or re-point one,
 *     and the admin self-assignment chain is refused at every boundary.
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
  // C1 fixtures: orders carrying the server-owned inventory evidence.
  const evidence = {
    items: [{ id: "p1", vendorId: V, price: 450, qty: 2, variantId: "v1" }, { id: "p2", vendorId: V, price: 0, qty: 1 }],
    stockShortfall: [{ id: "p1", name: "P1", wanted: 2, available: 1 }],
    stockDeductedQty: { p1: 1, p2: 1 },
  };
  const restored = { status: "restored", evidence: "server-atomic", products: { p2: { stockRestored: 1, salesDecrement: 1, salesFloorApplied: false } } };
  await setDoc(doc(f, "orders", "o_c1_ev"), { ...order, ...evidence, paymentMethod: "ONLINE", paymentStatus: "Paid", needsReview: true });
  await setDoc(doc(f, "orders", "o_c1_cancelled"), { ...order, ...evidence, status: "Cancelled", inventoryRestore: restored });
  await setDoc(doc(f, "orders", "o_c1_verify"), { ...order, ...evidence, status: "Delivered", deliveredAt: new Date(),
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR123" });
  await setDoc(doc(f, "orders", "o_c1_rider"), { ...order, ...evidence, status: "Out For Delivery", deliveryPartnerId: "dp_h1",
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending", inventoryRestore: restored });
  // Money-field fixtures (finalTotal / paymentMethod / paymentStatus).
  await setDoc(doc(f, "orders", "o_m_online"), { ...order, paymentMethod: "ONLINE", paymentStatus: "Paid", razorpayPaymentId: "pay_x" });
  await setDoc(doc(f, "orders", "o_m_cod"), { ...order, status: "Delivered", deliveredAt: new Date(), paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
  await setDoc(doc(f, "orders", "o_m_await"), { ...order, status: "Delivered", deliveredAt: new Date(),
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR555" });
  const { finalTotal: _ft, ...noTotal } = order;
  await setDoc(doc(f, "orders", "o_m_bare"), noTotal); // no finalTotal, paymentMethod or paymentStatus
  await setDoc(doc(f, "orders", "o_m_rider"), { ...order, status: "Out For Delivery", deliveryPartnerId: "dp_h1",
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
  // Delivery-assignment / partner-identity fixtures (DA, DP, CH).
  await setDoc(doc(f, "orders", "o_da"), { ...order, status: "Shipped", deliveryPartnerId: "dp_h1", deliveryPartnerName: "Rider",
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
  await setDoc(doc(f, "orders", "o_ch"), { ...order, status: "Out For Delivery", deliveredAt: null,
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" }); // unassigned, unpaid pay-on-delivery order
  await setDoc(doc(f, "deliveryPartners", "dp_edit"), { uid: "rider_edit", name: "Edit Me", status: "Active" });
  await setDoc(doc(f, "deliveryPartners", "dp_nouid"), { name: "Legacy, no login yet", status: "Active" });
  await setDoc(doc(f, "deliveryPartners", "dp_delete"), { name: "Legacy, never had a login" }); // no uid: still deletable
  // Partner-status fixtures (PS): identical records and orders except for the partner's status.
  await setDoc(doc(f, "deliveryPartners", "dp_ps_active"), { uid: "rider_ps", name: "Active Rider", status: "Active" });
  await setDoc(doc(f, "deliveryPartners", "dp_ps_inactive"), { uid: "rider_psi", name: "Inactive Rider", status: "Inactive" });
  await setDoc(doc(f, "deliveryPartners", "dp_ps_nostatus"), { uid: "rider_psn", name: "Legacy Rider (no status field)" });
  await setDoc(doc(f, "deliveryPartners", "dp_ps_toggle"), { uid: "rider_pst", name: "Toggle Rider", status: "Active" });
  await setDoc(doc(f, "deliveryPartners", "dp_ps_uidkeep"), { uid: "rider_keep", name: "Keeps uid", status: "Active" });
  for (const [suffix, dp] of [["a", "dp_ps_active"], ["i", "dp_ps_inactive"], ["n", "dp_ps_nostatus"], ["t", "dp_ps_toggle"]] as const) {
    await setDoc(doc(f, "orders", `o_ps_${suffix}_ship`), { ...order, status: "Shipped", deliveredAt: null, deliveryPartnerId: dp,
      paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
    await setDoc(doc(f, "orders", `o_ps_${suffix}_ofd`), { ...order, status: "Out For Delivery", deliveredAt: null, deliveryPartnerId: dp,
      paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
  }
  // A pre-existing BAD record (legacy data): a partner doc already carrying the admin's uid, and an order assigned to it.
  await setDoc(doc(f, "deliveryPartners", "dp_badlegacy"), { uid: "adminUid", name: "Legacy bad record" });
  await setDoc(doc(f, "orders", "o_badlegacy"), { ...order, status: "Packed", deliveryPartnerId: "dp_badlegacy",
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
  // Same bad legacy assignment on an Out For Delivery order (CH-6: deactivating the record closes the path).
  await setDoc(doc(f, "orders", "o_badlegacy_ofd"), { ...order, status: "Out For Delivery", deliveredAt: null, deliveryPartnerId: "dp_badlegacy",
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
  // Same bad legacy assignment on an order already at Shipped (CH-5 accepted residual risk).
  await setDoc(doc(f, "orders", "o_badlegacy_shipped"), { ...order, status: "Shipped", deliveredAt: null, deliveryPartnerId: "dp_badlegacy",
    paymentMethod: "PAY_ON_DELIVERY_UPI", paymentStatus: "Pending" });
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

// ================= C1: inventory evidence is server-only =================
// app/api/cancel-order decides how much stock to restore from items,
// stockShortfall, stockDeductedQty (and records inventoryRestore). No browser,
// admin included, may set, change or remove them.
const C1_PROTECTED = ["items", "stockShortfall", "stockDeductedQty", "inventoryRestore"];
await check("C1-1 admin browser cannot change, add or delete stockShortfall", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { stockShortfall: [{ id: "p1", name: "P1", wanted: 2, available: 2 }] }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { stockShortfall: [] }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { stockShortfall: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { stockShortfall: [{ id: "p1", wanted: 1, available: 0 }] }));
});
await check("C1-2 admin browser cannot change, add or delete stockDeductedQty", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { stockDeductedQty: { p1: 2, p2: 1 } }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { "stockDeductedQty.p1": 5 }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { stockDeductedQty: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { stockDeductedQty: { p1: 1 } }));
});
await check("C1-3 admin browser cannot change item quantity or variant, add or remove a line, or delete items", async () => {
  const items = [{ id: "p1", vendorId: V, price: 450, qty: 2, variantId: "v1" }, { id: "p2", vendorId: V, price: 0, qty: 1 }];
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { items: [{ ...items[0], qty: 9 }, items[1]] }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { items: [{ ...items[0], variantId: "v2" }, items[1]] }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { items: [...items, { id: "p3", vendorId: V, price: 10, qty: 4 }] }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { items: [items[0]] }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { items: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { items: [] }));
});
await check("C1-4 admin browser cannot change, add or delete inventoryRestore", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_cancelled"), { inventoryRestore: { status: "skipped-unverified", evidence: "unverified", products: {} } }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_cancelled"), { "inventoryRestore.status": "partially-restored" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_cancelled"), { inventoryRestore: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { inventoryRestore: { status: "restored", evidence: "server-atomic", products: {} } }));
});
await check("C1-5 a legitimate admin edit bundled with a protected field is refused as a whole", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { needsReview: false, stockShortfall: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_c1_ev"), { courierName: "Blue", items: deleteField() }));
});
await check("C1-6 admin review, refund recording and shipping edits still work on an order carrying the evidence", async () => {
  // Same field sets app/admin/orders/page.tsx writes (review :537, refund :644 / :719, shipping :758).
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_c1_ev"), { needsReview: false, reviewedAt: serverTimestamp(), reviewedBy: "adminUid" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_c1_ev"), { refundStatus: "Processing", recordedByEmail: ADMIN_EMAIL }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_c1_cancelled"), { refundStatus: "Refunded", refundedAmount: 900, refundedAt: serverTimestamp(), refundedBy: "adminUid" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_c1_ev"), { courierName: "Blue Dart" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_c1_ev"), { trackingNumber: "BD123" }));
});
await check("C1-7 admin delivery-payment verification still works (lib/deliveryPayment verifyDeliveryPayment field set)", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_c1_verify"), {
    paymentStatus: "Paid", paymentVerifiedAt: serverTimestamp(), paymentVerifiedBy: "adminUid", paymentVerifiedByName: "Admin", updatedAt: serverTimestamp(),
  }));
});
await check("C1-8 the assigned delivery partner cannot touch any protected field; their payment submission still works", async () => {
  const rider = as("rider_h1");
  for (const field of C1_PROTECTED) {
    await assertFails(updateDoc(doc(rider, "orders", "o_c1_rider"), { [field]: deleteField() }));
    await assertFails(updateDoc(doc(rider, "orders", "o_c1_rider"), { [field]: { tampered: true } }));
  }
  await assertFails(updateDoc(doc(rider, "orders", "o_c1_rider"), { deliveryNotes: "left at door", stockDeductedQty: { p1: 2 } }));
  await assertSucceeds(updateDoc(doc(rider, "orders", "o_c1_rider"), {
    paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR999", paymentSubmittedAt: serverTimestamp(),
    paymentConfirmedBy: "rider_h1", paymentConfirmedByName: "Rider", updatedAt: serverTimestamp(),
  }));
});
await check("C1-9 customer, vendor and stranger still cannot write any protected field", async () => {
  for (const db of [Cdb, Vdb, Sdb]) {
    for (const field of C1_PROTECTED) await assertFails(updateDoc(doc(db, "orders", "o_c1_ev"), { [field]: deleteField() }));
  }
});

// ================= MF: order money fields are server-owned =================
// finalTotal and paymentMethod never change in a browser; paymentStatus moves
// only AwaitingVerification -> Paid, by the verifying admin (paymentVerifiedBy).
const verifyFields = (uid: string) => ({
  paymentStatus: "Paid", paymentVerifiedAt: serverTimestamp(), paymentVerifiedBy: uid, paymentVerifiedByName: "Admin", updatedAt: serverTimestamp(),
});
await check("MF-1 admin browser cannot modify, delete or add finalTotal", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { finalTotal: 90000 }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { finalTotal: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_bare"), { finalTotal: 100 }));
});
await check("MF-2 admin browser cannot modify, delete or add paymentMethod", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_cod"), { paymentMethod: "ONLINE" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { paymentMethod: "PAY_ON_DELIVERY_UPI" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { paymentMethod: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_bare"), { paymentMethod: "ONLINE" }));
});
await check("MF-3 admin browser cannot set Pending -> Paid, Paid -> Pending / Refunded / AwaitingVerification, delete or add paymentStatus", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_cod"), { paymentStatus: "Paid" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_cod"), verifyFields("adminUid"))); // Pending, not AwaitingVerification
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { paymentStatus: "Pending" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { paymentStatus: "Refunded" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { paymentStatus: "AwaitingVerification" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { paymentStatus: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_bare"), { paymentStatus: "Paid" }));
});
await check("MF-4 AwaitingVerification -> Paid is refused when paymentVerifiedBy is another uid or missing; other targets refused", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_await"), verifyFields("someoneElse")));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_await"), { paymentStatus: "Paid", paymentVerifiedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_await"), { paymentStatus: "Refunded", paymentVerifiedBy: "adminUid" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_await"), { paymentStatus: "Pending" }));
});
await check("MF-5 a legitimate admin edit bundled with a money-field change is refused as a whole", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_online"), { needsReview: false, finalTotal: 1 }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_cod"), { courierName: "Blue", paymentStatus: "Paid" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_await"), { ...verifyFields("adminUid"), finalTotal: 1 }));
});
await check("MF-6 the real verification (AwaitingVerification -> Paid, paymentVerifiedBy = acting admin) succeeds", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_m_await"), verifyFields("adminUid")));
  const after = (await getDoc(doc(ADb, "orders", "o_m_await"))).data();
  if (after?.paymentStatus !== "Paid" || after?.paymentVerifiedBy !== "adminUid") throw new Error("verification not recorded");
  // Once Paid, the admin browser cannot move it again.
  await assertFails(updateDoc(doc(ADb, "orders", "o_m_await"), { paymentStatus: "AwaitingVerification" }));
});
await check("MF-7 ordinary admin edits still work on money orders (review, refund recording, shipping)", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_m_online"), { needsReview: false, reviewedAt: serverTimestamp(), reviewedBy: "adminUid" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_m_online"), { refundStatus: "Processing", recordedByEmail: ADMIN_EMAIL }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_m_cod"), { courierName: "Blue Dart", trackingNumber: "BD9" }));
});
await check("MF-8 rider Pending -> AwaitingVerification still works; rider cannot touch finalTotal / paymentMethod or set Paid", async () => {
  const rider = as("rider_h1");
  await assertFails(updateDoc(doc(rider, "orders", "o_m_rider"), { finalTotal: 1 }));
  await assertFails(updateDoc(doc(rider, "orders", "o_m_rider"), { paymentMethod: "ONLINE" }));
  await assertFails(updateDoc(doc(rider, "orders", "o_m_rider"), { paymentStatus: "Paid" }));
  await assertSucceeds(updateDoc(doc(rider, "orders", "o_m_rider"), {
    paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR777", paymentSubmittedAt: serverTimestamp(),
    paymentConfirmedBy: "rider_h1", paymentConfirmedByName: "Rider", updatedAt: serverTimestamp(),
  }));
});
await check("MF-9 customer, vendor and stranger cannot modify any money field", async () => {
  for (const db of [Cdb, Vdb, Sdb]) {
    await assertFails(updateDoc(doc(db, "orders", "o_m_cod"), { paymentStatus: "Paid" }));
    await assertFails(updateDoc(doc(db, "orders", "o_m_online"), { finalTotal: 1 }));
    await assertFails(updateDoc(doc(db, "orders", "o_m_online"), { paymentMethod: deleteField() }));
  }
});

// ================= DA: delivery assignment is server-only =================
// deliveryPartnerId decides who passes isAssignedDeliveryPartner(); assignment
// runs through the Delivery Engine server routes, never a browser write.
await check("DA-1 admin browser cannot change, delete or add deliveryPartnerId", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_da"), { deliveryPartnerId: "dp_edit" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_da"), { deliveryPartnerId: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_da"), { deliveryPartnerId: "" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { deliveryPartnerId: "dp_h1" }));
});
await check("DA-2 admin browser cannot change, delete or add deliveryPartnerName", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_da"), { deliveryPartnerName: "Someone Else" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_da"), { deliveryPartnerName: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_live"), { deliveryPartnerName: "Rider" }));
});
await check("DA-3 ordinary admin edits still work on assigned and unassigned orders (review, refund recording, shipping)", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_da"), { needsReview: false, reviewedAt: serverTimestamp(), reviewedBy: "adminUid" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_da"), { refundStatus: "Processing", recordedByEmail: ADMIN_EMAIL }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_da"), { courierName: "Blue Dart", trackingNumber: "BD10" }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_live"), { courierName: "Blue Dart" }));
});

// ================= DP: delivery-partner identity =================
await check("DP-1 admin browser cannot create a partner carrying their own uid", async () => {
  await assertFails(setDoc(doc(ADb, "deliveryPartners", "dp_self"), { uid: "adminUid", name: "Me", status: "Active" }));
  await assertFails(addDoc(collection(ADb, "deliveryPartners"), { uid: "adminUid", name: "Me" }));
});
await check("DP-2 admin browser cannot re-point an existing partner's uid (to their own, to another uid, or by removing it)", async () => {
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_edit"), { uid: "adminUid" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_edit"), { uid: "rider_other" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_edit"), { uid: deleteField() }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_h1"), { uid: "adminUid" }));
});
await check("DP-3 malformed or missing uid is refused on create; a legacy partner cannot be given the admin's own uid", async () => {
  await assertFails(setDoc(doc(ADb, "deliveryPartners", "dp_m1"), { name: "No uid" }));
  await assertFails(setDoc(doc(ADb, "deliveryPartners", "dp_m2"), { uid: "", name: "Empty uid" }));
  await assertFails(setDoc(doc(ADb, "deliveryPartners", "dp_m3"), { uid: 12345, name: "Numeric uid" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid"), { uid: "adminUid" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid"), { uid: "" }));
});
await check("DP-4 legitimate partner management still works (app/admin/delivery-partners create / edit / add login / toggle / delete)", async () => {
  // create (:178) — uid from a NEW Auth account, never the admin's
  await assertSucceeds(addDoc(collection(ADb, "deliveryPartners"), {
    name: "New Rider", phone: "999", email: "new.rider@example.com", vehicleNumber: "KA01", vehicleType: "Bike",
    dailyCapacity: 20, serviceArea: "North", companyId: "", companyName: "", uid: "rider_new", status: "Active", createdAt: serverTimestamp(),
  }));
  // edit (:161) — same fields, same uid re-sent
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_edit"), { name: "Edited", phone: "888", uid: "rider_edit" }));
  // edit a legacy partner that has no login yet — the page adds the new account's uid once
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid"), { name: "Now with login", uid: "rider_fresh" }));
  // ...and once set it is fixed like any other
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid"), { uid: "rider_fresh2" }));
  // status toggle (:255), and delete (:245) of a legacy record that never had a login
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_edit"), { status: "Inactive" }));
  await assertSucceeds(deleteDoc(doc(ADb, "deliveryPartners", "dp_delete")));
});
await check("DP-5 non-admins still cannot write partner records; a partner still reads only their own", async () => {
  for (const db of [Cdb, Vdb, Sdb, as("rider_h1")]) {
    await assertFails(setDoc(doc(db, "deliveryPartners", "dp_x"), { uid: "rider_x", name: "X" }));
    await assertFails(updateDoc(doc(db, "deliveryPartners", "dp_h1"), { name: "Renamed" }));
  }
  await assertSucceeds(getDoc(doc(as("rider_h1"), "deliveryPartners", "dp_h1")));
  await assertFails(getDoc(doc(as("rider_h1"), "deliveryPartners", "dp_edit")));
});

// ================= CH: the admin self-assignment chain is blocked =================
// 1 own-uid partner identity -> 2 assign the order -> 3 move status as "rider"
// -> 4 submit payment as "rider" -> 5 verify as admin. Each boundary refuses.
await check("CH-1 step 1 refused: the admin cannot mint or re-point a partner identity to their own uid", async () => {
  await assertFails(setDoc(doc(ADb, "deliveryPartners", "dp_chain"), { uid: "adminUid", name: "Self" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_h1"), { uid: "adminUid" }));
});
await check("CH-2 step 2 refused: the admin cannot point the order at any partner (own or a real rider's)", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_ch"), { deliveryPartnerId: "dp_chain" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_ch"), { deliveryPartnerId: "dp_h1", deliveryPartnerName: "Rider" }));
});
await check("CH-3 steps 3-5 refused on the unassigned order: no rider status move, no payment submission, no verification", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_ch"), { status: "Delivered", deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_ch"), {
    paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR-FAKE", paymentSubmittedAt: serverTimestamp(),
    paymentConfirmedBy: "adminUid", paymentConfirmedByName: "Admin", updatedAt: serverTimestamp(),
  }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_ch"), {
    paymentStatus: "Paid", paymentVerifiedAt: serverTimestamp(), paymentVerifiedBy: "adminUid", paymentVerifiedByName: "Admin", updatedAt: serverTimestamp(),
  }));
  const after = (await getDoc(doc(ADb, "orders", "o_ch"))).data();
  if (after?.status !== "Out For Delivery" || after?.paymentStatus !== "Pending" || "deliveryPartnerId" in (after || {})) {
    throw new Error("order changed");
  }
});
await check("CH-4 legacy bad record (partner doc already holding the admin's uid), order at Packed: Packed -> Cancelled, Packed -> Shipped and re-assignment are refused", async () => {
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy"), { status: "Cancelled", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy"), { status: "Shipped", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy"), { deliveryPartnerId: "dp_h1" }));
});
// ACCEPTED RESIDUAL RISK — legacy DATA, not introduced by and not fixed by these
// rules. If an ACTIVE deliveryPartners record ALREADY carries an admin's uid
// (created before the identity rules) and an order is ALREADY assigned to it,
// that admin still passes isAssignedDeliveryPartner() on that order, so the
// legitimate rider delivery leg and the delivery-payment submission remain open
// to them, and the admin verification after it. Finding such records (a
// separate, authorized read-only data task) and DEACTIVATING them closes it —
// CH-6 shows that. This check PINS today's behaviour for a still-active record
// so any change to it is noticed; it is not a protection.
await check("CH-5 ACCEPTED RESIDUAL RISK (legacy data, not fixed by rules): on an order already assigned to a partner record holding the admin's uid, the rider delivery leg, payment submission and verification still succeed", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_badlegacy_shipped"), { status: "Out For Delivery", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_badlegacy_shipped"), {
    status: "Delivered", deliveredAt: serverTimestamp(), proofImage: "https://example.invalid/residual.jpg", updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_badlegacy_shipped"), {
    paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR-RESIDUAL", paymentSubmittedAt: serverTimestamp(),
    paymentConfirmedBy: "adminUid", paymentConfirmedByName: "Admin", updatedAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(doc(ADb, "orders", "o_badlegacy_shipped"), {
    paymentStatus: "Paid", paymentVerifiedAt: serverTimestamp(), paymentVerifiedBy: "adminUid", paymentVerifiedByName: "Admin", updatedAt: serverTimestamp(),
  }));
  // The new protections still hold on this order: no cancel from Delivered, no re-assignment.
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy_shipped"), { status: "Cancelled", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy_shipped"), { deliveryPartnerId: "dp_h1" }));
});
await check("CH-6 the residual risk is closed by deactivating the bad legacy record (uid kept, record not deletable): no rider move or payment submission afterwards", async () => {
  await assertFails(deleteDoc(doc(ADb, "deliveryPartners", "dp_badlegacy"))); // uid-bearing: deactivate, never delete
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_badlegacy"), { status: "Inactive" }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy_ofd"), { status: "Delivered", deliveredAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(ADb, "orders", "o_badlegacy_ofd"), {
    paymentStatus: "AwaitingVerification", paymentTransactionId: "UTR-AFTER", paymentSubmittedAt: serverTimestamp(),
    paymentConfirmedBy: "adminUid", paymentConfirmedByName: "Admin", updatedAt: serverTimestamp(),
  }));
  // Reactivating it would reopen the path — the record's uid cannot be changed, only its status.
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_badlegacy"), { status: "Active", uid: "rider_h1" }));
});

// ================= PD: partner records are deactivated, never deleted once they have a login =================
await check("PD-1 a uid-bearing partner cannot be hard-deleted (active, inactive or missing-status record)", async () => {
  await assertFails(deleteDoc(doc(ADb, "deliveryPartners", "dp_ps_active")));
  await assertFails(deleteDoc(doc(ADb, "deliveryPartners", "dp_ps_inactive")));
  await assertFails(deleteDoc(doc(ADb, "deliveryPartners", "dp_ps_nostatus")));
});
await check("PD-2 delete-and-recreate under the same id is stopped at the delete; writing the id again is an update and cannot re-point the uid", async () => {
  await assertFails(deleteDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep")));
  await assertFails(setDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"), { uid: "rider_other", name: "Recreated", status: "Active" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"), { uid: deleteField() }));
  const after = (await getDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"))).data();
  if (after?.uid !== "rider_keep") throw new Error("uid changed");
});
await check("PD-3 a legacy record with no uid can still be deleted, or given an acceptable uid once (and then is no longer deletable)", async () => {
  // Fresh no-uid legacy records (dp_nouid already received a uid in DP-4).
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "deliveryPartners", "dp_nouid2"), { name: "Legacy, no login", status: "Active" });
    await setDoc(doc(ctx.firestore(), "deliveryPartners", "dp_nouid3"), { name: "Legacy, no login, to delete" });
  });
  await assertSucceeds(deleteDoc(doc(ADb, "deliveryPartners", "dp_nouid3")));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid2"), { uid: "adminUid" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid2"), { uid: "" }));
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_nouid2"), { uid: "rider_legacy_new" }));
  await assertFails(deleteDoc(doc(ADb, "deliveryPartners", "dp_nouid2"))); // now uid-bearing
});
await check("PD-4 deactivation and reactivation succeed and never move the uid; a deactivated record cannot be re-pointed or self-assigned", async () => {
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"), { status: "Inactive" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"), { uid: "rider_other" }));
  await assertFails(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"), { status: "Active", uid: "adminUid" }));
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"), { status: "Active" }));
  const after = (await getDoc(doc(ADb, "deliveryPartners", "dp_ps_uidkeep"))).data();
  if (after?.uid !== "rider_keep" || after?.status !== "Active") throw new Error("uid or status wrong after toggle");
});

// ================= PS: an assigned partner acts only while Active =================
// Each pair is identical except the partner record's status, so every refusal
// below is the status rule (isActivePartnerRecordFor), not something else.
const submitPayment = (uid: string) => ({
  paymentStatus: "AwaitingVerification", paymentTransactionId: `UTR-${uid}`, paymentSubmittedAt: serverTimestamp(),
  paymentConfirmedBy: uid, paymentConfirmedByName: "Rider", updatedAt: serverTimestamp(),
});
await check("PS-1 Active assigned partner: reads the order, makes rider moves, edits notes/proof, submits payment", async () => {
  const r = as("rider_ps");
  await assertSucceeds(getDoc(doc(r, "orders", "o_ps_a_ship")));
  await assertSucceeds(updateDoc(doc(r, "orders", "o_ps_a_ship"), { status: "Out For Delivery", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(r, "orders", "o_ps_a_ship"), { deliveryNotes: "Gate 2", proofImage: "https://example.invalid/a.jpg", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(r, "orders", "o_ps_a_ofd"), submitPayment("rider_ps")));
});
await check("PS-2 Deactivated assigned partner: cannot read the order, move it, edit notes/proof or submit payment", async () => {
  const r = as("rider_psi");
  await assertFails(getDoc(doc(r, "orders", "o_ps_i_ship")));
  await assertFails(updateDoc(doc(r, "orders", "o_ps_i_ship"), { status: "Out For Delivery", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(r, "orders", "o_ps_i_ship"), { deliveryNotes: "Gate 2", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(r, "orders", "o_ps_i_ship"), { proofImage: "https://example.invalid/i.jpg", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(r, "orders", "o_ps_i_ofd"), submitPayment("rider_psi")));
});
await check("PS-3 legacy partner record with NO status field is treated as Active (read, move, payment)", async () => {
  const r = as("rider_psn");
  await assertSucceeds(getDoc(doc(r, "orders", "o_ps_n_ship")));
  await assertSucceeds(updateDoc(doc(r, "orders", "o_ps_n_ship"), { status: "Out For Delivery", updatedAt: serverTimestamp() }));
  await assertSucceeds(updateDoc(doc(r, "orders", "o_ps_n_ofd"), submitPayment("rider_psn")));
});
await check("PS-4 deactivating a partner revokes access at once; reactivating restores it (same uid, same record)", async () => {
  const r = as("rider_pst");
  await assertSucceeds(getDoc(doc(r, "orders", "o_ps_t_ship")));
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_toggle"), { status: "Inactive" }));
  await assertFails(getDoc(doc(r, "orders", "o_ps_t_ship")));
  await assertFails(updateDoc(doc(r, "orders", "o_ps_t_ship"), { status: "Out For Delivery", updatedAt: serverTimestamp() }));
  await assertFails(updateDoc(doc(r, "orders", "o_ps_t_ofd"), submitPayment("rider_pst")));
  await assertSucceeds(updateDoc(doc(ADb, "deliveryPartners", "dp_ps_toggle"), { status: "Active" }));
  await assertSucceeds(getDoc(doc(r, "orders", "o_ps_t_ship")));
  await assertSucceeds(updateDoc(doc(r, "orders", "o_ps_t_ship"), { status: "Out For Delivery", updatedAt: serverTimestamp() }));
});
await check("PS-5 a partner (active or not) assigned to nothing on the order stays denied; admin and owner reads unchanged", async () => {
  await assertFails(getDoc(doc(as("rider_ps"), "orders", "o_ps_i_ship")));
  await assertFails(updateDoc(doc(as("rider_ps"), "orders", "o_ps_n_ofd"), { deliveryNotes: "not mine", updatedAt: serverTimestamp() }));
  await assertFails(getDoc(doc(as("rider_psi"), "orders", "o_ps_a_ofd")));
  await assertSucceeds(getDoc(doc(ADb, "orders", "o_ps_i_ship")));
  await assertSucceeds(getDoc(doc(Cdb, "orders", "o_ps_i_ship")));
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
