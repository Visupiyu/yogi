/*
 * LOCAL-ONLY Firestore RULES test (emulator) — Seller Business.
 *   - registration (vendors create) accepts only the fields app/vendor-register
 *     writes: no self-assigned tax verification, sellerNumber, reputation or
 *     business-change stamps, and counters start at 0;
 *   - once KYC is approved, the business identity, contact and address are
 *     frozen for the seller like the bank/identity numbers already were
 *     (they change through an admin-approved request); store presentation
 *     (aboutStore, logo, banner) stays editable; a pending applicant can still
 *     correct their details;
 *   - vendors_public: the seller may restyle (logo/banner) only — no
 *     rating/sales counters, no business identity;
 *   - vendorChangeRequests: server-only writes; a seller reads only their own.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/seller-business/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  addDoc, collection, deleteDoc, deleteField, doc, getDoc, getDocs, query, serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";

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

const ADMIN_EMAIL = "adminyogimart@gmail.com";
const as = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const adminDb = () => as("adminUid", ADMIN_EMAIL);

// Exactly what app/vendor-register writes.
const registration = (uid: string) => ({
  uid, fullName: "New Seller", email: `${uid}@example.com`, businessPhone: "9876543210",
  businessName: "New Seller Co", gstNumber: "", businessType: "Sole Proprietorship",
  street: "1 Road", unit: "", zipCode: "380001", city: "Ahmedabad", state: "Gujarat",
  accountHolder: "New Seller", bankName: "Bank", accountNumber: "123456789012", ifsc: "TEST0001234",
  panNumber: "ABCDE1234F", aadhaarNumber: "123412341234",
  // The applicant's own Storage object paths — what app/vendor-register stores (F-4).
  gstDocUrl: "", aadhaarDocUrl: `vendor-kyc/${uid}/aadhaar-1-a.pdf`, chequeDocUrl: `vendor-kyc/${uid}/cheque-1-c.pdf`,
  kycStatus: "Pending", agreed: true, storeLogo: "", storeBanner: "", rating: 0, totalProducts: 0,
  status: "Pending", commissionRate: 0, totalSales: 0, totalOrders: 0, totalRevenue: 0, pendingPayout: 0,
  createdAt: serverTimestamp(),
});

const APPROVED = {
  uid: "sellerA", fullName: "Asha", email: "asha@example.com", businessPhone: "9876543210",
  businessName: "Asha Traders", businessType: "Sole Proprietorship", street: "1 Road", unit: "",
  zipCode: "380001", city: "Ahmedabad", state: "Gujarat", accountHolder: "Asha", bankName: "Bank",
  accountNumber: "123456789012", ifsc: "TEST0001234", aboutStore: "About", storeLogo: "", storeBanner: "",
  status: "Approved", kycStatus: "Approved", commissionRate: 0,
};

await env.clearFirestore();
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "vendors", "v_approved"), APPROVED);
  await setDoc(doc(f, "vendors", "v_pending"), { ...APPROVED, uid: "sellerP", status: "Pending", kycStatus: "Pending" });
  // A seller whose GST profile was submitted (app/api/seller/tax-profile) and
  // rejected once by the admin review route — every tax field present.
  await setDoc(doc(f, "vendors", "v_tax"), {
    ...APPROVED, uid: "sellerT", email: "tax@example.com",
    taxProfile: { gstStatus: "REGISTERED", gstin: "27AAPFU0939F1ZV" },
    taxVerificationStatus: "REJECTED", taxVerifiedAt: new Date("2026-11-01T00:00:00Z"), taxVerifiedBy: "adminUid",
    taxRejectionReason: "Certificate unreadable",
  });
  // A seller with no tax profile yet.
  await setDoc(doc(f, "vendors", "v_notax"), { ...APPROVED, uid: "sellerN", email: "notax@example.com" });
  await setDoc(doc(f, "vendors_public", "sellerA"), {
    uid: "sellerA", businessName: "Asha Traders", fullName: "Asha", email: "asha@example.com", businessPhone: "9876543210",
    businessType: "Sole Proprietorship", city: "Ahmedabad", state: "Gujarat", storeLogo: "", storeBanner: "",
    rating: 0, totalOrders: 0, totalSales: 0, totalRevenue: 0, status: "Approved",
  });
  await setDoc(doc(f, "vendorChangeRequests", "sellerA_k1"), {
    vendorUid: "sellerA", vendorDocId: "v_approved", section: "business", status: "PENDING",
    changes: { businessName: "Asha LLP" }, previous: { businessName: "Asha Traders" },
  });
  await setDoc(doc(f, "vendorChangeRequests", "sellerB_k1"), {
    vendorUid: "sellerB", vendorDocId: "v_b", section: "bank", status: "PENDING",
    changes: { accountNumber: "555566667777" }, previous: { accountNumber: "999988887777" },
  });
});

// ---------- registration ----------
await check("R1  registration with exactly the vendor-register fields still allowed", () =>
  assertSucceeds(addDoc(collection(as("newSeller1"), "vendors"), registration("newSeller1"))));
for (const [label, extra] of [
  ["taxVerificationStatus VERIFIED", { taxVerificationStatus: "VERIFIED" }],
  ["a taxProfile", { taxProfile: { gstStatus: "REGISTERED", gstin: "24ABCDE1234F1Z5" } }],
  ["taxVerifiedBy", { taxVerifiedBy: "admin" }],
  ["a sellerNumber", { sellerNumber: "SELLER00001" }],
  ["bankDetailsUpdatedAt / bankProofPath", { bankProofPath: "vendor-kyc/x/p.pdf" }],
  ["an unknown field", { isFeatured: true }],
  ["rating 5", { rating: 5 }],
  ["commissionRate 0.1", { commissionRate: 0.1 }],
  ["totalSales 100000", { totalSales: 100000 }],
  ["pendingPayout 500", { pendingPayout: 500 }],
] as const) {
  await check(`R2  registration carrying ${label} DENIED`, () =>
    assertFails(addDoc(collection(as("newSeller2"), "vendors"), { ...registration("newSeller2"), ...extra })));
}
await check("R3  registration as Approved / KYC Approved still DENIED (unchanged)", async () => {
  await assertFails(addDoc(collection(as("newSeller3"), "vendors"), { ...registration("newSeller3"), status: "Approved" }));
  await assertFails(addDoc(collection(as("newSeller3"), "vendors"), { ...registration("newSeller3"), kycStatus: "Approved" }));
});

// ---------- approved identity frozen ----------
const approved = () => doc(as("sellerA", "asha@example.com"), "vendors", "v_approved");
for (const [field, value] of [
  ["businessName", "Renamed"], ["fullName", "Someone Else"], ["businessType", "LLP"], ["businessPhone", "9000000000"],
  ["email", "other@example.com"], ["street", "9 Other Road"], ["unit", "B"], ["zipCode", "110001"],
  ["city", "Delhi"], ["state", "Delhi"],
] as const) {
  await check(`F1  approved seller CANNOT change ${field}`, () => assertFails(updateDoc(approved(), { [field]: value })));
}
await check("F2  approved seller CANNOT set businessDetailsUpdatedAt / bankDetailsUpdatedAt / bankProofPath", async () => {
  await assertFails(updateDoc(approved(), { businessDetailsUpdatedAt: new Date() }));
  await assertFails(updateDoc(approved(), { bankDetailsUpdatedAt: new Date() }));
  await assertFails(updateDoc(approved(), { bankProofPath: "vendor-kyc/sellerA/x.pdf" }));
});
await check("F3  approved seller CAN still edit store presentation (the new settings save: aboutStore, logo, banner)", () =>
  assertSucceeds(updateDoc(approved(), { aboutStore: "New about", storeLogo: "https://x/l.png", storeBanner: "https://x/b.png" })));
await check("F4  approved seller whole-document save with business values unchanged still allowed", async () => {
  let data: any;
  await env.withSecurityRulesDisabled(async (ctx) => { data = (await getDoc(doc(ctx.firestore(), "vendors", "v_approved"))).data(); });
  await assertSucceeds(setDoc(approved(), { ...data, aboutStore: "Whole save" }));
});
await check("F5  pending applicant can still correct business name and address (preserved)", () =>
  assertSucceeds(updateDoc(doc(as("sellerP"), "vendors", "v_pending"), { businessName: "Fixed Name", street: "2 Road" })));
await check("F6  admin can still update business fields directly (admin access unchanged)", () =>
  assertSucceeds(updateDoc(doc(adminDb(), "vendors", "v_approved"), { businessName: "Admin Fix" })));

// ---------- GST profile & verification: server routes only, admin browser included (F3) ----------
const taxDoc = (db = adminDb()) => doc(db, "vendors", "v_tax");
for (const [label, change] of [
  ["set taxVerificationStatus VERIFIED", { taxVerificationStatus: "VERIFIED" }],
  ["set taxVerificationStatus PENDING", { taxVerificationStatus: "PENDING" }],
  ["remove taxVerificationStatus", { taxVerificationStatus: deleteField() }],
  ["set taxVerifiedAt", { taxVerifiedAt: new Date() }],
  ["set taxVerifiedBy", { taxVerifiedBy: "someoneElse" }],
  ["clear taxRejectionReason", { taxRejectionReason: deleteField() }],
  ["rewrite taxRejectionReason", { taxRejectionReason: "" }],
  ["change taxProfile.gstStatus", { "taxProfile.gstStatus": "COMPOSITION" }],
  ["change taxProfile.gstin", { "taxProfile.gstin": "24AAACC1206D1ZM" }],
  ["replace taxProfile", { taxProfile: { gstStatus: "UNREGISTERED" } }],
  ["remove taxProfile", { taxProfile: deleteField() }],
] as const) {
  await check(`T1  admin browser CANNOT ${label}`, () => assertFails(updateDoc(taxDoc(), change as never)));
}
await check("T2  admin browser CANNOT add a taxProfile or a VERIFIED status to a seller that has none", async () => {
  await assertFails(updateDoc(doc(adminDb(), "vendors", "v_notax"), { taxProfile: { gstStatus: "REGISTERED", gstin: "27AAPFU0939F1ZV" } }));
  await assertFails(updateDoc(doc(adminDb(), "vendors", "v_notax"), { taxVerificationStatus: "VERIFIED", taxVerifiedBy: "adminUid" }));
});
await check("T3  admin browser CANNOT slip a VERIFIED status into an otherwise legitimate block", () =>
  assertFails(updateDoc(taxDoc(), { status: "Blocked", taxVerificationStatus: "VERIFIED" })));
await check("T4  legitimate admin vendor updates on a seller WITH tax fields still allowed: business fix, block, unblock, whole-document save with tax fields unchanged", async () => {
  await assertSucceeds(updateDoc(taxDoc(), { businessName: "Admin Fix T" }));
  await assertSucceeds(updateDoc(taxDoc(), { status: "Blocked" }));
  await assertSucceeds(updateDoc(taxDoc(), { status: "Approved" }));
  let data: any;
  await env.withSecurityRulesDisabled(async (ctx) => { data = (await getDoc(doc(ctx.firestore(), "vendors", "v_tax"))).data(); });
  await assertSucceeds(setDoc(taxDoc(), { ...data, aboutStore: "Admin whole save" }));
});
await check("T5  admin browser still CANNOT decide KYC (unchanged)", () =>
  assertFails(updateDoc(taxDoc(), { kycStatus: "Rejected" })));
await check("T6  the seller still CANNOT change their own taxProfile / verification fields (owner restriction unchanged)", async () => {
  const own = doc(as("sellerT", "tax@example.com"), "vendors", "v_tax");
  await assertFails(updateDoc(own, { taxVerificationStatus: "VERIFIED" }));
  await assertFails(updateDoc(own, { "taxProfile.gstStatus": "UNREGISTERED" }));
  await assertFails(updateDoc(own, { taxVerifiedBy: "sellerT" }));
  await assertFails(updateDoc(own, { taxRejectionReason: deleteField() }));
  await assertSucceeds(updateDoc(own, { aboutStore: "Seller still edits presentation" }));
});
await check("T7  the stored tax fields are exactly as seeded after every attempt above", async () => {
  let data: any;
  await env.withSecurityRulesDisabled(async (ctx) => { data = (await getDoc(doc(ctx.firestore(), "vendors", "v_tax"))).data(); });
  if (data.taxVerificationStatus !== "REJECTED" || data.taxProfile?.gstStatus !== "REGISTERED" || data.taxProfile?.gstin !== "27AAPFU0939F1ZV" ||
    data.taxVerifiedBy !== "adminUid" || data.taxRejectionReason !== "Certificate unreadable") throw new Error(JSON.stringify(data));
});

// ---------- vendors_public ----------
const pub = () => doc(as("sellerA", "asha@example.com"), "vendors_public", "sellerA");
await check("P1  seller CAN update storefront logo / banner (settings merge)", () =>
  assertSucceeds(setDoc(pub(), { uid: "sellerA", storeLogo: "https://x/l2.png", storeBanner: "https://x/b2.png" }, { merge: true })));
for (const [field, value] of [
  ["rating", 5], ["totalOrders", 999], ["totalSales", 99999], ["totalRevenue", 99999],
  ["businessName", "Fake Name"], ["email", "x@example.com"], ["businessPhone", "9000000000"], ["city", "Delhi"],
] as const) {
  await check(`P2  seller CANNOT set storefront ${field}`, () => assertFails(updateDoc(pub(), { [field]: value })));
}
await check("P3  new storefront profile: Pending with zero reputation allowed; with rating 5 DENIED", async () => {
  const base = { uid: "newPub", businessName: "New", status: "Pending", rating: 0, totalOrders: 0, totalSales: 0, totalRevenue: 0 };
  await assertFails(setDoc(doc(as("newPub2"), "vendors_public", "newPub2"), { ...base, uid: "newPub2", rating: 5 }));
  await assertSucceeds(setDoc(doc(as("newPub"), "vendors_public", "newPub"), base));
});
await check("P4  admin can still set storefront reputation / status (admin access unchanged)", () =>
  assertSucceeds(updateDoc(doc(adminDb(), "vendors_public", "sellerA"), { rating: 4.5, status: "Approved" })));

// ---------- vendorChangeRequests ----------
await check("C1  seller reads own request and lists own (where vendorUid == uid)", async () => {
  await assertSucceeds(getDoc(doc(as("sellerA"), "vendorChangeRequests", "sellerA_k1")));
  await assertSucceeds(getDocs(query(collection(as("sellerA"), "vendorChangeRequests"), where("vendorUid", "==", "sellerA"))));
});
await check("C2  seller CANNOT read another seller's request or list all", async () => {
  await assertFails(getDoc(doc(as("sellerA"), "vendorChangeRequests", "sellerB_k1")));
  await assertFails(getDocs(collection(as("sellerA"), "vendorChangeRequests")));
});
await check("C3  admin can read requests", () => assertSucceeds(getDoc(doc(adminDb(), "vendorChangeRequests", "sellerB_k1"))));
await check("C4  seller CANNOT create, approve or delete a request from the browser", async () => {
  await assertFails(setDoc(doc(as("sellerA"), "vendorChangeRequests", "sellerA_new"), {
    vendorUid: "sellerA", section: "bank", status: "PENDING", changes: { accountNumber: "1" }, previous: {},
  }));
  await assertFails(updateDoc(doc(as("sellerA"), "vendorChangeRequests", "sellerA_k1"), { status: "APPROVED" }));
  await assertFails(deleteDoc(doc(as("sellerA"), "vendorChangeRequests", "sellerA_k1")));
});
await check("C5  admin browser CANNOT write a request either (server-only)", async () => {
  await assertFails(updateDoc(doc(adminDb(), "vendorChangeRequests", "sellerA_k1"), { status: "APPROVED" }));
  await assertFails(setDoc(doc(adminDb(), "vendorChangeRequests", "admin_new"), { vendorUid: "sellerA", status: "PENDING" }));
});
await check("C6  customer / signed-out cannot read requests", async () => {
  await assertFails(getDoc(doc(as("customer1"), "vendorChangeRequests", "sellerA_k1")));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "vendorChangeRequests", "sellerA_k1")));
});

await env.cleanup();
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
