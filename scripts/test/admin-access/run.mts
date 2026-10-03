/*
 * LOCAL-ONLY emulator harness — L6 server-side admin authorization
 * (lib/adminAccess.ts via lib/serverAuth.ts, app/api/admin/staff,
 * app/api/admin/whoami, and an existing admin API used by a granted admin).
 * ---------------------------------------------------------------------------
 * Firestore EMULATOR only. Firebase Auth is faked by intercepting Identity
 * Toolkit calls in-process (ID-token lookups AND the owner-only email lookup);
 * FIREBASE_AUTH_EMULATOR_HOST points at an unused local port that is never
 * actually contacted. A throwaway RSA key stands in for the service account.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/admin-access/run.mts"
 */
import crypto from "node:crypto";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}

const PROJECT_ID = "demo-yomico-test";
{
  const { privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
    publicKeyEncoding: { type: "spki", format: "pem" },
  });
  process.env.FIREBASE_SERVICE_ACCOUNT_KEY = JSON.stringify({
    type: "service_account", project_id: PROJECT_ID, private_key_id: "k", private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "0", token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:59999"; // intercepted below, never contacted

const OWNER = "adminyogimart@gmail.com";
// Auth accounts known to the fake, by email (for the owner's grant lookup).
const accounts: Record<string, { localId: string; email: string; emailVerified: boolean; disabled?: boolean }> = {
  "staff_new@example.com": { localId: "staff_new", email: "staff_new@example.com", emailVerified: true },
  "unverified@example.com": { localId: "unverified_uid", email: "unverified@example.com", emailVerified: false },
  "seller_1@example.com": { localId: "seller_1", email: "seller_1@example.com", emailVerified: true },
  "rider_1@example.com": { localId: "rider_1", email: "rider_1@example.com", emailVerified: true },
  "disabled@example.com": { localId: "disabled_uid", email: "disabled@example.com", emailVerified: true, disabled: true },
};
let emailLookups = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let body: any = {};
    try { body = JSON.parse(init?.body ?? "{}"); } catch {}
    if (Array.isArray(body.email)) {
      emailLookups++;
      const a = accounts[String(body.email[0]).toLowerCase()];
      return new Response(JSON.stringify(a ? { users: [a] } : {}), { status: 200, headers: { "content-type": "application/json" } });
    }
    const parts = String(body.idToken ?? "").split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    return new Response(JSON.stringify({ users: [{ localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true" }] }),
      { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.startsWith("http://127.0.0.1:59999")) throw new Error("unexpected call to the fake auth host");
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { verifyRequestUser } = await import("../../../lib/serverAuth.ts");
const { clearAdminRoleCache } = await import("../../../lib/adminAccess.ts");
const staff = await import("../../../app/api/admin/staff/route.ts");
const { GET: whoami } = await import("../../../app/api/admin/whoami/route.ts");
const { POST: archive } = await import("../../../app/api/admin/orders/[id]/archive/route.ts");

const db = getAdminDb();
type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const tok = (uid: string, email = `${uid}@example.com`, verified = true) => `test:${uid}:${email}:${verified}`;
const OWNER_TOKEN = tok("owner_uid", OWNER);
const req = (url: string, auth: string | null, body?: unknown) =>
  new Request(url, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(auth ? { authorization: `Bearer ${auth}` } : {}), "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function call(res: Response) { return { status: res.status, body: (await res.json().catch(() => ({}))) as any }; }
const isAdmin = async (t: string) => (await verifyRequestUser(req("http://x/", t)))?.isAdmin === true;

async function main() {
  for (const c of ["adminRoles", "audit_logs", "rateLimits", "users", "vendors", "deliveryPersons", "deliveryCompanies", "orders"]) {
    await db.recursiveDelete(db.collection(c));
  }
  clearAdminRoleCache();
  await db.collection("vendors").doc("v1").set({ uid: "seller_1", status: "Approved" });
  await db.collection("deliveryPersons").doc("dp1").set({ uid: "rider_1", status: "Active" });
  await db.collection("users").doc("forger").set({ role: "admin", isAdmin: true });
  await db.collection("adminUsers").doc("legacy").set({ email: "legacy@example.com", role: "Admin", status: "Active" });
  await db.collection("orders").doc("ord_1").set({ userId: "cust_1", status: "Cancelled", finalTotal: 100 });

  // ---- identity decisions ----
  record("1 existing owner admin -> admin", await isAdmin(OWNER_TOKEN));
  record("2 owner email but UNVERIFIED -> not admin", !(await isAdmin(tok("owner_uid", OWNER, false))));
  record("3 normal customer -> not admin", !(await isAdmin(tok("cust_1"))));
  record("4 seller -> not admin", !(await isAdmin(tok("seller_1"))));
  record("5 forged users/{uid}.role='admin' -> not admin", !(await isAdmin(tok("forger"))));
  record("6 legacy adminUsers entry -> not admin", !(await isAdmin(tok("legacy_uid", "legacy@example.com"))));
  record("7 no/invalid token -> no identity",
    (await verifyRequestUser(req("http://x/", null))) === null && (await verifyRequestUser(req("http://x/", "garbage"))) === null);

  // ---- whoami ----
  const w1 = await call(await whoami(req("http://x/api/admin/whoami", OWNER_TOKEN)));
  const w2 = await call(await whoami(req("http://x/api/admin/whoami", tok("cust_1"))));
  const w3 = await call(await whoami(req("http://x/api/admin/whoami", null)));
  record("8 whoami: owner isAdmin+isOwner; customer false; anonymous 401",
    w1.body.isAdmin === true && w1.body.isOwner === true && w2.body.isAdmin === false && w3.status === 401);

  // ---- staff API authorization ----
  const listAnon = await call(await staff.GET(req("http://x/api/admin/staff", null)));
  const listCust = await call(await staff.GET(req("http://x/api/admin/staff", tok("cust_1"))));
  const grantCust = await call(await staff.POST(req("http://x/api/admin/staff", tok("cust_1"), { action: "grant", email: "cust_1@example.com" })));
  const grantSeller = await call(await staff.POST(req("http://x/api/admin/staff", tok("seller_1"), { action: "grant", email: "seller_1@example.com" })));
  const forgedRoleBody = await call(await staff.POST(req("http://x/api/admin/staff", tok("cust_1"), { action: "grant", email: "cust_1@example.com", role: "admin", isAdmin: true, uid: "cust_1" })));
  record("9 staff API: anonymous 401; customer/seller (incl. forged role in body) 403; nothing written",
    listAnon.status === 401 && listCust.status === 403 && grantCust.status === 403 && grantSeller.status === 403 &&
      forgedRoleBody.status === 403 && (await db.collection("adminRoles").get()).empty);

  // ---- owner grants an admin ----
  const g = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "Staff_New@Example.com" })));
  const roleDoc = (await db.collection("adminRoles").doc("staff_new").get()).data();
  record("10 owner grants by email -> adminRoles/{real uid} active, audit logged",
    g.status === 200 && roleDoc?.active === true && roleDoc?.role === "admin" && roleDoc?.email === "staff_new@example.com" &&
      !(await db.collection("audit_logs").where("action", "==", "admin_role_granted").get()).empty);
  record("11 granted admin -> admin on the server", await isAdmin(tok("staff_new")));
  record("11b granted account with UNVERIFIED email token -> not admin", !(await isAdmin(tok("staff_new", "staff_new@example.com", false))));

  // ---- an existing admin API: granted admin allowed, customer denied ----
  const archCust = await call(await archive(req("http://x/api/admin/orders/ord_1/archive", tok("cust_1"), { reason: "x" }), { params: Promise.resolve({ id: "ord_1" }) }));
  const archStaff = await call(await archive(req("http://x/api/admin/orders/ord_1/archive", tok("staff_new"), { reason: "test archive" }), { params: Promise.resolve({ id: "ord_1" }) }));
  record("12 existing admin API: customer 403, granted admin 200",
    archCust.status === 403 && archStaff.status === 200 && (await db.collection("orders").doc("ord_1").get()).get("archived") === true,
    `cust=${archCust.status} staff=${archStaff.status}`);

  // ---- a granted admin cannot grant further admins ----
  const chain = await call(await staff.POST(req("http://x/api/admin/staff", tok("staff_new"), { action: "grant", email: "unverified@example.com" })));
  const staffList = await call(await staff.GET(req("http://x/api/admin/staff", tok("staff_new"))));
  record("13 granted admin can VIEW the access list but cannot grant (owner-only)",
    chain.status === 403 && staffList.status === 200 && staffList.body.viewerIsOwner === false &&
      staffList.body.admins.some((a: any) => a.uid === "staff_new" && a.active));

  // ---- refused grants ----
  const gUnverified = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "unverified@example.com" })));
  const gSeller = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "seller_1@example.com" })));
  const gRider = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "rider_1@example.com" })));
  const gMissing = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "nobody@example.com" })));
  const gDisabled = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "disabled@example.com" })));
  const gOwner = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: OWNER })));
  const gBad = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "grant", email: "not-an-email" })));
  record("14 grant refused: unverified 409, seller 409, delivery 409, unknown 404, disabled 404, owner 409, malformed 400",
    gUnverified.status === 409 && gSeller.status === 409 && gRider.status === 409 && gMissing.status === 404 &&
      gDisabled.status === 404 && gOwner.status === 409 && gBad.status === 400 &&
      (await db.collection("adminRoles").get()).size === 1,
    [gUnverified, gSeller, gRider, gMissing, gDisabled, gOwner, gBad].map((r) => r.status).join(","));

  // ---- revoke ----
  const rv = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "revoke", uid: "staff_new" })));
  const rvAgain = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "revoke", uid: "staff_new" })));
  const rvOwner = await call(await staff.POST(req("http://x/api/admin/staff", OWNER_TOKEN, { action: "revoke", uid: "owner_uid" })));
  record("15 owner revokes -> no longer admin (cache cleared); repeat is idempotent; owner cannot revoke self",
    rv.status === 200 && !(await isAdmin(tok("staff_new"))) && rvAgain.status === 200 && rvAgain.body.alreadyRevoked === true &&
      rvOwner.status === 409 && (await isAdmin(OWNER_TOKEN)));

  // ---- a record written directly (as a compromised client would try) only counts if active+admin ----
  await db.collection("adminRoles").doc("cust_2").set({ uid: "cust_2", role: "viewer", active: true });
  clearAdminRoleCache();
  record("16 adminRoles record with role != 'admin' -> not admin", !(await isAdmin(tok("cust_2"))));

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.error("HARNESS CRASH:", e?.message || e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 50));
