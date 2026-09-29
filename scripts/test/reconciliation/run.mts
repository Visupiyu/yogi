/*
 * Orphan order reconciliation report — emulator test.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST;
 * a throwaway service-account key is generated). Seeds live, archived and
 * missing orders with references in every inventoried collection, then proves
 * scripts/test/reconciliation/orphan-orders-report.ts:
 *   - finds exactly the missing order ids, per collection and category,
 *     including ledger rows linked only through requestId / returnId;
 *   - never reports valid references and counts id-less records as
 *     "not verifiable";
 *   - keeps its exposure totals separate and prints no personal data;
 *   - writes NOTHING (full before/after snapshot of every collection);
 *   - as a CLI, refuses without the emulator or ALLOW_PRODUCTION=yes, refuses
 *     any argument other than --json, and prints the same report under the
 *     emulator.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/reconciliation/run.mts"
 */
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
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
delete process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
delete process.env.ALLOW_PRODUCTION;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SCRIPT = "scripts/test/reconciliation/orphan-orders-report.ts";

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { runOrphanOrderReport, formatOrphanOrderReport } = await import("./orphan-orders-report.ts");
const { Timestamp } = await import("firebase-admin/firestore");
const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const at = (iso: string) => Timestamp.fromMillis(Date.parse(iso));
const PII = ["Jane Doe", "jane@example.com", "9876543210", "221B Test Street"];

async function snapshotAll(): Promise<string> {
  const out: string[] = [];
  async function walk(cols: FirebaseFirestore.CollectionReference[]) {
    for (const col of cols.sort((a, b) => a.path.localeCompare(b.path))) {
      const snap = await col.get();
      for (const d of snap.docs.sort((a, b) => a.id.localeCompare(b.id))) {
        out.push(`${d.ref.path} ${JSON.stringify(d.data())} ${d.updateTime.toMillis()}`);
        await walk(await d.ref.listCollections());
      }
    }
  }
  await walk(await db.listCollections());
  return out.join("\n");
}

async function seed() {
  const set = (p: string, data: Record<string, unknown>) => db.doc(p).set(data);
  // existing orders
  await set("orders/o_live", { userId: "u1", status: "Delivered", customerName: "Jane Doe", phone: "9876543210", address: "221B Test Street", items: [] });
  await set("orders/pay_live", { userId: "u2", status: "Confirmed", items: [] });
  await set("orders/o_arch", { userId: "u1", status: "Cancelled", archived: true, archivedAt: at("2026-09-01T00:00:00Z"), archivedBy: "admin", archiveReason: "test", items: [] });

  // ---- points ----
  await set("rewardTransactions/rt_earn_gone", { userId: "u1", userEmail: "jane@example.com", type: "Earned", points: 5, orderId: "o_gone", createdAt: at("2026-08-20T16:47:15Z") });
  await set("rewardTransactions/rt_redeem_gone", { userId: "u1", userEmail: "jane@example.com", type: "Redeemed", points: 26, orderId: "o_gone", createdAt: at("2026-08-20T16:47:16Z") });
  await set("rewardTransactions/rt_v2_gone2", { v: 2, kind: "purchase_earned", type: "Earned", userId: "u2", points: 7, delta: 7, orderId: "o_gone2", createdAt: at("2026-08-22T00:00:00Z") });
  await set("rewardTransactions/rt_reversed", { userId: "u3", type: "Cancelled - Points Reversed", points: 13, orderId: "o_gone6", createdAt: at("2026-08-20T09:54:44Z") });
  await set("rewardTransactions/rt_restored", { userId: "u3", type: "Cancelled - Points Restored", points: 7, orderId: "o_gone6", createdAt: at("2026-08-20T09:54:45Z") });
  await set("rewardTransactions/rt_refund_item", { userId: "u4", type: "Refund", points: 1199, requestId: "ir_gone", createdAt: at("2026-08-31T20:38:24Z") });
  await set("rewardTransactions/rt_refund_return", { userId: "u4", type: "Refund", points: 18, returnId: "ret_gone", createdAt: at("2026-09-02T00:00:00Z") });
  await set("rewardTransactions/rt_valid", { userId: "u1", type: "Earned", points: 9, orderId: "o_live" });
  await set("rewardTransactions/rt_noref", { userId: "u1", type: "Referral Bonus", points: 50 });
  await set("rewardTransactions/rt_refund_valid", { userId: "u1", type: "Refund", points: 30, requestId: "ir_live" });

  // ---- seller ----
  await set("sellerOrders/o_gone_V1", { orderId: "o_gone", vendorId: "V1", vendorEarning: 532, vendorSubtotal: 620, customerName: "Jane Doe", itemFulfilment: { i0: { status: "Confirmed" } }, createdAt: at("2026-08-29T07:03:29Z") });
  await set("sellerOrders/o_live_V1", { orderId: "o_live", vendorId: "V1", vendorEarning: 900 });

  // ---- returns ----
  await set("itemRequests/ir_gone", { orderId: "o_gone3", userId: "u4", userEmail: "jane@example.com", customerName: "Jane Doe", vendorId: "V1", type: "return", status: "REFUNDED", requestNumber: "RET000001", refund: { destination: "REWARD_POINTS", amount: 1199, credited: true, refundNumber: "RFND000001" }, createdAt: at("2026-08-31T18:24:32Z") });
  await set("itemRequests/ir_live", { orderId: "o_live", userId: "u1", vendorId: "V1", type: "return", status: "REFUNDED", refund: { amount: 30, credited: true } });
  await set("returns/ret_gone", { orderId: "o_gone3", userId: "u4", status: "Refunded", refundAmount: 18, pointsCredited: true, pickupPhone: "9876543210", createdAt: at("2026-08-29T16:58:18Z") });
  await set("returnCollectionJobs/rcj_gone", { orderId: "o_gone3", status: "COLLECTED" });

  // ---- coupon ----
  await set("couponRedemptions/u1_CANCELTEST10", { userId: "u1", code: "CANCELTEST10", orderId: "o_gone", createdAt: at("2026-08-20T16:47:15Z") });
  await set("couponRedemptions/u2_SAVE10", { userId: "u2", code: "SAVE10", orderId: "o_live" });

  // ---- audit ----
  await set("audit_logs/a_gone", { action: "order_status_change", targetId: "o_gone", actorUid: "admin", actorEmail: "admin@example.com", details: { oldStatus: "Pending", newStatus: "Confirmed" }, createdAt: at("2026-08-29T07:03:29Z") });
  await set("audit_logs/a_live", { action: "order_status_change", targetId: "o_live", actorUid: "admin", details: {} });
  await set("audit_logs/a_other", { action: "tax_verification_change", targetId: "o_gone_lookalike", actorUid: "admin", details: {} });
  await set("audit_logs/a_arch", { action: "order_archived", targetId: "o_arch", actorUid: "admin", details: { reason: "test" } });

  // ---- payment ----
  await set("paymentIntents/order_rzp_1", { uid: "u5", status: "created", finalizedPaymentId: "pay_gone", expectedAmountPaise: 99900 });
  await set("paymentIntents/order_rzp_2", { uid: "u2", status: "created", finalizedPaymentId: "pay_live" });
  await set("paymentIntents/order_rzp_3", { uid: "u2", status: "created" });
  await set("codPaymentReferences/cod_gone", { orderId: "o_gone", status: "submitted" });
  await set("unmatchedPayments/pay_x", { amountPaise: 100, reason: "no_intent" });

  // ---- delivery ----
  await set("deliveryJobs/job_gone", { orderId: "o_gone4", status: "ASSIGNED" });
  await set("deliveryJobs/job_gone/legs/leg1", { orderId: "o_gone4", status: "PENDING" });
  await set("deliveryJobs/job_gone/legs/leg2", { status: "PENDING" });
  await set("deliveryJobs/job_live", { orderId: "o_live", status: "DELIVERED" });
  await set("deliveryEvents/ev_gone", { orderId: "o_gone4", type: "picked_up" });
  await set("deliveryEvents/ev_noref", { type: "shift_start" });

  // ---- other ----
  await set("notifications/n_gone", { orderId: "o_gone", role: "seller", type: "order", title: "New order", message: "Order from Jane Doe, 221B Test Street", userId: "V1" });
  await set("notifications/n_live", { orderId: "o_live", role: "customer", type: "order", title: "Delivered", userId: "u1" });
  await set("notifications/n_noref", { role: "customer", type: "promo", title: "Sale", userId: "u1" });
  await set("chats/chat_gone", { orderId: "o_gone5", customerName: "Jane Doe", customerEmail: "jane@example.com", lastMessage: "hello", createdAt: at("2026-07-27T11:31:39Z") });
  await set("chats/chat_noref", { productId: "p1", customerName: "Jane Doe" });
  await set("productReviews/rev_live", { orderId: "o_live", rating: 5 });
}

async function main() {
  for (const c of await db.listCollections()) await db.recursiveDelete(c);
  await seed();
  const before = await snapshotAll();

  const report = await runOrphanOrderReport(db, new Date("2026-09-29T00:00:00Z"));
  const text = formatOrphanOrderReport(report);
  const json = JSON.stringify(report);
  const after = await snapshotAll();

  const expectedMissing = ["o_gone", "o_gone2", "o_gone3", "o_gone4", "o_gone5", "o_gone6", "pay_gone"];
  record("X1 finds exactly the missing order ids (valid, archived and non-order audit targets are not reported)",
    JSON.stringify(report.missingOrderIds) === JSON.stringify(expectedMissing) && report.orders.total === 3 && report.orders.archived === 1,
    `missing=${report.missingOrderIds.join(",")}`);

  const col = (name: string) => report.collections.find((c) => c.collection === name)!;
  const counts = Object.fromEntries(report.collections.map((c) => [c.collection, [c.scanned, c.valid, c.orphan, c.notVerifiable]]));
  record("X2 per-collection scanned/valid/orphan/not-verifiable counts are exact",
    JSON.stringify(counts) === JSON.stringify({
      rewardTransactions: [10, 1, 5, 4], sellerOrders: [2, 1, 1, 0], itemRequests: [2, 1, 1, 0], returns: [1, 0, 1, 0],
      returnCollectionJobs: [1, 0, 1, 0], couponRedemptions: [2, 1, 1, 0], audit_logs: [4, 2, 1, 1], paymentIntents: [3, 1, 1, 1],
      codPaymentReferences: [1, 0, 1, 0], deliveryJobs: [2, 1, 1, 0], "deliveryJobs/*/legs": [2, 0, 1, 1], deliveryEvents: [2, 0, 1, 1],
      notifications: [3, 1, 1, 1], chats: [2, 0, 1, 1], productReviews: [1, 1, 0, 0],
    }) && col("audit_logs").withReference === 3,
    JSON.stringify(counts));

  const refFor = (docId: string) => report.references.find((r) => r.docId === docId);
  record("X3 refund ledger rows with no orderId are tied to the missing order through requestId / returnId; a valid request's row is not",
    refFor("rt_refund_item")?.orderId === "o_gone3" && refFor("rt_refund_item")?.via === "requestId" &&
      refFor("rt_refund_return")?.orderId === "o_gone3" && refFor("rt_refund_return")?.via === "returnId" && !refFor("rt_refund_valid") && !refFor("rt_noref"),
    `item=${refFor("rt_refund_item")?.via} return=${refFor("rt_refund_return")?.via}`);

  const o = (id: string) => report.orphanOrders.find((x) => x.orderId === id)!;
  record("X4 per-order roll-up: categories, points net, credited refunds, seller earnings and coupon codes",
    JSON.stringify(o("o_gone").categories) === JSON.stringify(["audit", "coupon", "other", "payment", "points", "seller"]) &&
      o("o_gone").pointsNet === -21 && o("o_gone").sellerEarningsRecorded === 532 && JSON.stringify(o("o_gone").couponCodes) === JSON.stringify(["CANCELTEST10"]) &&
      JSON.stringify(o("o_gone3").categories) === JSON.stringify(["points", "returns"]) && o("o_gone3").pointsNet === 1217 && o("o_gone3").refundsCredited === 1217 &&
      o("o_gone6").pointsNet === -6 && JSON.stringify(o("o_gone4").categories) === JSON.stringify(["delivery"]) &&
      JSON.stringify(o("pay_gone").categories) === JSON.stringify(["payment"]) && JSON.stringify(o("o_gone5").categories) === JSON.stringify(["other"]) &&
      o("o_gone").earliestReferenceAt === "2026-08-20T16:47:15.000Z",
    JSON.stringify(report.orphanOrders.map((x) => [x.orderId, x.pointsNet, x.refundsCredited, x.sellerEarningsRecorded])));

  const t = report.totals;
  record("X5 totals are kept separate: points by class, seller earnings, credited refunds, coupon claims, unmatched payments",
    t.orphanOrderIds === 7 && t.orphanReferences === 20 &&
      JSON.stringify(t.points) === JSON.stringify({ earned: 12, redeemed: 26, refunded: 1217, cancelRestored: 7, cancelReversed: 13, other: 0 }) &&
      t.sellerEarningsRecorded === 532 && t.refundsCreditedAmount === 1217 && t.couponClaims === 1 && t.unmatchedPayments === 1 &&
      JSON.stringify(t.byCategory) === JSON.stringify({ points: 7, seller: 1, returns: 3, coupon: 1, audit: 1, payment: 2, delivery: 3, other: 2 }),
    JSON.stringify(t));

  record("X6 no personal data in the JSON or text report (names, emails, phones, addresses, message text)",
    PII.every((p) => !json.includes(p) && !text.includes(p)) && !json.includes("admin@example.com") && !json.includes("hello"),
    "");

  record("X7 the report wrote NOTHING: every document (data and update time) identical before and after",
    before === after && before.length > 0, `docs=${before.split("\n").length}`);

  // ---- CLI ----
  const tsx = path.join(REPO, "node_modules/tsx/dist/cli.mjs");
  const baseEnv = { ...process.env };
  const refused = spawnSync(process.execPath, [tsx, SCRIPT], {
    cwd: REPO, encoding: "utf8",
    env: { ...baseEnv, FIRESTORE_EMULATOR_HOST: "", ALLOW_PRODUCTION: "", FIREBASE_SERVICE_ACCOUNT_KEY: "" },
  });
  const badArg = spawnSync(process.execPath, [tsx, SCRIPT, "--apply"], { cwd: REPO, encoding: "utf8", env: baseEnv });
  record("X8 CLI refuses (exit 2) without the emulator or ALLOW_PRODUCTION=yes, and refuses any argument but --json",
    refused.status === 2 && /REFUSING TO RUN/.test(refused.stderr) && !refused.stdout.includes("o_gone") &&
      badArg.status === 2 && /only option is --json/.test(badArg.stderr),
    `noEnv=${refused.status} badArg=${badArg.status}`);

  const cli = spawnSync(process.execPath, [tsx, SCRIPT, "--json"], { cwd: REPO, encoding: "utf8", env: baseEnv, maxBuffer: 16 * 1024 * 1024 });
  let cliReport: any = null;
  try { cliReport = JSON.parse(cli.stdout); } catch {}
  const afterCli = await snapshotAll();
  record("X9 CLI --json under the emulator prints the same findings and still writes nothing",
    cli.status === 0 && cliReport?.readOnly === true && JSON.stringify(cliReport?.missingOrderIds) === JSON.stringify(expectedMissing) &&
      cliReport?.totals?.orphanReferences === 20 && afterCli === before,
    `exit=${cli.status} ${cli.status !== 0 ? cli.stderr.slice(0, 300) : ""}`);

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((error) => {
  console.error("reconciliation harness crashed:", error);
  process.exit(3);
});
