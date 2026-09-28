/*
 * YOMICO Rewards — eligibility foundation (users/{uid}.rewardsEligibleAt).
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Never touches production and never reads the real service account (a
 * throwaway key is generated). Covers:
 *   A referral-only customer stays ineligible (1,000 points, referral grant)
 *   B first qualifying purchase: points + stamp in ONE transaction
 *   C replay changes nothing
 *   D concurrent qualifying credits -> exactly one stamp, first committed wins
 *   E an already-eligible customer keeps the original stamp
 *   F non-qualifying orders never stamp
 *   G client-supplied fields cannot create eligibility
 *   H a failed ledger write rolls the stamp back with the balance
 *   J the legacy backfill: report-only, earliest order, never overwrites,
 *     idempotent, touches nothing but the two fields
 * Rules (customer/admin cannot write the stamp) live in
 * scripts/test/points-ledger/rules.test.mts.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json scripts/test/rewards-eligibility/run.mts"
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
    type: "service_account", project_id: PROJECT_ID, private_key_id: "test-key-id", private_key: privateKey,
    client_email: `test@${PROJECT_ID}.iam.gserviceaccount.com`, client_id: "000000000000000000000",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}
process.env.GCLOUD_PROJECT = PROJECT_ID;
delete process.env.RESEND_API_KEY;
delete process.env.GEMINI_API_KEY;

// Fake Identity Toolkit: token "test:<uid>:<email>:<emailVerified>". Every
// account "was created" at harness start (so referral profiles are new).
const HARNESS_START = Date.now();
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url ?? "";
  if (url.includes("identitytoolkit") && url.includes("accounts:lookup")) {
    let idToken = "";
    try { idToken = JSON.parse(init?.body ?? "{}").idToken ?? ""; } catch {}
    const parts = idToken.split(":");
    if (parts[0] !== "test" || !parts[1]) return new Response(JSON.stringify({ error: "invalid" }), { status: 400 });
    return new Response(JSON.stringify({ users: [{
      localId: parts[1], email: parts[2] || null, emailVerified: parts[3] === "true", createdAt: String(HARNESS_START),
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.includes("api.resend.com") || url.includes("generativelanguage")) throw new Error("TEST HARNESS: external call attempted");
  return realFetch(input, init);
}) as typeof fetch;

const { getAdminDb } = await import("../../../lib/firebaseAdmin.ts");
const { creditOneOrder } = await import("../../../lib/rewardCreditServer.ts");
const { POST: creditRoute } = await import("../../../app/api/credit-reward-points/route.ts");
const { POST: signupRewards } = await import("../../../app/api/signup-rewards/route.ts");
const { GET: walletRoute } = await import("../../../app/api/account/wallet/route.ts");
const { GET: summaryRoute } = await import("../../../app/api/account/summary/route.ts");
const { isRewardsEligible } = await import("../../../lib/rewards/eligibility.ts");
const { runRewardsEligibilityBackfill } = await import("../../../scripts/migrations/rewards-eligibility-backfill.ts");
const { Timestamp } = await import("firebase-admin/firestore");

const db = getAdminDb();

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const COLLECTIONS = ["orders", "users", "rewardTransactions", "itemRequests", "returns", "rateLimits", "notifications", "addresses", "counters", "productReviews"];
async function clearAll() { for (const c of COLLECTIONS) await db.recursiveDelete(db.collection(c)); }

function post(url: string, body: unknown, uid: string, verified = true) {
  return new Request(url, {
    method: "POST",
    headers: { authorization: `Bearer test:${uid}:${uid}@example.com:${verified}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
function get(url: string, uid: string) {
  return new Request(url, { method: "GET", headers: { authorization: `Bearer test:${uid}:${uid}@example.com:true` } });
}
async function json(res: Response): Promise<any> { return res.json().catch(() => ({})); }

const daysAgo = (n: number) => Timestamp.fromMillis(Date.now() - n * 86400000);
const user = async (uid: string) => ((await db.collection("users").doc(uid).get()).data() || null) as any;
const stampOf = async (uid: string) => {
  const u = await user(uid);
  return { at: u?.rewardsEligibleAt ?? null, orderId: u?.rewardsEligibleOrderId ?? null, hasAt: !!u && "rewardsEligibleAt" in u, hasId: !!u && "rewardsEligibleOrderId" in u };
};
const setUser = (uid: string, data: Record<string, unknown> = {}) =>
  db.collection("users").doc(uid).set({ uid, role: "customer", email: `${uid}@example.com`, rewardPoints: 0, ...data });
async function order(id: string, uid: string, finalTotal: number, extra: Record<string, unknown> = {}) {
  await db.collection("orders").doc(id).set({
    userId: uid, userEmail: `${uid}@example.com`, status: "Delivered", paymentStatus: "Paid",
    rewardPointsStatus: "pending", finalTotal, deliveredAt: daysAgo(10), createdAt: daysAgo(12), ...extra,
  });
}
const credit = (orderId: string) => creditOneOrder(orderId, { uid: null, isAdmin: true });
const noStamp = async (uid: string) => { const s = await stampOf(uid); return !s.hasAt && !s.hasId; };

async function main() {
  await clearAll();

  // ============ A. referral-only customer ============
  {
    await setUser("ref_R", { rewardPoints: 20, referralCode: "YOGI700001", totalReferrals: 0 });
    await setUser("ref_new", { referredBy: "YOGI700001" });
    const granted = await json(await signupRewards(post("http://x/api/signup-rewards", {}, "ref_new")));
    await db.collection("users").doc("ref_R").update({ rewardPoints: 1000 });
    const R = await user("ref_R");
    const wallet = await json(await walletRoute(get("http://x/api/account/wallet?rewardsEligible=true&uid=someone", "ref_R")));
    record("A1 referral-only: referral grant pays both sides but stamps NEITHER; a 1,000-point referrer is not eligible",
      granted.result === "granted" && (await user("ref_new")).rewardPoints === 50 && R.rewardPoints === 1000 &&
        (await noStamp("ref_R")) && (await noStamp("ref_new")) && isRewardsEligible(R) === false &&
        wallet.rewardsEligible === false && wallet.rewardsEligibleAt === null,
      `grant=${granted.result} wallet.rewardsEligible=${wallet.rewardsEligible}`);
  }

  // ============ B. first qualifying purchase ============
  {
    await setUser("buyer_1", { rewardPoints: 7 });
    await order("o_b1", "buyer_1", 1234);
    const out = await credit("o_b1");
    const u = await user("buyer_1");
    const o = (await db.collection("orders").doc("o_b1").get()).data() as any;
    const row = (await db.collection("rewardTransactions").doc("earned_o_b1").get()).data() as any;
    const wallet = await json(await walletRoute(get("http://x/api/account/wallet", "buyer_1")));
    const summary = await json(await summaryRoute(get("http://x/api/account/summary", "buyer_1")));
    record("B1 first qualifying purchase: +12 points, earned row AND rewardsEligibleAt/OrderId set in the same credit (stamp == rewardPointsCreditedAt)",
      out.credited === true && u.rewardPoints === 19 && row?.delta === 12 &&
        u.rewardsEligibleOrderId === "o_b1" && u.rewardsEligibleAt?.isEqual?.(o.rewardPointsCreditedAt) === true && isRewardsEligible(u),
      `points=${u.rewardPoints} stampOrder=${u.rewardsEligibleOrderId}`);
    record("B2 wallet and account summary expose the server-derived state (rewardsEligible true, rewardsEligibleAt ISO)",
      wallet.rewardsEligible === true && wallet.rewardsEligibleAt === u.rewardsEligibleAt.toDate().toISOString() && summary?.rewards?.rewardsEligible === true,
      `wallet=${wallet.rewardsEligible}/${wallet.rewardsEligibleAt} summary=${summary?.rewards?.rewardsEligible}`);

    // ============ C. replay ============
    const before = await stampOf("buyer_1");
    const replay = await credit("o_b1");
    const after = await stampOf("buyer_1");
    record("C1 replaying the qualifying credit changes nothing (already-credited; same stamp, same order)",
      replay.credited === false && (replay as any).reason === "already-credited" &&
        after.orderId === before.orderId && after.at?.isEqual?.(before.at) === true && (await user("buyer_1")).rewardPoints === 19,
      JSON.stringify(replay));

    // ============ E. already eligible ============
    await order("o_b2", "buyer_1", 3000, { deliveredAt: daysAgo(9) });
    const second = await credit("o_b2");
    const after2 = await stampOf("buyer_1");
    record("E1 a second qualifying purchase credits points but KEEPS the original rewardsEligibleAt and order",
      second.credited === true && (await user("buyer_1")).rewardPoints === 49 &&
        after2.orderId === "o_b1" && after2.at?.isEqual?.(before.at) === true,
      `stampOrder=${after2.orderId}`);
  }

  // ============ D. concurrent qualifying credits ============
  {
    await setUser("buyer_par", { rewardPoints: 0 });
    const ids = ["o_p1", "o_p2", "o_p3", "o_p4", "o_p5"];
    for (const id of ids) await order(id, "buyer_par", 1000);
    const outs = await Promise.all(ids.map((id) => credit(id)));
    const u = await user("buyer_par");
    const creditedAt = new Map<string, any>();
    for (const id of ids) creditedAt.set(id, ((await db.collection("orders").doc(id).get()).data() as any).rewardPointsCreditedAt);
    const winner = u.rewardsEligibleOrderId;
    const earliest = [...creditedAt.values()].every((t) => u.rewardsEligibleAt.toMillis() <= t.toMillis());
    record("D1 5 concurrent qualifying credits: all credited (+50), exactly one stamp, naming one of them, at its own credit time — the first committed",
      outs.every((o) => o.credited) && u.rewardPoints === 50 && ids.includes(winner) &&
        u.rewardsEligibleAt.isEqual(creditedAt.get(winner)) && earliest,
      `winner=${winner} points=${u.rewardPoints}`);
  }

  // ============ F. non-qualifying orders ============
  {
    const cases: [string, number, Record<string, unknown>, (() => Promise<void>)?][] = [
      ["not delivered", 1000, { status: "Shipped" }],
      ["unpaid (COD awaiting verification)", 1000, { paymentStatus: "AwaitingVerification" }],
      ["return window not completed", 1000, { deliveredAt: daysAgo(2) }],
      ["unknown return-window date", 1000, { deliveredAt: null }],
      ["open old-style return", 1000, {}, async () => {
        await db.collection("returns").doc("nq_oldret_o_nq_oldret").set({ userId: "nq_oldret", orderId: "o_nq_oldret", status: "Pending", refundAmount: 1000 });
      }],
      ["open item-level return", 1000, {}, async () => {
        await db.collection("itemRequests").doc("ir_nq_open").set({ userId: "nq_itemret", orderId: "o_nq_itemret", type: "return", status: "REQUESTED", refund: { amount: 500 } });
      }],
      ["fully refunded", 1000, {}, async () => {
        await db.collection("itemRequests").doc("ir_nq_full").set({ userId: "nq_refunded", orderId: "o_nq_refunded", type: "return", status: "REFUNDED", refund: { amount: 1000, credited: true } });
      }],
      ["under ₹100", 99, {}],
      ["below ₹100 after refunds (150 − 60)", 150, {}, async () => {
        await db.collection("itemRequests").doc("ir_nq_part").set({ userId: "nq_partial", orderId: "o_nq_partial", type: "return", status: "REFUNDED", refund: { amount: 60, credited: true } });
      }],
    ];
    const uidFor = ["nq_notdel", "nq_unpaid", "nq_window", "nq_unknown", "nq_oldret", "nq_itemret", "nq_refunded", "nq_small", "nq_partial"];
    const outcomes: string[] = [];
    let allClean = true;
    for (let i = 0; i < cases.length; i++) {
      const [label, total, extra, setup] = cases[i];
      const uid = uidFor[i];
      await setUser(uid);
      await order(`o_${uid}`, uid, total, extra);
      if (setup) await setup();
      const out = await credit(`o_${uid}`);
      const clean = out.credited === false && (await noStamp(uid)) && (await user(uid)).rewardPoints === 0;
      if (!clean) allClean = false;
      outcomes.push(`${label}:${(out as any).reason}${clean ? "" : "(STAMPED/CREDITED!)"}`);
    }
    record("F1 no eligibility (and no points) for: not delivered, unpaid, window open, window unknown, open old-style return, open item return, fully refunded, under ₹100, below ₹100 after refunds",
      allClean, outcomes.join("; "));
  }

  // ============ G. client spoofing ============
  {
    await setUser("spoof_1", { rewardPoints: 1000 });
    await order("o_spoof_open", "spoof_1", 1000, { deliveredAt: daysAgo(1) });   // not yet qualifying
    await setUser("victim_1");
    await order("o_victim", "victim_1", 1000);                                  // qualifying, but not spoof_1's
    const spoof = {
      uid: "victim_1", email: "victim_1@example.com", points: 5000, rewardValue: 5000,
      rewardsEligible: true, rewardsEligibleAt: new Date().toISOString(), rewardsEligibleOrderId: "o_victim",
    };
    const own = await json(await creditRoute(post("http://x/api/credit-reward-points", { ...spoof, orderId: "o_spoof_open" }, "spoof_1")));
    const other = await json(await creditRoute(post("http://x/api/credit-reward-points", { ...spoof, orderId: "o_victim" }, "spoof_1")));
    const sweep = await json(await creditRoute(post("http://x/api/credit-reward-points", spoof, "spoof_1")));
    const ref = await json(await signupRewards(post("http://x/api/signup-rewards", spoof, "spoof_1")));
    const wallet = await json(await walletRoute(get("http://x/api/account/wallet?rewardsEligible=true&rewardsEligibleAt=2020-01-01&uid=victim_1", "spoof_1")));
    record("G1 uid/email/points/rewardValue/rewardsEligible/rewardsEligibleAt/rewardsEligibleOrderId in requests create no eligibility (own non-qualifying order, another customer's order, sweep, referral route, wallet query)",
      own.credited === 0 && other.credited === 0 && other.results?.[0]?.reason === "not-found" && sweep.credited === 0 && ref.success === true &&
        (await noStamp("spoof_1")) && (await noStamp("victim_1")) && (await user("spoof_1")).rewardPoints === 1000 && wallet.rewardsEligible === false,
      `own=${own.credited} other=${other.results?.[0]?.reason} sweep=${sweep.credited} wallet=${wallet.rewardsEligible}`);
  }

  // ============ H. rollback ============
  {
    await setUser("rb_1", { rewardPoints: 3 });
    await order("o_rb", "rb_1", 1000);
    await db.collection("rewardTransactions").doc("earned_o_rb").set({ userId: "someone_else", type: "Earned", points: 1 });
    let err = "";
    try { await credit("o_rb"); } catch (e) { err = String((e as Error).message).slice(0, 50); }
    const row = (await db.collection("rewardTransactions").doc("earned_o_rb").get()).data() as any;
    const o = (await db.collection("orders").doc("o_rb").get()).data() as any;
    record("H1 ledger write cannot complete -> whole credit rolls back: balance 3, seeded ledger row untouched, NO eligibility stamp, order still pending",
      !!err && (await user("rb_1")).rewardPoints === 3 && row.userId === "someone_else" && row.points === 1 &&
        (await noStamp("rb_1")) && o.rewardPointsStatus === "pending",
      `error="${err}"`);
  }

  // ============ J. legacy backfill ============
  {
    await clearAll();
    const legacyOrder = (id: string, uid: string, total: number, extra: Record<string, unknown> = {}) =>
      db.collection("orders").doc(id).set({ userId: uid, status: "Delivered", paymentStatus: "Paid", finalTotal: total, deliveredAt: daysAgo(40), ...extra });
    // Two credited orders: the earliest credit wins.
    await setUser("bf_cred", { rewardPoints: 30 });
    await order("o_cred_late", "bf_cred", 1000, { rewardPointsStatus: "credited", rewardPointsCreditedAt: daysAgo(5) });
    await order("o_cred_early", "bf_cred", 2000, { rewardPointsStatus: "credited", rewardPointsCreditedAt: daysAgo(20) });
    // A legacy order (no rewardPointsStatus) that meets the rule, and legacy ones that do not.
    await setUser("bf_legacy", { rewardPoints: 5 });
    await legacyOrder("o_legacy_ok", "bf_legacy", 500);
    await setUser("bf_unpaid"); await legacyOrder("o_legacy_unpaid", "bf_unpaid", 500, { paymentStatus: "Pending" });
    await setUser("bf_small"); await legacyOrder("o_legacy_small", "bf_small", 80);
    await setUser("bf_refunded"); await legacyOrder("o_legacy_ref", "bf_refunded", 500);
    await db.collection("returns").doc("bf_refunded_o_legacy_ref").set({ userId: "bf_refunded", orderId: "o_legacy_ref", status: "Refunded", refundAmount: 500 });
    await setUser("bf_open"); await legacyOrder("o_legacy_open", "bf_open", 500);
    await db.collection("returns").doc("bf_open_o_legacy_open").set({ userId: "bf_open", orderId: "o_legacy_open", status: "Pending", refundAmount: 500 });
    // A pending order ready for credit: reported, left to the live credit run.
    await setUser("bf_pending"); await order("o_pending_ready", "bf_pending", 1000);
    // Already stamped: never overwritten, even though an older order exists.
    const originalAt = daysAgo(2);
    await setUser("bf_stamped", { rewardPoints: 10, rewardsEligibleAt: originalAt, rewardsEligibleOrderId: "o_orig" });
    await order("o_stamped_old", "bf_stamped", 1000, { rewardPointsStatus: "credited", rewardPointsCreditedAt: daysAgo(60) });
    // Referral-only, and an order whose owner has no profile.
    await setUser("bf_referral", { rewardPoints: 1000, referralCode: "YOGI700009", totalReferrals: 7 });
    await legacyOrder("o_ghost", "bf_ghost", 900);
    await db.collection("orders").doc("o_no_owner").set({ status: "Delivered", paymentStatus: "Paid", finalTotal: 900, deliveredAt: daysAgo(40) });
    await db.collection("rewardTransactions").doc("earned_o_cred_early").set({ userId: "bf_cred", type: "Earned", points: 20 });

    const snapshotAll = async () => {
      const out: Record<string, unknown> = {};
      for (const c of ["users", "orders", "rewardTransactions", "returns", "itemRequests"]) {
        const s = await db.collection(c).get();
        out[c] = s.docs.map((d) => [d.id, d.data()]).sort();
      }
      return JSON.stringify(out);
    };
    const withoutStamps = (snap: string) => {
      const parsed = JSON.parse(snap);
      parsed.users = parsed.users.map(([id, d]: [string, any]) => {
        const { rewardsEligibleAt, rewardsEligibleOrderId, ...rest } = d;
        return [id, id === "bf_stamped" ? d : rest];
      });
      return JSON.stringify(parsed);
    };

    const s0 = await snapshotAll();
    const dry = await runRewardsEligibilityBackfill(false);
    const s1 = await snapshotAll();
    const rowOf = (uid: string) => dry.rows.find((r: any) => r.uid === uid);
    const credRow = rowOf("bf_cred");
    const legacyRow = rowOf("bf_legacy");
    record("J1 report-only mode writes NOTHING and lists the earliest qualifying order, its time and the current state",
      s0 === s1 && dry.written === 0 && dry.mode === "DRY-RUN" &&
        credRow?.orderId === "o_cred_early" && credRow?.source === "credited" && credRow?.action === "stamp" && credRow?.currentState === "not-eligible" &&
        legacyRow?.orderId === "o_legacy_ok" && legacyRow?.source === "legacy" &&
        rowOf("bf_stamped")?.action === "keep-existing" && rowOf("bf_ghost")?.action === "skip-no-profile" &&
        !rowOf("bf_unpaid") && !rowOf("bf_small") && !rowOf("bf_refunded") && !rowOf("bf_open") && !rowOf("bf_referral") && !rowOf("bf_pending") &&
        dry.summary.awaitingLiveCredit === 1 && dry.summary.ordersWithoutOwner === 1,
      JSON.stringify(dry.summary));

    const wet = await runRewardsEligibilityBackfill(true);
    const s2 = await snapshotAll();
    const cred = await user("bf_cred");
    const credEarly = (await db.collection("orders").doc("o_cred_early").get()).data() as any;
    const legacy = await user("bf_legacy");
    const stamped = await user("bf_stamped");
    record("J2 apply stamps only qualifying customers (earliest order; credited keeps its exact credit time; legacy = window close), never overwrites, never creates a profile",
      wet.written === 2 && cred.rewardsEligibleOrderId === "o_cred_early" && cred.rewardsEligibleAt.isEqual(credEarly.rewardPointsCreditedAt) &&
        legacy.rewardsEligibleOrderId === "o_legacy_ok" && isRewardsEligible(legacy) &&
        stamped.rewardsEligibleOrderId === "o_orig" && stamped.rewardsEligibleAt.isEqual(originalAt) &&
        !(await db.collection("users").doc("bf_ghost").get()).exists &&
        (await noStamp("bf_unpaid")) && (await noStamp("bf_small")) && (await noStamp("bf_refunded")) && (await noStamp("bf_open")) &&
        (await noStamp("bf_referral")) && (await noStamp("bf_pending")),
      `written=${wet.written}`);
    record("J3 apply changes ONLY the two eligibility fields — balances, ledger, orders, returns and item requests are identical",
      withoutStamps(s2) === withoutStamps(s0), "");

    const again = await runRewardsEligibilityBackfill(true);
    const s3 = await snapshotAll();
    record("J4 re-running apply is idempotent: 0 written, nothing changes",
      again.written === 0 && s3 === s2 && again.summary.toStamp === 0, `written=${again.written}`);
  }

  const passed = results.filter((r) => r.pass).length;
  console.log(`\n${passed}/${results.length} passed`);
  for (const r of results.filter((x) => !x.pass)) console.log(`  FAILED: ${r.name}`);
  process.exit(passed === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error("HARNESS ERROR:", e);
  process.exit(3);
});
