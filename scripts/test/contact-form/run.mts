/*
 * YOMICO Phase 6 L3 — Contact form (/api/contact + lib/contactForm).
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * No real email is ever sent: api.resend.com is intercepted in-process and a
 * throwaway dummy key is used. No real credentials are read.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/contact-form/run.mts"
 */
import crypto from "node:crypto";
import fs from "node:fs";

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
    type: "service_account", project_id: PROJECT_ID, private_key_id: "test-key-id", private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "000000000000000000000",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
const DUMMY_KEY = "re_TESTDUMMY_notARealKey_0000000000";
process.env.RESEND_API_KEY = DUMMY_KEY;

type Sent = { to: unknown; from: unknown; subject: string; html: string; reply_to: unknown; auth: string };
const sent: Sent[] = [];
let resendMode: "ok" | "fail" | "throw" = "ok";
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    return new Response(JSON.stringify({ users: [{ localId: parts[1], email: parts[2] || null, emailVerified: true, createdAt: String(Date.now()) }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("api.resend.com")) {
    if (resendMode === "throw") throw new Error("network down: secret-internal-detail");
    const body = JSON.parse(init?.body ?? "{}");
    const headers = new Headers(init?.headers);
    sent.push({ ...body, auth: headers.get("authorization") || "" });
    if (resendMode === "fail") return new Response(JSON.stringify({ name: "validation_error", message: "internal provider text", statusCode: 422 }), { status: 422, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ id: "email_test_1" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { POST: contact } = await import("../../../app/api/contact/route.ts");
const { validateContact, CONTACT_LIMITS } = await import("../../../lib/contactForm.ts");
const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}
const clear = async () => { for (const c of ["rateLimits", "tickets", "notifications", "users"]) await db.recursiveDelete(db.collection(c)); sent.length = 0; resendMode = "ok"; };

let ipN = 0;
function call(body: unknown, opts: { uid?: string; email?: string; ip?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", "x-forwarded-for": opts.ip ?? `10.0.0.${++ipN}` };
  if (opts.uid) headers.authorization = `Bearer test:${opts.uid}:${opts.email ?? `${opts.uid}@example.com`}:true`;
  return contact(new Request("http://x/api/contact", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) }));
}
const j = (r: Response) => r.json().catch(() => ({}));
const GOOD = { name: "Asha Rao", email: "asha@example.com", subject: "Where is my order?", message: "My order has not arrived yet." };

async function main() {
  await clear();

  // 1 valid signed-out submission (also #11)
  {
    const r = await call(GOOD); const d = await j(r);
    record("1/11 valid signed-out submission -> 200 success; ONE email to the support inbox with Reply-To = customer, Bearer = the server-side key; no ticket created",
      r.status === 200 && d.success === true && sent.length === 1 && sent[0].to === "yomico.help@gmail.com" && sent[0].reply_to === "asha@example.com" &&
        sent[0].auth === `Bearer ${DUMMY_KEY}` && /Where is my order\?/.test(sent[0].subject) && sent[0].html.includes("My order has not arrived yet.") &&
        (await db.collection("tickets").get()).size === 0, `status=${r.status} sent=${sent.length}`);
  }

  // 2-6 required fields, 4 invalid email
  {
    const cases: [string, any][] = [
      ["2 missing name", { ...GOOD, name: "   " }], ["3 missing email", { ...GOOD, email: "" }],
      ["4 invalid email", { ...GOOD, email: "not-an-email" }], ["4b email with header injection", { ...GOOD, email: "a@b.co\r\nBcc: evil@x.com" }],
      ["5 missing subject", { ...GOOD, subject: "" }], ["6 missing message", { ...GOOD, message: "" }],
      ["6b non-string fields", { name: 5, email: {}, subject: [], message: null }],
    ];
    const before = sent.length;
    const outs = [];
    for (const [n, body] of cases) { const r = await call(body); outs.push([n, r.status, !!(await j(r)).fields]); }
    record("2-6 server rejects missing name / email / subject / message, malformed and injected emails, non-string fields (400 with field errors); nothing sent",
      outs.every(([, s, f]) => s === 400 && f === true) && sent.length === before, JSON.stringify(outs));
    const bad = await call("{not json"); const arr = await call("[]");
    record("6c non-JSON / non-object body -> 400", bad.status === 400 && arr.status === 400, `${bad.status}/${arr.status}`);
  }

  // 7 length limits
  {
    const before = sent.length;
    const longMsg = await call({ ...GOOD, message: "x".repeat(CONTACT_LIMITS.message + 1) });
    const longSubj = await call({ ...GOOD, subject: "s".repeat(CONTACT_LIMITS.subject + 1) });
    const longName = await call({ ...GOOD, name: "n".repeat(CONTACT_LIMITS.name + 1) });
    const atLimit = await call({ ...GOOD, subject: "edge", message: "m".repeat(CONTACT_LIMITS.message) });
    record("7 length limits: over-long message/subject/name rejected (400); a message exactly at the limit is accepted",
      longMsg.status === 400 && longSubj.status === 400 && longName.status === 400 && atLimit.status === 200 && sent.length === before + 1,
      `${longMsg.status}/${longSubj.status}/${longName.status}/${atLimit.status}`);
  }

  // email construction safety
  {
    await clear();
    const r = await call({ name: "<script>alert(1)</script>", email: "x@y.co", subject: "Hi\r\nBcc: evil@x.com", message: "<img src=x onerror=alert(1)>" });
    const m = sent[0];
    record("7b safe email construction: HTML in name/message is escaped; CR/LF in the subject is flattened (no injected header); recipient fixed",
      r.status === 200 && !m.html.includes("<script>") && !m.html.includes("<img") && m.html.includes("&lt;script&gt;") && !/[\r\n]/.test(m.subject) && m.to === "yomico.help@gmail.com",
      JSON.stringify({ subject: m.subject }));
  }

  // 8 duplicate protection + rate limit + honeypot
  {
    await clear();
    const outs = await Promise.all(Array.from({ length: 5 }, () => call(GOOD, { ip: "9.9.9.9" })));
    record("8a duplicate submit: five simultaneous identical submissions -> all report success but exactly ONE email is delivered",
      outs.every((r) => r.status === 200) && sent.length === 1, `statuses=${outs.map((r) => r.status).join("/")} sent=${sent.length}`);
    await clear();
    let last = 0; let okCount = 0;
    for (let i = 0; i < 12; i++) { const r = await call({ ...GOOD, email: `bulk${i}@example.com`, message: `m${i}` }, { ip: "8.8.8.8" }); last = r.status; if (r.status === 200) okCount++; }
    record("8b rate limit per IP: after 8 messages in the window further ones are refused (429); only 8 delivered", okCount === 8 && last === 429 && sent.length === 8, `ok=${okCount} last=${last}`);
    await clear();
    const perMail = [];
    for (let i = 0; i < 6; i++) perMail.push((await call({ ...GOOD, message: `distinct ${i}` })).status);
    record("8c rate limit per email address: 5th distinct message from one address in the window is refused (429)", perMail.slice(0, 4).every((s) => s === 200) && perMail[4] === 429, perMail.join("/"));
    await clear();
    const bot = await call({ ...GOOD, website: "http://spam.example" });
    record("8d honeypot: a filled hidden field reports success but delivers nothing", bot.status === 200 && sent.length === 0, `sent=${sent.length}`);
  }

  // 9 failure safety
  {
    await clear();
    resendMode = "fail";
    const r1 = await call(GOOD, { ip: "7.7.7.1" }); const d1 = await j(r1);
    resendMode = "throw";
    const r2 = await call({ ...GOOD, message: "other" }, { ip: "7.7.7.2" }); const d2 = await j(r2);
    const txt = JSON.stringify([d1, d2]);
    record("9a provider rejection / network failure -> 502 with a friendly message; no provider text, no internal detail, no key leaked; never reports success",
      r1.status === 502 && r2.status === 502 && d1.success !== true && d2.success !== true && !/internal provider|secret-internal|re_TEST|validation_error/.test(txt) && !!d1.error, `${r1.status}/${r2.status} ` + txt.slice(0, 120));
    resendMode = "ok";
    const retry = await call(GOOD, { ip: "7.7.7.3" });
    record("9b after a failed delivery the duplicate guard is released: Retry of the same message succeeds and is delivered once", retry.status === 200 && sent.filter((m) => m.html.includes("Where is my order")).length >= 1 && (await j(retry)).duplicate !== true, "");
    await clear();
    const savedKey = process.env.RESEND_API_KEY; delete process.env.RESEND_API_KEY;
    const nokey = await call(GOOD); const nd = await j(nokey);
    process.env.RESEND_API_KEY = savedKey;
    record("9c signed out with no mail key configured -> safe 502, never 'success'", nokey.status === 502 && nd.success !== true && !/RESEND/i.test(JSON.stringify(nd)), JSON.stringify(nd));
  }

  // 10 secret never exposed
  {
    const page = fs.readFileSync("app/contact/page.tsx", "utf8");
    const lib = fs.readFileSync("lib/contactForm.ts", "utf8");
    await clear();
    const r = await call(GOOD);
    record("10 the secret never reaches the browser: neither the page nor the shared validation lib references RESEND / resend, and the API response carries no key",
      !/resend/i.test(page) && !/resend/i.test(lib) && !JSON.stringify(await j(r)).includes(DUMMY_KEY) && !/process\.env/.test(page), "");
  }

  // 12 authenticated flow
  {
    await clear();
    await db.collection("users").doc("u_signed").set({ uid: "u_signed", name: "Stored Name", email: "signed@example.com" });
    const r = await call({ ...GOOD, email: "typed@example.com", userId: "victim_uid", userEmail: "victim@example.com", role: "admin", uid: "victim_uid" }, { uid: "u_signed", email: "signed@example.com" });
    const d = await j(r);
    const tickets = (await db.collection("tickets").get()).docs.map((x) => x.data() as any);
    const notes = (await db.collection("notifications").get()).docs.map((x) => x.data() as any);
    record("12 signed-in: ONE ticket owned by the VERIFIED token (userId/userEmail from the token — body userId/userEmail/role ignored), admin notified, support email also sent with Reply-To = typed address",
      r.status === 200 && d.ticket === true && tickets.length === 1 && tickets[0].userId === "u_signed" && tickets[0].userEmail === "signed@example.com" &&
        tickets[0].category === "Contact form" && tickets[0].status === "Open" && notes.length === 1 && notes[0].role === "admin" && sent.length === 1 &&
        !JSON.stringify(tickets).includes("victim"), JSON.stringify({ t: tickets.length, u: tickets[0]?.userId, e: tickets[0]?.userEmail }));
    await clear();
    resendMode = "throw";
    const r2 = await call(GOOD, { uid: "u_signed" }); const d2 = await j(r2);
    record("12b signed-in with the mail provider down: the ticket is still saved and success is truthful (ticket exists)", r2.status === 200 && d2.ticket === true && (await db.collection("tickets").get()).size === 1, "");
    await clear();
    const dup = await call(GOOD, { uid: "u_signed" }); const dup2 = await call(GOOD, { uid: "u_signed" });
    record("12c signed-in double submit: one ticket only", dup.status === 200 && dup2.status === 200 && (await db.collection("tickets").get()).size === 1, "");
    await clear();
    const badTok = await call(GOOD, { uid: "" });
    const forged = await contact(new Request("http://x/api/contact", { method: "POST", headers: { "content-type": "application/json", authorization: "Bearer garbage", "x-forwarded-for": "5.5.5.5" }, body: JSON.stringify(GOOD) }));
    record("11b an invalid token does not break signed-out contact (treated as signed out, email path, no ticket)", badTok.status === 200 && forged.status === 200 && (await db.collection("tickets").get()).size === 0, `${badTok.status}/${forged.status}`);
  }

  // shared validation
  {
    const v = validateContact({ name: "  A\tB  ", email: " A@B.CO ", subject: "x\ny", message: "line1\r\nline2\u0000" });
    record("13 shared validation normalises: single-line fields flattened, email lower-cased/trimmed, message keeps line breaks, control characters dropped",
      v.ok && v.value.name === "A B" && v.value.email === "a@b.co" && v.value.subject === "x y" && v.value.message === "line1\nline2", JSON.stringify(v.value));
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
  process.exit(passed === results.length ? 0 : 1);
}
main().catch((e) => { console.error("HARNESS ERROR:", e); process.exit(3); });
