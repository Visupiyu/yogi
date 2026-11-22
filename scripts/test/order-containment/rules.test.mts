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
 *     verifying admin's own uid.
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
