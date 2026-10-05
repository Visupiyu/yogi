/*
 * LOCAL-ONLY Storage + Firestore RULES test (emulator) — KYC integrity.
 * Proves that a vendor's or delivery partner's KYC documents are create-only
 * for their owner (never replaced or removed once uploaded — including after
 * admin verification), that a vendor cannot repoint gstDocUrl /
 * aadhaarDocUrl / chequeDocUrl at a different file, that a KYC-Approved
 * vendor cannot change, add or remove their identity numbers or payout bank
 * details (a Pending vendor still can), and that initial
 * uploads, admin reads/moderation and ordinary vendor profile edits are
 * unchanged. Loads the repository's storage.rules and firestore.rules into the
 * emulators and uses tiny synthetic files and documents only.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore,storage --project demo-yomico-kyc \
 *     "npx tsx scripts/test/kyc/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import { deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";

const local = /^(127\.0\.0\.1|localhost):\d+$/;
const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
if (!storageHost || !local.test(storageHost) || !firestoreHost || !local.test(firestoreHost)) {
  console.error("REFUSING TO RUN: the Storage and Firestore emulators must both be local. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const [sHost, sPort] = storageHost.split(":");
const [fHost, fPort] = firestoreHost.split(":");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-kyc",
  storage: { rules: fs.readFileSync(path.join(REPO, "storage.rules"), "utf8"), host: sHost, port: Number(sPort) },
  firestore: { rules: fs.readFileSync(path.join(REPO, "firestore.rules"), "utf8"), host: fHost, port: Number(fPort) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const PDF = { contentType: "application/pdf" };
const JPG = { contentType: "image/jpeg" };
const tiny = new Uint8Array([1, 2, 3]);
const OVER_10MB = new Uint8Array(10 * 1024 * 1024);
const ONE_MB = new Uint8Array(1024 * 1024); // above the SDK resumable-upload threshold

// Paths shaped like app/vendor-register and lib/storagePaths.ts#deliveryKycPath.
const VENDOR_DOC = "vendor-kyc/vendorV/gst-1700000000000-certificate.pdf";
const DELIVERY_DOC = "delivery-kyc/riderK/aadhaar-1700000000000-abcd1234-card.pdf";

const VENDOR = {
  uid: "vendorV",
  businessName: "KYC Traders",
  fullName: "Test Vendor",
  aboutStore: "Original description",
  status: "Approved",
  kycStatus: "Verified",
  commissionRate: 0,
  gstDocUrl: "https://example.invalid/vendor-kyc/gst",
  aadhaarDocUrl: "https://example.invalid/vendor-kyc/aadhaar",
  chequeDocUrl: "https://example.invalid/vendor-kyc/cheque",
};

const APPROVED_VENDOR = {
  uid: "vendorA",
  businessName: "Approved Traders",
  aboutStore: "About the store",
  status: "Approved",
  kycStatus: "Approved",
  commissionRate: 0,
  gstDocUrl: "https://example.invalid/vendor-kyc/gst-a",
  aadhaarDocUrl: "https://example.invalid/vendor-kyc/aadhaar-a",
  chequeDocUrl: "https://example.invalid/vendor-kyc/cheque-a",
  gstNumber: "TESTGSTIN00000Z",
  panNumber: "TESTP0000Q",
  aadhaarNumber: "000000000000",
  accountHolder: "Test Holder",
  bankName: "Test Bank",
  accountNumber: "0000000001",
  ifsc: "TEST0000001",
};

async function reseed() {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await ctx.storage().ref(VENDOR_DOC).put(tiny, PDF);
    await ctx.storage().ref(DELIVERY_DOC).put(tiny, PDF);
    await setDoc(doc(ctx.firestore(), "vendors", "v_doc1"), VENDOR);
    const { chequeDocUrl: _omit, ...withoutCheque } = VENDOR;
    void _omit;
    await setDoc(doc(ctx.firestore(), "vendors", "v_doc2"), { ...withoutCheque, uid: "vendorW" });
    // Identity + bank freeze fixtures (obviously fake values).
    await setDoc(doc(ctx.firestore(), "vendors", "v_approved"), APPROVED_VENDOR);
    const { gstNumber: _g, panNumber: _p, aadhaarNumber: _a, ...bare } = APPROVED_VENDOR;
    void _g; void _p; void _a;
    await setDoc(doc(ctx.firestore(), "vendors", "v_approved_bare"), { ...bare, uid: "vendorB" });
    await setDoc(doc(ctx.firestore(), "vendors", "v_blocked"), { ...APPROVED_VENDOR, uid: "vendorX", status: "Blocked" });
    await setDoc(doc(ctx.firestore(), "vendors", "v_pending"), {
      ...APPROVED_VENDOR, uid: "vendorP", status: "Pending", kycStatus: "Pending",
    });
  });
}

const storageAs = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).storage();
const firestoreAs = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).firestore();
const ADMIN_EMAIL = "adminyogimart@gmail.com";

await reseed();

// ============ STORAGE: vendor-kyc/{uid}/... ============
const vendor = () => storageAs("vendorV");
await check("1  vendor KYC: owner can create a new document", () =>
  assertSucceeds(vendor().ref("vendor-kyc/vendorV/aadhaar-1800000000000-card.pdf").put(tiny, PDF)));
await check("1b vendor KYC: owner can create an image document", () =>
  assertSucceeds(vendor().ref("vendor-kyc/vendorV/cheque-1800000000000-cheque.jpg").put(tiny, JPG)));
await check("1c vendor KYC: owner can create a 1MB document (resumable upload path)", () =>
  assertSucceeds(vendor().ref("vendor-kyc/vendorV/gst-1800000000001-large.pdf").put(ONE_MB, PDF)));
await check("2  vendor KYC: owner can read", () => assertSucceeds(vendor().ref(VENDOR_DOC).getDownloadURL()));
await check("3  vendor KYC: admin can read", () =>
  assertSucceeds(storageAs("adminUid", ADMIN_EMAIL).ref(VENDOR_DOC).getDownloadURL()));
await check("4  vendor KYC: owner CANNOT overwrite an existing document (was allowed)", () =>
  assertFails(vendor().ref(VENDOR_DOC).put(tiny, PDF)));
await check("5  vendor KYC: owner CANNOT delete an existing document (was allowed)", () =>
  assertFails(vendor().ref(VENDOR_DOC).delete()));
await check("6  vendor KYC: another user CANNOT read", () => assertFails(storageAs("bob").ref(VENDOR_DOC).getDownloadURL()));
await check("7  vendor KYC: another user CANNOT write into the owner's folder", () =>
  assertFails(storageAs("bob").ref("vendor-kyc/vendorV/evil.pdf").put(tiny, PDF)));
await check("8  vendor KYC: invalid file type still refused", () =>
  assertFails(vendor().ref("vendor-kyc/vendorV/x.txt").put(tiny, { contentType: "text/plain" })));
await check("9  vendor KYC: file of 10MB or more still refused", () =>
  assertFails(vendor().ref("vendor-kyc/vendorV/big.pdf").put(OVER_10MB, PDF)));
await check("9b vendor KYC: admin write access not broadened (cannot overwrite or delete)", async () => {
  const admin = storageAs("adminUid", ADMIN_EMAIL);
  await assertFails(admin.ref(VENDOR_DOC).put(tiny, PDF));
  await assertFails(admin.ref(VENDOR_DOC).delete());
});

// ============ STORAGE: delivery-kyc/{uid}/... ============
const rider = () => storageAs("riderK");
await check("10 delivery KYC: owner can create a new document", () =>
  assertSucceeds(rider().ref("delivery-kyc/riderK/cheque-1800000000000-efgh5678-cheque.pdf").put(tiny, PDF)));
await check("10b delivery KYC: owner can create a 1MB document (resumable, as delivery-register uploads)", () =>
  assertSucceeds(rider().ref("delivery-kyc/riderK/aadhaar-1800000000001-large.pdf").put(ONE_MB, PDF)));
await check("11 delivery KYC: owner can read", () => assertSucceeds(rider().ref(DELIVERY_DOC).getDownloadURL()));
await check("12 delivery KYC: admin can read", () =>
  assertSucceeds(storageAs("adminUid", ADMIN_EMAIL).ref(DELIVERY_DOC).getDownloadURL()));
await check("13 delivery KYC: owner CANNOT overwrite an existing document (was allowed)", () =>
  assertFails(rider().ref(DELIVERY_DOC).put(tiny, PDF)));
await check("14 delivery KYC: owner CANNOT delete an existing document (was allowed)", () =>
  assertFails(rider().ref(DELIVERY_DOC).delete()));
await check("15 delivery KYC: unrelated user CANNOT read", () => assertFails(storageAs("bob").ref(DELIVERY_DOC).getDownloadURL()));
await check("16 delivery KYC: unrelated user CANNOT write into the owner's folder", () =>
  assertFails(storageAs("bob").ref("delivery-kyc/riderK/evil.pdf").put(tiny, PDF)));
await check("17 delivery KYC: invalid file type still refused", () =>
  assertFails(rider().ref("delivery-kyc/riderK/x.txt").put(tiny, { contentType: "text/plain" })));
await check("18 delivery KYC: file of 10MB or more still refused", () =>
  assertFails(rider().ref("delivery-kyc/riderK/big.pdf").put(OVER_10MB, PDF)));

// ============ FIRESTORE: vendors/{id} owner update ============
const vendorDoc = () => doc(firestoreAs("vendorV"), "vendors", "v_doc1");
await check("19 vendor doc: owner can change an ordinary profile field (aboutStore)", () =>
  assertSucceeds(updateDoc(vendorDoc(), { aboutStore: "Updated description" })));
await check("19b vendor doc: seller-settings style save (whole doc, KYC URLs unchanged) still allowed", async () => {
  const current = (await getDoc(vendorDoc())).data() || {};
  await assertSucceeds(updateDoc(vendorDoc(), { ...current, businessName: "KYC Traders Ltd" }));
});
await check("20 vendor doc: owner CANNOT change gstDocUrl (was allowed)", () =>
  assertFails(updateDoc(vendorDoc(), { gstDocUrl: "https://example.invalid/swapped" })));
await check("21 vendor doc: owner CANNOT change aadhaarDocUrl (was allowed)", () =>
  assertFails(updateDoc(vendorDoc(), { aadhaarDocUrl: "https://example.invalid/swapped" })));
await check("22 vendor doc: owner CANNOT change chequeDocUrl (was allowed)", () =>
  assertFails(updateDoc(vendorDoc(), { chequeDocUrl: "https://example.invalid/swapped" })));
await check("22b vendor doc: owner CANNOT remove a KYC URL field (was allowed)", () =>
  assertFails(updateDoc(vendorDoc(), { gstDocUrl: deleteField() })));
await check("22c vendor doc: owner CANNOT add a KYC URL field that was absent (was allowed)", () =>
  assertFails(updateDoc(doc(firestoreAs("vendorW"), "vendors", "v_doc2"), { chequeDocUrl: "https://example.invalid/new" })));
await check("23 vendor doc: owner CANNOT change kycStatus (unchanged)", () =>
  assertFails(updateDoc(vendorDoc(), { kycStatus: "Pending" })));
await check("23b vendor doc: another user CANNOT update the vendor doc", () =>
  assertFails(updateDoc(doc(firestoreAs("bob"), "vendors", "v_doc1"), { aboutStore: "x" })));
await check("24 vendor doc: admin browser can NOT decide KYC (kycStatus + status) — only app/api/admin/kyc/decision can", () =>
  assertFails(updateDoc(doc(firestoreAs("adminUid", ADMIN_EMAIL), "vendors", "v_doc1"), { kycStatus: "Rejected", status: "Rejected" })));
await check("24b vendor doc: admin may still update KYC URL fields (admin access unchanged)", () =>
  assertSucceeds(updateDoc(doc(firestoreAs("adminUid", ADMIN_EMAIL), "vendors", "v_doc1"), { gstDocUrl: "https://example.invalid/admin-set" })));
await check("24c vendor doc: new vendor application with KYC URLs still allowed (create unchanged)", () =>
  assertSucceeds(setDoc(doc(firestoreAs("newVendor"), "vendors", "v_new"), {
    uid: "newVendor", businessName: "New", status: "Pending", kycStatus: "Pending",
    gstDocUrl: "https://example.invalid/g", aadhaarDocUrl: "https://example.invalid/a", chequeDocUrl: "https://example.invalid/c",
  })));

// ============ FIRESTORE: identity + bank details frozen once KYC Approved ============
const approved = () => doc(firestoreAs("vendorA"), "vendors", "v_approved");
const approvedBare = () => doc(firestoreAs("vendorB"), "vendors", "v_approved_bare");
const identity: [string, string][] = [["gstNumber", "TESTGSTIN99999Z"], ["panNumber", "TESTP9999Q"], ["aadhaarNumber", "999999999999"]];
let n = 1;
for (const [field, value] of identity) {
  await check(`V${n++} approved vendor CANNOT change ${field} (was allowed)`, () => assertFails(updateDoc(approved(), { [field]: value })));
  await check(`V${n++} approved vendor CANNOT remove ${field} (was allowed)`, () => assertFails(updateDoc(approved(), { [field]: deleteField() })));
  await check(`V${n++} approved vendor CANNOT add ${field} when missing (was allowed)`, () => assertFails(updateDoc(approvedBare(), { [field]: value })));
}
const bank: [string, string][] = [["accountHolder", "Someone Else"], ["bankName", "Other Bank"], ["accountNumber", "9999999999"], ["ifsc", "OTHR0000009"]];
for (const [field, value] of bank) {
  await check(`V${n++} approved vendor CANNOT change ${field} (was allowed)`, () => assertFails(updateDoc(approved(), { [field]: value })));
}
await check("V13b approved vendor CANNOT remove accountNumber (was allowed)", () =>
  assertFails(updateDoc(approved(), { accountNumber: deleteField() })));
await check("V13c blocked vendor (status Blocked, kycStatus Approved) CANNOT change accountNumber (was allowed)", () =>
  assertFails(updateDoc(doc(firestoreAs("vendorX"), "vendors", "v_blocked"), { accountNumber: "9999999999" })));
await check("V14 approved vendor can still change an ordinary profile field (aboutStore)", () =>
  assertSucceeds(updateDoc(approved(), { aboutStore: "Updated about" })));
await check("V15 approved vendor whole-document save with protected values unchanged still allowed", async () => {
  const current = (await getDoc(approved())).data() || {};
  await assertSucceeds(updateDoc(approved(), { ...current, aboutStore: "Whole-document save" }));
});
// Seller Business: the approved business identity is now frozen like the bank
// and identity numbers — a rename goes through an admin-approved request.
await check("V15b approved vendor whole-document save CANNOT rename the business (changed via Seller Business request)", async () => {
  const current = (await getDoc(approved())).data() || {};
  await assertFails(updateDoc(approved(), { ...current, businessName: "Approved Traders Ltd" }));
});
await check("V16 approved vendor CANNOT change kycStatus (unchanged)", () => assertFails(updateDoc(approved(), { kycStatus: "Pending" })));
await check("V17 approved vendor CANNOT change gstDocUrl (unchanged)", () =>
  assertFails(updateDoc(approved(), { gstDocUrl: "https://example.invalid/x" })));
await check("V18 approved vendor CANNOT change aadhaarDocUrl (unchanged)", () =>
  assertFails(updateDoc(approved(), { aadhaarDocUrl: "https://example.invalid/x" })));
await check("V19 approved vendor CANNOT change chequeDocUrl (unchanged)", () =>
  assertFails(updateDoc(approved(), { chequeDocUrl: "https://example.invalid/x" })));
const pending = () => doc(firestoreAs("vendorP"), "vendors", "v_pending");
await check("V20 pending vendor can still correct identity and bank details (preserved)", () =>
  assertSucceeds(updateDoc(pending(), {
    gstNumber: "TESTGSTIN11111Z", panNumber: "TESTP1111Q", aadhaarNumber: "111111111111",
    accountHolder: "Corrected Holder", bankName: "Corrected Bank", accountNumber: "1111111111", ifsc: "CORR0000001",
  })));
await check("V20b pending vendor still CANNOT change kycStatus (unchanged)", () =>
  assertFails(updateDoc(pending(), { kycStatus: "Approved" })));
await check("V21 admin can still update protected identity and bank fields", () =>
  assertSucceeds(updateDoc(doc(firestoreAs("adminUid", ADMIN_EMAIL), "vendors", "v_approved"), {
    gstNumber: "TESTGSTIN22222Z", accountNumber: "2222222222", ifsc: "ADMN0000002",
  })));
await check("V22 new vendor application with identity and bank fields still allowed (create unchanged)", () =>
  assertSucceeds(setDoc(doc(firestoreAs("newVendor2"), "vendors", "v_new2"), {
    uid: "newVendor2", businessName: "New Two", status: "Pending", kycStatus: "Pending",
    gstNumber: "TESTGSTIN33333Z", panNumber: "TESTP3333Q", aadhaarNumber: "333333333333",
    accountHolder: "New Holder", bankName: "New Bank", accountNumber: "3333333333", ifsc: "NEWB0000003",
  })));

// ============ H2: the legacy Admin Vendors shortcut ============
// Approve / reject is a KYC decision made only by app/api/admin/kyc/decision
// (Admin SDK). An admin browser may still block and unblock, and unblocking
// restores only the status that matches the seller's KYC state.
await env.withSecurityRulesDisabled(async (ctx) => {
  const f = ctx.firestore();
  await setDoc(doc(f, "vendors", "h2_pending"), { ...APPROVED_VENDOR, uid: "h2p", status: "Pending", kycStatus: "Pending" });
  await setDoc(doc(f, "vendors", "h2_rejected"), { ...APPROVED_VENDOR, uid: "h2r", status: "Rejected", kycStatus: "Rejected", kycRejectionReason: "Blurry PAN" });
  await setDoc(doc(f, "vendors", "h2_approved"), { ...APPROVED_VENDOR, uid: "h2a" });
  await setDoc(doc(f, "vendors", "h2_blocked_pending"), { ...APPROVED_VENDOR, uid: "h2bp", status: "Blocked", kycStatus: "Pending" });
  await setDoc(doc(f, "vendors", "h2_blocked_approved"), { ...APPROVED_VENDOR, uid: "h2ba", status: "Blocked", kycStatus: "Approved" });
});
const adminVendor = (id: string) => doc(firestoreAs("adminUid", ADMIN_EMAIL), "vendors", id);
await check("H2-1 admin browser cannot APPROVE a pending seller (status + kycStatus Approved)", () =>
  assertFails(updateDoc(adminVendor("h2_pending"), { status: "Approved", kycStatus: "Approved" })));
await check("H2-2 admin browser cannot approve by status alone (status Approved, kycStatus untouched)", () =>
  assertFails(updateDoc(adminVendor("h2_pending"), { status: "Approved" })));
await check("H2-3 admin browser cannot REJECT, nor write a rejection reason, nor reopen a rejected KYC", async () => {
  await assertFails(updateDoc(adminVendor("h2_pending"), { status: "Rejected", kycStatus: "Rejected" }));
  await assertFails(updateDoc(adminVendor("h2_pending"), { kycRejectionReason: "x" }));
  await assertFails(updateDoc(adminVendor("h2_rejected"), { kycStatus: "Pending" }));
  await assertFails(updateDoc(adminVendor("h2_rejected"), { kycRejectionReason: deleteField() }));
});
await check("H2-4 Unblock can never approve an unapproved seller (Blocked + KYC Pending -> Approved refused)", () =>
  assertFails(updateDoc(adminVendor("h2_blocked_pending"), { status: "Approved" })));
await check("H2-5 admin can still Block any seller and Unblock to the KYC-matching status", async () => {
  await assertSucceeds(updateDoc(adminVendor("h2_approved"), { status: "Blocked" }));
  await assertSucceeds(updateDoc(adminVendor("h2_pending"), { status: "Blocked" }));
  await assertSucceeds(updateDoc(adminVendor("h2_blocked_pending"), { status: "Pending" }));
  await assertSucceeds(updateDoc(adminVendor("h2_blocked_approved"), { status: "Approved" }));
});
await check("H2-6 the owner still cannot touch status / kycStatus (seller branch unchanged)", async () => {
  await assertFails(updateDoc(doc(firestoreAs("h2p"), "vendors", "h2_pending"), { kycStatus: "Approved" }));
  await assertFails(updateDoc(doc(firestoreAs("h2p"), "vendors", "h2_pending"), { status: "Approved" }));
});
await check("H2-7 other admin vendor edits still work (identity, commission, documents)", async () => {
  await assertSucceeds(updateDoc(adminVendor("h2_rejected"), { businessName: "Fixed by admin", commissionRate: 5 }));
  await assertSucceeds(updateDoc(adminVendor("h2_rejected"), { gstDocUrl: "https://example.invalid/admin-fixed" }));
});
{
  const vendorsPage = fs.readFileSync(path.join(REPO, "app/admin/vendors/page.tsx"), "utf8");
  const dashboard = fs.readFileSync(path.join(REPO, "app/admin/page.tsx"), "utf8");
  await check("H2-8 the Admin Vendors page has no Approve / Reject shortcut, never writes kycStatus, and links to Vendor KYC", async () => {
    if (/>\s*Approve\s*</.test(vendorsPage) || />\s*Reject\s*</.test(vendorsPage)) throw new Error("Approve/Reject button still present");
    if (/kycStatus\s*:\s*status/.test(vendorsPage) || /updateDoc\([^)]*\)\s*,\s*\{[^}]*kycStatus/.test(vendorsPage)) throw new Error("vendors page writes kycStatus");
    if (!vendorsPage.includes('href="/admin/kyc"')) throw new Error("no link to /admin/kyc");
  });
  await check("H2-9 the admin dashboard has no vendor approve / reject / KYC write left", async () => {
    if (/approveVendor|rejectVendor|updateKYC|kycStatus\s*:/.test(dashboard)) throw new Error("dashboard still has a KYC shortcut");
  });
}

await env.cleanup();
console.log(`\n${pass}/${pass + fail} KYC rules checks passed`);
if (fail > 0) process.exitCode = 1;
