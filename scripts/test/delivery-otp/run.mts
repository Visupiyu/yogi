/*
 * LOCAL-ONLY emulator harness — L7 delivery-handover OTP: security of the code
 * and visibility of its delivery (lib/deliveryEngine/otpService.ts,
 * lib/deliveryEngine/deliveryOtp.ts, the DELIVER path of
 * lib/deliveryEngine/execution.ts, app/api/delivery/order/[orderId]/resend-otp,
 * app/api/delivery/order/[orderId]/shipments, app/api/delivery/jobs/[jobId]).
 * ---------------------------------------------------------------------------
 * Firestore EMULATOR only. No email is sent: the OTP email sender is injected
 * (or absent — no RESEND_API_KEY is set here). Auth is faked by intercepting
 * the Identity Toolkit fetch. Every console line is captured and checked for
 * the plaintext codes.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/delivery-otp/run.mts"
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
process.env.DELIVERY_OTP_SECRET = crypto.randomBytes(32).toString("hex");
delete process.env.RESEND_API_KEY;

// Capture every console line (the codes must never appear in any of them).
const logged: string[] = [];
for (const level of ["log", "info", "warn", "error", "debug"] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    logged.push(args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    if (level === "log") orig(...args);
  };
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    return new Response(JSON.stringify({ users: [{ localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true" }] }),
      { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { ensureDeliveryOtp, regenerateDeliveryOtp, deliverOtpToCustomer, deliveryOtpView } = await import("../../../lib/deliveryEngine/otpService.ts");
const { classifyDeliveryOtp, DELIVERY_OTP_MAX_ATTEMPTS } = await import("../../../lib/deliveryEngine/deliveryOtp.ts");
const { applyScan } = await import("../../../lib/deliveryEngine/execution.ts");
const { POST: resendRoute } = await import("../../../app/api/delivery/order/[orderId]/resend-otp/route.ts");
const { GET: shipmentsRoute } = await import("../../../app/api/delivery/order/[orderId]/shipments/route.ts");
const { GET: jobRoute } = await import("../../../app/api/delivery/jobs/[jobId]/route.ts");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();
type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const codes = new Set<string>();

const tok = (uid: string) => `test:${uid}:${uid}@example.com:true`;
const get = (url: string, uid: string | null) =>
  new Request(url, { headers: uid ? { authorization: `Bearer ${tok(uid)}` } : {} });
const post = (url: string, uid: string | null) =>
  new Request(url, { method: "POST", headers: { ...(uid ? { authorization: `Bearer ${tok(uid)}` } : {}), "content-type": "application/json" }, body: "{}" });
async function call(res: Response) { const text = await res.text(); let body: any = {}; try { body = JSON.parse(text); } catch {} return { status: res.status, body, text }; }

const RIDER = { uid: "rider_uid", personId: "P1", providerType: "YOMICO" as const, companyId: null };

async function seedJob(jobId: string, orderId: string, customer: string) {
  await db.collection("orders").doc(orderId).set({
    userId: customer, userEmail: `${customer}@example.com`, customerName: "Asha", orderNumber: `ORD-${orderId}`,
    paymentMethod: "ONLINE", paymentStatus: "Paid", status: "Shipped", vendorIds: ["vendor_1"], items: [],
  });
  const now = Timestamp.now();
  await db.collection("deliveryJobs").doc(jobId).set({
    orderId, orderNumber: `ORD-${orderId}`, shipmentNumber: `SHP-${jobId}`, vendorId: "vendor_1", vendorName: "Store",
    providerType: "YOMICO", status: "InProgress", currentStage: "OutForDelivery", currentLegId: "L1", scanToken: `tok_${jobId}`,
    assignedPersonId: "P1", assignedPersonName: "Ravi", drop: { customerName: "Asha", address: "1 Road", phone: "9876543210" },
    parcel: { items: [{ name: "Kettle", qty: 1 }] }, executionStartedAt: now, createdAt: now, updatedAt: now,
    custody: { holderKind: "YOMICO", personId: "P1", companyId: null, since: now },
  });
  await db.collection("deliveryJobs").doc(jobId).collection("legs").doc("L1").set({
    type: "Direct", status: "OutForDelivery", providerType: "YOMICO", companyId: null, assignedPersonId: "P1",
    custody: { holderKind: "YOMICO", personId: "P1", companyId: null, since: now },
  });
}

async function issue(jobId: string, force = false) {
  const r: any = await db.runTransaction((tx) => (force ? regenerateDeliveryOtp(tx, db, { jobId }) : ensureDeliveryOtp(tx, db, { jobId })));
  if (r.issued) codes.add(r.code);
  return r;
}
const jobData = async (id: string) => (await db.collection("deliveryJobs").doc(id).get()).data() as any;
let evt = 0;
const deliver = (jobId: string, otp: string, clientEventId = `e${++evt}`) =>
  db.runTransaction((tx) => applyScan(tx, db, { jobId, scanToken: `tok_${jobId}`, action: "DELIVER", actor: RIDER, evidence: { clientEventId }, otp }));
const wrongOf = (code: string) => String((Number(code) + 1) % 1_000_000).padStart(6, "0");

async function main() {
  for (const c of ["orders", "deliveryJobs", "deliveryPersons", "deliveryEvents", "notifications", "rateLimits", "sellerOrders", "deliveryNotifications"]) {
    await db.recursiveDelete(db.collection(c));
  }
  await db.collection("deliveryPersons").doc("P1").set({ uid: "rider_uid", name: "Ravi", status: "Active", accountStatus: "Active", providerType: "YOMICO", availability: "Busy" });

  // ---- valid OTP ----
  await seedJob("J1", "ordA", "custA");
  const i1 = await issue("J1");
  const stored = await jobData("J1");
  record("1 issue: 6-digit code, stored only as an HMAC (no plaintext on the job)",
    i1.issued && /^\d{6}$/.test(i1.code) && typeof stored.deliveryOtpHash === "string" && stored.deliveryOtpHash.length === 64 &&
      !JSON.stringify(stored).includes(i1.code));
  record("1b re-issue while active is a no-op (code unchanged)", (await issue("J1")).issued === false);

  // ---- invalid OTP ----
  const bad = await deliver("J1", wrongOf(i1.code));
  const afterBad = await jobData("J1");
  record("2 invalid OTP -> not delivered, attempt counted", bad.otpFailed === true && afterBad.status === "InProgress" && afterBad.deliveryOtpAttempts === 1);

  // ---- valid OTP delivers, then is consumed (replay impossible) ----
  const ok = await deliver("J1", i1.code, "deliver-ok");
  const delivered = await jobData("J1");
  record("3 valid OTP -> delivered; hash cleared, consumedAt set (single-use)",
    ok.applied === true && delivered.status === "Delivered" && delivered.deliveryOtpHash === null && !!delivered.deliveryOtpConsumedAt &&
      delivered.pod?.otpVerified === true);
  let replayErr = "";
  try { await deliver("J1", i1.code); } catch (e) { replayErr = (e as Error).message; }
  const sameEvent = await deliver("J1", i1.code, "deliver-ok");
  record("4 replay after successful handover rejected (new event 409; same event idempotent no-op)",
    /already Delivered/.test(replayErr) && sameEvent.applied === false && sameEvent.idempotent === true, replayErr);
  record("4b used code no longer classifies as valid", classifyDeliveryOtp(delivered, i1.code) === "missing");
  record("4c regeneration refused once delivered", (await issue("J1", true)).issued === false);

  // ---- wrong order/job ----
  await seedJob("J2", "ordB", "custB");
  const i2 = await issue("J2");
  await seedJob("J3", "ordC", "custC");
  const i3 = await issue("J3");
  const cross = i2.code === i3.code ? { otpFailed: "same-code-collision" } : await deliver("J3", i2.code);
  record("5 another job's valid code is rejected", cross.otpFailed === true && (await jobData("J3")).status === "InProgress");

  // ---- expired ----
  await db.collection("deliveryJobs").doc("J2").update({ deliveryOtpIssuedAt: Timestamp.fromMillis(Date.now() - 25 * 3600 * 1000) });
  const exp = await deliver("J2", i2.code);
  record("6 expired OTP rejected (and expiry is not counted as a guess)",
    exp.otpFailed === true && classifyDeliveryOtp(await jobData("J2"), i2.code) === "expired" && (await jobData("J2")).deliveryOtpAttempts === 0);

  // ---- brute force bounded ----
  for (let k = 0; k < DELIVERY_OTP_MAX_ATTEMPTS; k++) await deliver("J3", String((Number(i3.code) + 1 + k) % 1_000_000).padStart(6, "0"));
  const locked = await deliver("J3", i3.code);
  record(`7 guessing bounded: after ${DELIVER_LIMIT()} wrong codes even the right code is refused (locked)`,
    locked.otpFailed === true && classifyDeliveryOtp(await jobData("J3"), i3.code) === "locked" && deliveryOtpView(await jobData("J3")).state === "locked");
  function DELIVER_LIMIT() { return DELIVERY_OTP_MAX_ATTEMPTS; }

  // ---- delivery failure visible: email rejected by provider, in-app ok ----
  const sendRejected = async () => ({ error: { name: "validation_error", message: "domain not verified" } });
  const n1 = await deliverOtpToCustomer(db, { jobId: "J3", userId: "custC", userEmail: "custC@example.com", customerName: "C", shipmentNumber: "SHP-J3", code: i3.code }, { sendEmail: sendRejected });
  const j3 = await jobData("J3");
  record("8 provider rejection ({error}) recorded as email FAILED (was previously reported as sent)",
    n1.status.email === "failed" && n1.status.inApp === "sent" && j3.deliveryOtpDelivery?.email === "failed" &&
      j3.deliveryOtpDelivery?.inApp === "sent" && j3.deliveryOtpDelivery?.sms === "not_configured");
  record("8b recorded delivery status carries no code and no address",
    !JSON.stringify(j3.deliveryOtpDelivery).includes(i3.code) && !JSON.stringify(j3.deliveryOtpDelivery).includes("@"));
  const n2 = await deliverOtpToCustomer(db, { jobId: "J3", userId: "custC", userEmail: "", customerName: "C", shipmentNumber: "SHP-J3", code: i3.code }, { sendEmail: sendRejected });
  const n3 = await deliverOtpToCustomer(db, { jobId: "J3", userId: "custC", userEmail: "custC@example.com", customerName: "C", shipmentNumber: "SHP-J3", code: i3.code }, { sendEmail: null });
  const n4 = await deliverOtpToCustomer(db, { jobId: "J3", userId: "custC", userEmail: "custC@example.com", customerName: "C", shipmentNumber: "SHP-J3", code: i3.code }, { sendEmail: async () => { throw new Error("network"); } });
  record("9 no address / no email provider / thrown send -> no_address / not_configured / failed; never 'sent'",
    n2.status.email === "no_address" && n3.status.email === "not_configured" && n4.status.email === "failed");
  const sendOk = async () => ({ error: null });
  const n5 = await deliverOtpToCustomer(db, { jobId: "J3", userId: "custC", userEmail: "custC@example.com", customerName: "C", shipmentNumber: "SHP-J3", code: i3.code }, { sendEmail: sendOk });
  record("9b accepted send -> email sent", n5.status.email === "sent" && n5.status.anyDelivered === true);

  // ---- operator visibility (rider / job API) ----
  await seedJob("J4", "ordD", "custD");
  const i4 = await issue("J4");
  await deliverOtpToCustomer(db, { jobId: "J4", userId: "custD", userEmail: "custD@example.com", customerName: "D", shipmentNumber: "SHP-J4", code: i4.code }, { sendEmail: sendRejected });
  const riderView = await call(await jobRoute(get("http://x/api/delivery/jobs/J4", "rider_uid"), { params: Promise.resolve({ jobId: "J4" }) }));
  const v = riderView.body?.job?.deliveryOtp;
  record("10 rider sees code STATUS: active, email failed, in-app sent, SMS not configured, attempts left",
    riderView.status === 200 && v?.state === "active" && v?.delivery?.email === "failed" && v?.delivery?.inApp === "sent" &&
      v?.delivery?.sms === "not_configured" && v?.attemptsRemaining === DELIVERY_OTP_MAX_ATTEMPTS);
  record("10b job API never returns the code or the hash",
    !riderView.text.includes(i4.code) && !riderView.text.includes((await jobData("J4")).deliveryOtpHash) && !riderView.text.includes("deliveryOtpHash"));
  const custJobView = await call(await jobRoute(get("http://x/api/delivery/jobs/J4", "custD"), { params: Promise.resolve({ jobId: "J4" }) }));
  record("10c the customer (not a delivery actor) cannot read the job", custJobView.status === 403);

  // ---- customer view ----
  const ship = await call(await shipmentsRoute(get("http://x/api/delivery/order/ordD/shipments", "custD"), { params: Promise.resolve({ orderId: "ordD" }) }));
  const s0 = ship.body?.shipments?.[0];
  record("11 customer shipment says the email failed (booleans only, no code)",
    ship.status === 200 && s0?.outForDelivery === true && s0?.deliveryCodeChannels?.email === false && s0?.deliveryCodeChannels?.inApp === true &&
      !ship.text.includes(i4.code));
  const shipOther = await call(await shipmentsRoute(get("http://x/api/delivery/order/ordD/shipments", "custA"), { params: Promise.resolve({ orderId: "ordD" }) }));
  record("11b another customer gets 404 for the shipments", shipOther.status === 404);

  // ---- recovery: owner resends -> new code works, old one does not ----
  const wrongCust = await call(await resendRoute(post("http://x/api/delivery/order/ordD/resend-otp", "custA"), { params: Promise.resolve({ orderId: "ordD" }) }));
  const rider = await call(await resendRoute(post("http://x/api/delivery/order/ordD/resend-otp", "rider_uid"), { params: Promise.resolve({ orderId: "ordD" }) }));
  const resent = await call(await resendRoute(post("http://x/api/delivery/order/ordD/resend-otp", "custD"), { params: Promise.resolve({ orderId: "ordD" }) }));
  const notes = (await db.collection("notifications").where("userId", "==", "custD").get()).docs.map((d) => String(d.get("message")));
  const newCode = notes.map((m) => (m.match(/is (\d{6})\./) || [])[1]).filter((c) => c && c !== i4.code).pop() || "";
  if (newCode) codes.add(newCode);
  record("12 resend: wrong customer 404, rider 404, owner 200 with channel booleans and NO code in the response",
    wrongCust.status === 404 && rider.status === 404 && resent.status === 200 && resent.body.channels?.inApp === true &&
      resent.body.channels?.email === false && !!newCode && !resent.text.includes(newCode));
  const j4 = await jobData("J4");
  record("12b resend resets attempts and the delivery record describes the NEW send", j4.deliveryOtpAttempts === 0 && j4.deliveryOtpDelivery?.inApp === "sent");
  const oldCode = await deliver("J4", i4.code);
  const newOk = await deliver("J4", newCode);
  record("12c after resend: old code rejected, new code delivers", oldCode.otpFailed === true && newOk.applied === true && (await jobData("J4")).status === "Delivered");

  // ---- no plaintext code anywhere in the logs ----
  const leaked = [...codes].filter((c) => logged.some((line) => line.includes(c) && !line.startsWith("PASS") && !line.startsWith("FAIL")));
  record("13 no OTP ever written to logs", codes.size >= 5 && leaked.length === 0, `codes=${codes.size} leaked=${leaked.length}`);

  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch((e) => { console.log("HARNESS CRASH:", e?.message || e); process.exitCode = 1; }).finally(() => setTimeout(() => process.exit(), 50));
