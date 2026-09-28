/*
 * LOCAL-ONLY emulator regression harness — Customer account P3
 * (notification centre + bell, Account & Security, account deletion requests
 *  and the admin deletion workflow).
 *
 * Firestore EMULATOR only. Never touches production, never calls Resend or
 * Gemini, never reads the real service account (a throwaway RSA key is
 * generated). Auth is faked by intercepting the Identity Toolkit fetch:
 * "test:<uid>:<email>:<emailVerified>".
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/customer-account-p3/run.mts"
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
delete process.env.GEMINI_API_KEY;
delete process.env.RESEND_API_KEY;

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
  if (url.includes("api.resend.com") || url.includes("generativelanguage")) throw new Error("TEST HARNESS: external call attempted");
  return realFetch(input, init);
}) as typeof fetch;

const { Timestamp } = await import("firebase-admin/firestore");
const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { ADMIN_EMAIL } = await import("../../../lib/adminConfig.ts");
const { GET: listRoute } = await import("../../../app/api/account/notifications/route.ts");
const { GET: unreadRoute } = await import("../../../app/api/account/notifications/unread-count/route.ts");
const { POST: readRoute } = await import("../../../app/api/account/notifications/read/route.ts");
const deletionModule = await import("../../../app/api/account/deletion-request/route.ts");
const { POST: cancelRoute } = await import("../../../app/api/account/deletion-request/cancel/route.ts");
const { GET: adminListRoute } = await import("../../../app/api/admin/account-deletions/route.ts");
const { POST: adminDecideRoute } = await import("../../../app/api/admin/account-deletions/[uid]/route.ts");
const { GET: summaryRoute } = await import("../../../app/api/account/summary/route.ts");
const NV = await import("../../../lib/account/notificationViews.ts");
const DR = await import("../../../lib/account/deletionRequests.ts");
const { ACCOUNT_NOTIFICATIONS_PAGE_KEYS } = await import("../../../lib/account/notificationServer.ts");

const db = getAdminDb();
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["users", "orders", "itemRequests", "notifications", "rateLimits", "accountDeletionRequests", "audit_logs", "rewardTransactions"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

const A = "alice", B = "bob", BL = "blocked1", ADMIN = "adminUid";
const email = (uid: string) => (uid === ADMIN ? ADMIN_EMAIL : `${uid}@example.com`);
const tok = (uid: string) => `Bearer test:${uid}:${email(uid)}:true`;

async function call(
  handler: (req: Request, ctx?: any) => Promise<Response>,
  opts: { uid?: string | null; method?: string; body?: unknown; query?: string; headers?: Record<string, string>; params?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { "content-type": "application/json", ...(opts.headers || {}) };
  if (opts.uid) headers.authorization = tok(opts.uid);
  const method = opts.method || (opts.body === undefined ? "GET" : "POST");
  const req = new Request(`http://x/api${opts.query || ""}`, { method, headers, ...(method === "GET" ? {} : { body: JSON.stringify(opts.body ?? {}) }) });
  const res = opts.params ? await handler(req, { params: Promise.resolve(opts.params) }) : await handler(req);
  const text = await res.text();
  let json: any = {};
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, body: json, text };
}
const keys = (o: any) => Object.keys(o || {}).sort().join(",");
const expect = (k: readonly string[]) => [...k].sort().join(",");
const hoursAgo = (h: number) => Timestamp.fromMillis(Date.now() - h * 3600000);
const note = (id: string, data: Record<string, unknown>) => db.collection("notifications").doc(id).set(data);

async function seed() {
  for (const [uid, extra] of [[A, { name: "Alice Real" }], [B, { name: "Bob Private" }], [BL, { name: "Blocked", status: "Blocked" }]] as const) {
    await db.collection("users").doc(uid).set({ uid, role: "customer", email: email(uid), rewardPoints: 42, ...extra });
  }
  await db.collection("orders").doc("A_ord1").set({ userId: A, orderNumber: "ORD-A1", status: "Delivered", items: [] });
  await db.collection("orders").doc("B_ord1").set({ userId: B, orderNumber: "ORD-B1", status: "Confirmed", items: [] });
  await db.collection("rewardTransactions").doc("t1").set({ userId: A, type: "Earned", points: 5 });

  await note(`dn_customer_${A}_evt1_OUT_FOR_DELIVERY`, {
    userId: A, role: "customer", type: "delivery", title: "Out for delivery", message: "Your order is out for delivery.", read: false,
    createdAt: hoursAgo(1), notificationType: "OUT_FOR_DELIVERY", eventId: "evt_SECRET", deliveryJobId: "job_SECRET",
    sellerOrderId: "A_ord1_sellerZZ", orderId: "A_ord1", orderNumber: "ORD-A1", userEmail: email(A),
  });
  await note("a_refund", { userId: A, role: "customer", type: "refund", title: "Refund Status Updated", message: "Refunded.", read: false, createdAt: hoursAgo(2) });
  await note("a_support", { userId: A, role: "customer", type: "support", title: "Support Ticket Update", message: "Replied.", read: true, createdAt: hoursAgo(3) });
  await note("a_foreign_order", { userId: A, role: "customer", type: "delivery", title: "Odd", message: "x", read: false, createdAt: hoursAgo(4), orderId: "B_ord1", orderNumber: "ORD-B1" });
  await note("a_long", { userId: A, role: "customer", type: "order", title: "T".repeat(300), message: "M".repeat(1500), read: false, createdAt: hoursAgo(5) });
  await note("a_as_seller", { userId: A, role: "seller", type: "order", title: "SELLER-ONLY", message: "seller feed", read: false, createdAt: hoursAgo(1) });
  await note("admin_note", { role: "admin", type: "order", title: "ADMIN-ONLY", message: "admin feed", read: false, createdAt: hoursAgo(1) });
  await note("b_1", { userId: B, role: "customer", type: "order", title: "BOB-PRIVATE-1", message: "for bob", read: false, createdAt: hoursAgo(1) });
  await note("b_2", { userId: B, role: "customer", type: "order", title: "BOB-PRIVATE-2", message: "for bob", read: false, createdAt: hoursAgo(2) });
  await note("bl_1", { userId: BL, role: "customer", type: "order", title: "Blocked note", message: "x", read: false, createdAt: hoursAgo(1) });
  for (let i = 0; i < 52; i++) {
    await note(`a_bulk_${i}`, { userId: A, role: "customer", type: "order", title: `Bulk ${i}`, message: "old", read: true, createdAt: hoursAgo(100 + i) });
  }
}

const ROUTES_GET = [listRoute, unreadRoute, deletionModule.GET, adminListRoute];

try {
  await clearAll();
  await seed();

  // ============ 1. Auth ============
  {
    const r = await Promise.all([
      ...ROUTES_GET.map((h) => call(h)),
      call(readRoute, { body: { all: true } }),
      call(deletionModule.POST, { body: { confirm: true } }),
      call(cancelRoute, { body: {} }),
      call(adminDecideRoute, { body: { status: "in_review" }, params: { uid: A } }),
    ]);
    record("1  signed-out → 401 on every P3 route (4 GET, 4 POST)", r.every((x) => x.status === 401), r.map((x) => x.status).join("/"));
  }

  // ============ 2. Notification centre ============
  const page1 = await call(listRoute, { uid: A });
  {
    const b = page1.body;
    const n = b.notifications as any[];
    record("2  list: EXACT page + item keys; opaque 24-hex ids (not document ids)",
      page1.status === 200 && keys(b) === expect(ACCOUNT_NOTIFICATIONS_PAGE_KEYS) &&
        n.every((x) => keys(x) === expect(NV.CUSTOMER_NOTIFICATION_KEYS) && /^[a-f0-9]{24}$/.test(x.id)) &&
        !page1.text.includes("dn_customer_") && !page1.text.includes("a_refund"),
      keys(n[0]));
    record("3  only A's CUSTOMER notifications: unread 4 (seller-role, admin and B's excluded); 57 total across pages",
      b.unreadCount === 4 && n.length === 50 && b.nextCursor === "50" &&
        !page1.text.includes("SELLER-ONLY") && !page1.text.includes("ADMIN-ONLY") && !page1.text.includes("BOB-PRIVATE"),
      `unread ${b.unreadCount}, page ${n.length}, cursor ${b.nextCursor}`);
    const ofd = n.find((x) => x.title === "Out for delivery");
    const foreign = n.find((x) => x.title === "Odd");
    const refund = n.find((x) => x.title === "Refund Status Updated");
    const support = n.find((x) => x.title === "Support Ticket Update");
    const long = n.find((x) => x.title.startsWith("TTT"));
    record("4  links are server-derived: own order → /orders/A_ord1 with its order number; a notification naming SOMEONE ELSE's order gets no link/number; refund → /profile/refunds; support → /profile/tickets; categories mapped; text bounded (200/1000)",
      ofd.link === "/orders/A_ord1" && ofd.orderNumber === "ORD-A1" && ofd.category === "delivery" &&
        foreign.link === null && foreign.orderNumber === null &&
        refund.link === "/profile/refunds" && refund.category === "refund" &&
        support.link === "/profile/tickets" && support.read === true &&
        long.title.length === 200 && long.message.length === 1000,
      JSON.stringify({ ofd: ofd.link, foreign: foreign.link, refund: refund.link, support: support.link }));
    const leaks = ["evt_SECRET", "job_SECRET", "sellerZZ", "sellerOrderId", "deliveryJobId", "eventId", "notificationType", "userEmail", email(A), "userId", "role", "ORD-B1", "B_ord1"]
      .filter((s) => page1.text.includes(s));
    record("5  no internal fields leak: no eventId / deliveryJobId / sellerOrderId (seller uid) / notificationType / userEmail / userId / role, nothing of B's order",
      leaks.length === 0, leaks.length ? `LEAKED: ${leaks.join(", ")}` : "clean");
    const page2 = await call(listRoute, { uid: A, query: "?cursor=50" });
    const bad = await call(listRoute, { uid: A, query: "?cursor=-1" });
    const ids = new Set([...n, ...page2.body.notifications].map((x: any) => x.id));
    record("6  pagination: 50 + 7, no overlap, newest first; malformed cursor → 400",
      page2.body.notifications.length === 7 && page2.body.nextCursor === null && ids.size === 57 &&
        n[0].createdAt >= n[1].createdAt && bad.status === 400,
      `${n.length}+${page2.body.notifications.length}`);
    const unread = await call(unreadRoute, { uid: A });
    record("7  unread-count matches (4) and has exactly one field", unread.body.unreadCount === 4 && keys(unread.body) === "unreadCount", JSON.stringify(unread.body));
  }

  // ============ 3. Mark read ============
  {
    const n = page1.body.notifications as any[];
    const target = n.find((x) => x.title === "Refund Status Updated");
    const bobId = NV.opaqueNotificationId("b_1");
    const sellerId = NV.opaqueNotificationId("a_as_seller");
    const beforeDoc = (await db.collection("notifications").doc("a_refund").get()).data()!;
    const one = await call(readRoute, { uid: A, body: { ids: [target.id] } });
    const afterDoc = (await db.collection("notifications").doc("a_refund").get()).data()!;
    const cross = await call(readRoute, { uid: A, body: { ids: [bobId, sellerId] } });
    const bob = (await db.collection("notifications").doc("b_1").get()).data()!;
    const seller = (await db.collection("notifications").doc("a_as_seller").get()).data()!;
    const changed = Object.keys(afterDoc).filter((k) => JSON.stringify(afterDoc[k]) !== JSON.stringify(beforeDoc[k]));
    record("8  mark-read: own notification → read (only the `read` field changes); B's id and A's own SELLER-feed id change nothing",
      one.body.updated === 1 && afterDoc.read === true && changed.join(",") === "read" &&
        cross.status === 200 && cross.body.updated === 0 && bob.read === false && seller.read === false,
      `one ${one.body.updated}, cross ${cross.body.updated}, changed [${changed}]`);
    const invalid = await Promise.all([
      call(readRoute, { uid: A, body: {} }),
      call(readRoute, { uid: A, body: { ids: [] } }),
      call(readRoute, { uid: A, body: { ids: Array.from({ length: 101 }, (_, i) => NV.opaqueNotificationId(`x${i}`)) } }),
      call(readRoute, { uid: A, body: { ids: ["a_refund"] } }),
      call(readRoute, { uid: A, body: { ids: [target.id], all: true } }),
      call(readRoute, { uid: A, body: { all: "yes" } }),
    ]);
    record("9  malformed mark-read bodies → 400 (empty, 0 ids, 101 ids, raw doc id, ids+all, all≠true)",
      invalid.every((r) => r.status === 400), invalid.map((r) => r.status).join("/"));
    const all = await call(readRoute, { uid: A, body: { all: true }, headers: { "x-user-id": B } });
    const aUnread = (await call(unreadRoute, { uid: A })).body.unreadCount;
    const bUnread = (await call(unreadRoute, { uid: B })).body.unreadCount;
    const sellerAfter = (await db.collection("notifications").doc("a_as_seller").get()).data()!;
    record("10 mark-all: clears A's own unread customer notifications only (A 0; B still 2; A's seller-feed note untouched) — a spoofed x-user-id header is ignored",
      all.body.updated === 3 && aUnread === 0 && bUnread === 2 && sellerAfter.read === false, `updated ${all.body.updated}, A ${aUnread}, B ${bUnread}`);
  }

  // ============ 4. Spoofing, dashboard consistency ============
  {
    const spoof = await call(listRoute, { uid: A, query: `?uid=${B}&email=${email(B)}`, headers: { "x-uid": B, "x-user-email": email(B) } });
    record("11 a uid/email in the query or headers is ignored — A still gets A's feed only",
      spoof.status === 200 && !spoof.text.includes("BOB-PRIVATE") && spoof.body.notifications.length === 50, "");
    await note("a_as_seller2", { userId: A, role: "seller", type: "order", title: "S2", message: "x", read: false, createdAt: hoursAgo(1) });
    await note("a_new", { userId: A, role: "customer", type: "order", title: "New", message: "x", read: false, createdAt: hoursAgo(0.1) });
    const summary = await call(summaryRoute, { uid: A });
    record("12 the P2 dashboard counts unread with the SAME customer-only rule (1: the new customer note; seller-feed notes excluded)",
      summary.body.notifications?.unread === 1, JSON.stringify(summary.body.notifications));
  }

  // ============ 5. Deletion requests (customer) ============
  {
    const none = await call(deletionModule.GET, { uid: A });
    const noConfirm = await call(deletionModule.POST, { uid: A, body: { reason: "x" } });
    const tooLong = await call(deletionModule.POST, { uid: A, body: { confirm: true, reason: "r".repeat(501) } });
    const created = await call(deletionModule.POST, { uid: A, body: { confirm: true, reason: "Moving abroad", userId: B, email: email(B) } });
    const dup = await call(deletionModule.POST, { uid: A, body: { confirm: true } });
    const stored = (await db.collection("accountDeletionRequests").doc(A).get()).data()!;
    const adminNotes = (await db.collection("notifications").where("title", "==", "Account deletion request").get()).size;
    record("13 request: none at first (canRequest); confirm required (400); reason ≤500 (400); created 201 with EXACT view keys, pending, cancellable; stored under the TOKEN's uid/email (a body uid/email is ignored); admin notified; a second open request → 409",
      none.body.request === null && none.body.canRequest === true && noConfirm.status === 400 && tooLong.status === 400 &&
        created.status === 201 && keys(created.body.request) === expect(DR.DELETION_REQUEST_VIEW_KEYS) &&
        created.body.request.status === "pending" && created.body.request.canCancel === true &&
        stored.userId === A && stored.email === email(A) && stored.name === "Alice Real" && stored.reason === "Moving abroad" &&
        adminNotes === 1 && dup.status === 409,
      `${created.status}/${dup.status}`);
    const bGet = await call(deletionModule.GET, { uid: B });
    const bCancel = await call(cancelRoute, { uid: B, body: { uid: A } });
    const stillA = (await db.collection("accountDeletionRequests").doc(A).get()).data()!;
    record("14 isolation: B sees no request and cannot cancel A's (B has none → 404); A's stays pending",
      bGet.body.request === null && bCancel.status === 404 && stillA.status === "pending", `${bCancel.status}`);
    // The deletion write budget is 5 per 10 minutes (invalid attempts count
    // too, by design); start a fresh window for the cancel / re-request steps.
    await db.collection("rateLimits").doc(`account-deletion-write_${A}`).delete();
    const cancel = await call(cancelRoute, { uid: A, body: {} });
    const again = await call(cancelRoute, { uid: A, body: {} });
    const after = await call(deletionModule.GET, { uid: A });
    const re = await call(deletionModule.POST, { uid: A, body: { confirm: true } });
    const history = ((await db.collection("accountDeletionRequests").doc(A).get()).data()!.history || []).map((h: any) => `${h.status}:${h.by}`);
    record("15 cancel while pending → cancelled; cancelling again → 409; can re-request after cancelling (history kept: pending → cancelled → pending)",
      cancel.status === 200 && cancel.body.request.status === "cancelled" && again.status === 409 &&
        after.body.canRequest === true && after.body.request.canCancel === false && re.status === 201 &&
        history.join(",") === "pending:customer,cancelled:customer,pending:customer",
      history.join(","));
  }

  // ============ 6. Admin workflow ============
  {
    const asCustomer = await call(adminListRoute, { uid: A });
    const asCustomerDecide = await call(adminDecideRoute, { uid: A, body: { status: "completed" }, params: { uid: A } });
    const list = await call(adminListRoute, { uid: ADMIN, query: "?status=open" });
    const reqA = list.body.requests?.find((r: any) => r.uid === A);
    record("16 admin routes: a customer gets 403; admin sees open requests with EXACT keys and an account snapshot (orders, open orders, returns, refunds due, reward balance)",
      asCustomer.status === 403 && asCustomerDecide.status === 403 && list.status === 200 &&
        keys(reqA) === expect(DR.ADMIN_DELETION_REQUEST_KEYS) && reqA.account.orders === 1 && reqA.account.rewardBalance === 42 && reqA.status === "pending",
      JSON.stringify(reqA?.account));
    const review = await call(adminDecideRoute, { uid: ADMIN, body: { status: "in_review", internalNote: "INTERNAL-SECRET-NOTE" }, params: { uid: A } });
    const reviewAgain = await call(adminDecideRoute, { uid: ADMIN, body: { status: "in_review" }, params: { uid: A } });
    const rejectNoMsg = await call(adminDecideRoute, { uid: ADMIN, body: { status: "rejected" }, params: { uid: A } });
    const badStatus = await call(adminDecideRoute, { uid: ADMIN, body: { status: "cancelled" }, params: { uid: A } });
    const unknown = await call(adminDecideRoute, { uid: ADMIN, body: { status: "in_review" }, params: { uid: "nobody" } });
    const malformed = await call(adminDecideRoute, { uid: ADMIN, body: { status: "in_review" }, params: { uid: "a/b" } });
    const complete = await call(adminDecideRoute, { uid: ADMIN, body: { status: "completed", customerMessage: "Your account has been closed." }, params: { uid: A } });
    const view = await call(deletionModule.GET, { uid: A });
    const reAfterComplete = await call(deletionModule.POST, { uid: A, body: { confirm: true } });
    const audits = await db.collection("audit_logs").where("targetId", "==", A).get();
    const custNote = await db.collection("notifications").where("userId", "==", A).where("type", "==", "account").get();
    record("17 decisions: pending → in_review → completed; illegal moves 409 (in_review twice), reject needs a customer message (400), bad status 400, unknown/malformed uid 404; each decision audit-logged and the customer notified (type account, linked to settings)",
      review.status === 200 && reviewAgain.status === 409 && rejectNoMsg.status === 400 && badStatus.status === 400 &&
        unknown.status === 404 && malformed.status === 404 && complete.status === 200 &&
        audits.size === 2 && audits.docs.every((d) => d.get("actorUid") === ADMIN) && custNote.size === 2,
      `${review.status}/${reviewAgain.status}/${rejectNoMsg.status}/${complete.status}, audits ${audits.size}, notes ${custNote.size}`);
    record("18 customer view after completion: 'Completed', the admin's message shown, never the internal note or the admin's identity; a completed request is final (re-request 409)",
      view.body.request.status === "completed" && view.body.request.messageFromYomico === "Your account has been closed." &&
        !view.text.includes("INTERNAL-SECRET-NOTE") && !view.text.includes(ADMIN) && !view.text.includes("handledBy") &&
        view.body.canRequest === false && reAfterComplete.status === 409,
      JSON.stringify(view.body.request));
    const centre = await call(listRoute, { uid: A });
    const accountNote = centre.body.notifications.find((n: any) => n.title === "Account deletion request update");
    record("19 the customer's deletion update appears in their centre linked to /settings (category support)",
      accountNote?.link === "/settings" && accountNote?.category === "support", JSON.stringify(accountNote));

    // B: request → reject with a message → may request again
    await call(deletionModule.POST, { uid: B, body: { confirm: true } });
    const rej = await call(adminDecideRoute, { uid: ADMIN, body: { status: "rejected", customerMessage: "You have an open order." }, params: { uid: B } });
    const bView = await call(deletionModule.GET, { uid: B });
    const bRe = await call(deletionModule.POST, { uid: B, body: { confirm: true } });
    record("20 rejected with a reason → customer sees it and may request again",
      rej.status === 200 && bView.body.request.status === "rejected" && bView.body.request.messageFromYomico === "You have an open order." &&
        bView.body.canRequest === true && bRe.status === 201,
      `${rej.status}/${bRe.status}`);

    // Nothing deleted or blocked by any of it.
    const user = (await db.collection("users").doc(A).get()).data();
    const order = await db.collection("orders").doc("A_ord1").get();
    const ledger = await db.collection("rewardTransactions").doc("t1").get();
    record("21 completion deletes and blocks NOTHING: the user profile (status unchanged), orders and reward ledger are all intact",
      !!user && user.status === undefined && user.rewardPoints === 42 && order.exists && ledger.exists, JSON.stringify({ status: user?.status }));
  }

  // ============ 7. Blocked customer ============
  {
    const list = await call(listRoute, { uid: BL });
    const mark = await call(readRoute, { uid: BL, body: { all: true } });
    const req = await call(deletionModule.POST, { uid: BL, body: { confirm: true, reason: "blocked" } });
    const cancel = await call(cancelRoute, { uid: BL, body: {} });
    record("22 a BLOCKED customer can read and mark their notifications and create/cancel a deletion request",
      list.status === 200 && list.body.notifications.length === 1 && mark.body.updated === 1 && req.status === 201 && cancel.status === 200,
      `${list.status}/${mark.status}/${req.status}/${cancel.status}`);
  }

  // ============ 8. Rate limits ============
  {
    const now = Date.now();
    await db.collection("rateLimits").doc(`account-notifications_${B}`).set({ windowStart: now, count: 60 });
    await db.collection("rateLimits").doc(`account-notifications-unread_${B}`).set({ windowStart: now, count: 60 });
    await db.collection("rateLimits").doc(`account-notifications-read_${B}`).set({ windowStart: now, count: 60 });
    await db.collection("rateLimits").doc(`account-deletion-write_${B}`).set({ windowStart: now, count: 5 });
    await db.collection("rateLimits").doc(`account-deletion-read_${B}`).set({ windowStart: now, count: 60 });
    await db.collection("rateLimits").doc(`admin-account-deletions_${ADMIN}`).set({ windowStart: now, count: 60 });
    const r = await Promise.all([
      call(listRoute, { uid: B }), call(unreadRoute, { uid: B }), call(readRoute, { uid: B, body: { all: true } }),
      call(deletionModule.POST, { uid: B, body: { confirm: true } }), call(cancelRoute, { uid: B, body: {} }),
      call(deletionModule.GET, { uid: B }), call(adminListRoute, { uid: ADMIN }),
    ]);
    const other = await call(unreadRoute, { uid: A });
    record("23 rate limits → 429 (list/unread/read 60, deletion writes 5, deletion read 60, admin 60) for that caller only",
      r.every((x) => x.status === 429) && other.status === 200, r.map((x) => x.status).join("/"));
  }

  // ============ 9. Pages ============
  {
    const src = (p: string) => fs.readFileSync(path.join(REPO, p), "utf8");
    const settings = src("app/settings/page.tsx");
    const notifications = src("app/notifications/page.tsx");
    const bell = src("components/NotificationBell.tsx");
    record("24 settings: no direct Firestore reads, no decorative preference toggles, verification status + resend, signed-in password reset, deletion request (not deletion)",
      !/firebase\/firestore/.test(settings) && !/Promotional Notifications|type="checkbox"[^>]*defaultChecked/.test(settings) &&
        /sendVerificationEmail/.test(settings) && /sendPasswordResetEmail\(auth, user\.email\)/.test(settings) &&
        /requestAccountDeletion/.test(settings) && !/deleteUser|\.delete\(\)/.test(settings),
      "");
    record("25 notification page uses the API only; the bell's customer mode polls the API every 60 s (seller mode unchanged)",
      !/firebase\/firestore/.test(notifications) && /fetchNotifications/.test(notifications) &&
        /fetchUnreadCount/.test(bell) && /POLL_MS = 60 \* 1000/.test(bell) && /where\("role", "==", "seller"\)/.test(bell),
      "");
  }
} catch (error) {
  record("harness", false, (error as Error).stack || String(error));
} finally {
  await clearAll().catch(() => {});
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
