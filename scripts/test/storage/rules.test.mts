/*
 * LOCAL-ONLY Cloud Storage RULES test (emulator) — chat and delivery-proof
 * privacy. Proves that chat attachments and proof-of-delivery photos are
 * readable/listable only by their uploader and the admin (they used to be
 * readable and listable by ANY signed-in account), that the legacy flat
 * chat/ and delivery-proof/ objects are admin-only, and that uploads, the
 * public product / store / review images and the default-deny fallback are
 * unchanged. Also proves chat attachments and proof photos are immutable once
 * uploaded: no overwrite, metadata change or delete by anyone, and that
 * review photos are likewise create-only (owner creates, nobody overwrites,
 * changes metadata or deletes; public read unchanged). Loads the
 * repository's storage.rules into the emulator and uses tiny synthetic files
 * only.
 *
 * Run:
 *   npx firebase emulators:exec --only storage --project demo-yomico-storage \
 *     "npx tsx scripts/test/storage/rules.test.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";

const hostPort = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!hostPort || !/^(127\.0\.0\.1|localhost):\d+$/.test(hostPort)) {
  console.error("REFUSING TO RUN: FIREBASE_STORAGE_EMULATOR_HOST is not a local emulator. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const [host, port] = hostPort.split(":");
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

const env = await initializeTestEnvironment({
  projectId: "demo-yomico-storage",
  storage: { rules: fs.readFileSync(path.join(REPO, "storage.rules"), "utf8"), host, port: Number(port) },
});

let pass = 0;
let fail = 0;
async function check(name: string, fn: () => Promise<unknown>) {
  try { await fn(); console.log(`PASS  ${name}`); pass++; }
  catch (e) { console.log(`FAIL  ${name}  — ${(e as Error).message}`); fail++; }
}

const IMG = { contentType: "image/jpeg" };
const PDF = { contentType: "application/pdf" };
const tiny = new Uint8Array([1, 2, 3]);

// Paths shaped exactly like lib/storagePaths.ts builds them.
const CHAT = "chat/alice/1700000000000-abcd1234-photo.jpg";
const PROOF = "delivery-proof/rider1/order1-1700000000000-abcd1234-proof.jpg";
const LEGACY_CHAT = "chat/1600000000000-old.jpg";
const LEGACY_PROOF = "delivery-proof/order0-1600000000000";

await env.withSecurityRulesDisabled(async (ctx) => {
  const s = ctx.storage();
  for (const p of [CHAT, PROOF, LEGACY_CHAT, LEGACY_PROOF,
    "products/sellerS/1700-p.jpg", "products/1600-legacy.jpg",
    "vendor-store/sellerS/1700-logo.jpg", "vendor-store/1600-legacy.jpg",
    "reviews/alice/1700-0.jpg"]) {
    await s.ref(p).put(tiny, IMG);
  }
  await s.ref("vendor-kyc/vendorV/gst-1700-cert.pdf").put(tiny, PDF);
  await s.ref("misc/unmatched.txt").put(tiny, { contentType: "text/plain" });
});

const user = (uid: string, email = `${uid}@example.com`) =>
  env.authenticatedContext(uid, { email, email_verified: true }).storage();
const alice = () => user("alice");          // customer — owner of chat/alice
const bob = () => user("bob");              // unrelated signed-in customer
const sellerS = () => user("sellerS");      // unrelated seller
const rider1 = () => user("rider1");        // rider — owner of delivery-proof/rider1
const rider2 = () => user("rider2");        // uninvolved rider
const admin = () => user("adminUid", "adminyogimart@gmail.com");
const anon = () => env.unauthenticatedContext().storage();

const read = (s: ReturnType<typeof anon>, p: string) => s.ref(p).getDownloadURL();
const list = (s: ReturnType<typeof anon>, p: string) => s.ref(p).listAll();
const put = (s: ReturnType<typeof anon>, p: string, bytes: Uint8Array = tiny, meta = IMG) => s.ref(p).put(bytes, meta);
const OVER_5MB = new Uint8Array(5 * 1024 * 1024);

// ============ CHAT (chat/{uid}/...) ============
await check("1  chat: owner can create an image in their own folder", () => assertSucceeds(put(alice(), "chat/alice/1800-new.jpg")));
await check("2  chat: owner can read their own attachment", () => assertSucceeds(read(alice(), CHAT)));
await check("3  chat: owner can list their own folder", () => assertSucceeds(list(alice(), "chat/alice")));
await check("4  chat: unrelated signed-in customer CANNOT read (was allowed)", () => assertFails(read(bob(), CHAT)));
await check("5  chat: unrelated customer CANNOT list chat/alice/ (was allowed)", () => assertFails(list(bob(), "chat/alice")));
await check("5b chat: unrelated customer CANNOT list chat/ to enumerate uploader uids (was allowed)", () => assertFails(list(bob(), "chat")));
await check("6  chat: unrelated seller CANNOT read", () => assertFails(read(sellerS(), CHAT)));
await check("7  chat: uninvolved rider CANNOT read", () => assertFails(read(rider2(), CHAT)));
await check("8  chat: admin can read", () => assertSucceeds(read(admin(), CHAT)));
await check("8b chat: admin can list chat/alice/", () => assertSucceeds(list(admin(), "chat/alice")));
await check("9  chat: another uid CANNOT write into the owner's folder", () => assertFails(put(bob(), "chat/alice/evil.jpg")));
await check("9b chat: another uid CANNOT overwrite the owner's attachment", () => assertFails(put(bob(), CHAT)));
await check("10 chat: non-image upload still refused", () => assertFails(put(alice(), "chat/alice/x.pdf", tiny, PDF)));
await check("10b chat: upload of 5MB or more still refused", () => assertFails(put(alice(), "chat/alice/big.jpg", OVER_5MB)));
await check("10c chat: signed-out user CANNOT read", () => assertFails(read(anon(), CHAT)));
await check("10d chat: owner delete still denied (unchanged)", () => assertFails(alice().ref(CHAT).delete()));

// ============ DELIVERY PROOF (delivery-proof/{uid}/...) ============
await check("11 proof: owner rider can create", () => assertSucceeds(put(rider1(), "delivery-proof/rider1/order2-1800-new.jpg")));
await check("12 proof: owner rider can read", () => assertSucceeds(read(rider1(), PROOF)));
await check("12b proof: owner rider can list their own folder", () => assertSucceeds(list(rider1(), "delivery-proof/rider1")));
await check("13 proof: unrelated customer CANNOT read (was allowed)", () => assertFails(read(bob(), PROOF)));
await check("13b proof: unrelated customer CANNOT list delivery-proof/rider1/ (was allowed)", () => assertFails(list(bob(), "delivery-proof/rider1")));
await check("13c proof: unrelated user CANNOT list delivery-proof/ to enumerate rider uids (was allowed)", () => assertFails(list(sellerS(), "delivery-proof")));
await check("14 proof: unrelated seller CANNOT read", () => assertFails(read(sellerS(), PROOF)));
await check("15 proof: uninvolved rider CANNOT read", () => assertFails(read(rider2(), PROOF)));
await check("16 proof: admin can read", () => assertSucceeds(read(admin(), PROOF)));
await check("17 proof: another uid CANNOT write into the owner's folder", () => assertFails(put(rider2(), "delivery-proof/rider1/x.jpg")));
await check("18 proof: non-image upload still refused", () => assertFails(put(rider1(), "delivery-proof/rider1/x.pdf", tiny, PDF)));
await check("18b proof: upload of 5MB or more still refused", () => assertFails(put(rider1(), "delivery-proof/rider1/big.jpg", OVER_5MB)));
await check("18c proof: signed-out user CANNOT read", () => assertFails(read(anon(), PROOF)));

// ============ LEGACY FLAT PATHS ============
await check("19 legacy: signed-in user CANNOT read chat/<file> (was allowed)", () => assertFails(read(bob(), LEGACY_CHAT)));
await check("19b legacy: signed-in user CANNOT read delivery-proof/<file> (was allowed)", () => assertFails(read(bob(), LEGACY_PROOF)));
await check("20 legacy: admin can read chat/<file>", () => assertSucceeds(read(admin(), LEGACY_CHAT)));
await check("20b legacy: admin can read delivery-proof/<file>", () => assertSucceeds(read(admin(), LEGACY_PROOF)));
await check("21 legacy: signed-out user CANNOT read chat/<file>", () => assertFails(read(anon(), LEGACY_CHAT)));
await check("21b legacy: signed-out user CANNOT read delivery-proof/<file>", () => assertFails(read(anon(), LEGACY_PROOF)));
await check("21c legacy: writes still refused (even for admin)", () => assertFails(put(admin(), "chat/1800-new.jpg")));

// ============ REGRESSION ============
await check("22 public: signed-out can read products/{uid}/ image", () => assertSucceeds(read(anon(), "products/sellerS/1700-p.jpg")));
await check("22b public: signed-out can read legacy products/ image", () => assertSucceeds(read(anon(), "products/1600-legacy.jpg")));
await check("23 public: signed-out can read vendor-store/{uid}/ image", () => assertSucceeds(read(anon(), "vendor-store/sellerS/1700-logo.jpg")));
await check("23b public: signed-out can read legacy vendor-store/ image", () => assertSucceeds(read(anon(), "vendor-store/1600-legacy.jpg")));
await check("24 public: signed-out can read reviews/{uid}/ image", () => assertSucceeds(read(anon(), "reviews/alice/1700-0.jpg")));
await check("25 unmatched path: read denied", () => assertFails(read(bob(), "misc/unmatched.txt")));
await check("25b unmatched path: write denied", () => assertFails(put(bob(), "misc/new.txt", tiny, { contentType: "text/plain" })));
await check("26 KYC unchanged: unrelated user cannot read, admin can", async () => {
  await assertFails(read(bob(), "vendor-kyc/vendorV/gst-1700-cert.pdf"));
  await assertSucceeds(read(admin(), "vendor-kyc/vendorV/gst-1700-cert.pdf"));
});

// ============ IMMUTABILITY (create-only) ============
// Unique names, so these never collide with objects the checks above wrote.
const ONE_MB = new Uint8Array(1024 * 1024);
await check("W1  chat: owner creates a new attachment", () => assertSucceeds(put(alice(), "chat/alice/1900000000000-w1new-photo.jpg")));
await check("W2  chat: owner CANNOT overwrite an existing attachment (was allowed)", () => assertFails(put(alice(), CHAT)));
await check("W3  chat: owner CANNOT change an attachment's metadata (was allowed)", () =>
  assertFails(alice().ref(CHAT).updateMetadata({ customMetadata: { edited: "yes" } })));
await check("W4  chat: owner CANNOT delete an attachment", () => assertFails(alice().ref(CHAT).delete()));
await check("W5  chat: admin CANNOT overwrite an attachment", () => assertFails(put(admin(), CHAT)));
await check("W6  chat: unrelated user CANNOT overwrite an attachment", () => assertFails(put(bob(), CHAT)));
await check("W7  chat: owner creates a 1MB attachment", () => assertSucceeds(put(alice(), "chat/alice/1900000000000-w7big-photo.jpg", ONE_MB)));
await check("W8  proof: owner creates a new proof", () =>
  assertSucceeds(put(rider1(), "delivery-proof/rider1/order9-1900000000000-w8new-proof.jpg")));
await check("W9  proof: owner CANNOT overwrite a submitted proof (was allowed)", () => assertFails(put(rider1(), PROOF)));
await check("W10 proof: owner CANNOT change a proof's metadata (was allowed)", () =>
  assertFails(rider1().ref(PROOF).updateMetadata({ customMetadata: { edited: "yes" } })));
await check("W11 proof: owner CANNOT delete a proof", () => assertFails(rider1().ref(PROOF).delete()));
await check("W12 proof: admin CANNOT overwrite a proof", () => assertFails(put(admin(), PROOF)));
await check("W13 proof: unrelated user CANNOT overwrite a proof", () => assertFails(put(rider2(), PROOF)));
await check("W14 proof: owner creates a 1MB proof", () =>
  assertSucceeds(put(rider1(), "delivery-proof/rider1/order9-1900000000000-w14big-proof.jpg", ONE_MB)));

// ============ REVIEW PHOTOS (reviews/{uid}/..., create-only) ============
// Paths shaped like OrderDetailsScreen.tsx builds them: {Date.now()}-{i}.jpg
const REVIEW = "reviews/alice/1700-0.jpg";
const OVER_5MB_STRICT = new Uint8Array(5 * 1024 * 1024 + 1);
await check("R1  reviews: owner creates a valid photo", () => assertSucceeds(put(alice(), "reviews/alice/1900000000000-0.jpg")));
await check("R2  reviews: owner creates a second photo at a different path", () =>
  assertSucceeds(put(alice(), "reviews/alice/1900000000000-1.jpg", ONE_MB)));
await check("R3  reviews: owner CANNOT overwrite an existing photo (was allowed)", () => assertFails(put(alice(), REVIEW)));
await check("R4  reviews: owner CANNOT change a photo's metadata (was allowed)", () =>
  assertFails(alice().ref(REVIEW).updateMetadata({ customMetadata: { edited: "yes" } })));
await check("R5  reviews: owner CANNOT delete a photo", () => assertFails(alice().ref(REVIEW).delete()));
await check("R6  reviews: another user CANNOT overwrite the owner's photo", () => assertFails(put(bob(), REVIEW)));
await check("R6b reviews: another user CANNOT write into the owner's folder", () => assertFails(put(bob(), "reviews/alice/1900000000000-evil.jpg")));
await check("R7  reviews: admin CANNOT overwrite a photo", () => assertFails(put(admin(), REVIEW)));
await check("R8  reviews: signed-out user CANNOT create a photo", () => assertFails(put(anon(), "reviews/alice/1900000000000-anon.jpg")));
await check("R9  reviews: non-image upload refused", () => assertFails(put(alice(), "reviews/alice/1900000000000-x.pdf", tiny, PDF)));
await check("R10 reviews: upload over 5MB refused", () => assertFails(put(alice(), "reviews/alice/1900000000000-big.jpg", OVER_5MB_STRICT)));
await check("R11 reviews: signed-out user can still read an existing photo", () => assertSucceeds(read(anon(), REVIEW)));
await check("R11b reviews: the new photo is still publicly readable", () => assertSucceeds(read(anon(), "reviews/alice/1900000000000-0.jpg")));

await env.cleanup();
console.log(`\n${pass}/${pass + fail} storage rules checks passed`);
if (fail > 0) process.exitCode = 1;
