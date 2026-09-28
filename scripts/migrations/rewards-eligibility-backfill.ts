/*
 * YOMICO Rewards — eligibility backfill (users/{uid}.rewardsEligibleAt).
 * ---------------------------------------------------------------------------
 * READ-ONLY by default. Reports every customer whose EXISTING orders already
 * prove a completed qualifying YOMICO purchase, the earliest such order, when
 * it qualified, and the customer's current eligibility state.
 *
 * Qualifying = the same rule lib/rewardCreditServer applies when it stamps
 * eligibility live (lib/rewardCredit.evaluateRewardCredit): Delivered, Paid,
 * return window closed (unknown window = not qualifying), no open old-style
 * or item-level return, and at least ₹100 left after refunds (>= 1 point).
 *   - an order already credited (rewardPointsStatus "credited") passed that
 *     rule when it was credited; it qualifies at rewardPointsCreditedAt;
 *   - a LEGACY order (no rewardPointsStatus — placed before deferred
 *     crediting) is evaluated with the same rule; it qualifies at the moment
 *     its return window closed;
 *   - a "pending" order that already meets the rule is reported only: the
 *     next credit run stamps it live, in its own transaction.
 *
 * With --apply-backfill it writes ONLY rewardsEligibleAt and
 * rewardsEligibleOrderId, and only on an EXISTING users/{uid} document that
 * has no stamp yet (re-checked inside a per-customer transaction). It never
 * overwrites a stamp, never creates a profile, and never touches points,
 * ledger rows, orders or any seller money. Re-running it is a no-op.
 *
 * Safety: refuses to run against anything but the local emulator unless
 * ALLOW_PRODUCTION=yes is set, and even then writes only with
 * --apply-backfill. Run the report first and review it before any write.
 *
 *   npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json \
 *     scripts/migrations/rewards-eligibility-backfill.ts [--apply-backfill] [--json]
 */
import { getAdminDb } from "../../lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import {
  evaluateRewardCredit,
  summariseItemReturns,
  type RewardCreditOrder,
  type RewardIneligibleReason,
} from "../../lib/rewardCredit";
import { returnWindowEndsAt } from "../../lib/returnEligibility";
import { returnIdFor } from "../../lib/rewardCreditServer";
import {
  REWARDS_ELIGIBLE_AT,
  REWARDS_ELIGIBLE_ORDER_ID,
  isRewardsEligible,
  rewardsEligibleAtMs,
} from "../../lib/rewards/eligibility";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply-backfill");
const JSON_OUT = args.has("--json");

if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.ALLOW_PRODUCTION !== "yes") {
  console.error("REFUSING TO RUN: not the local emulator. Set ALLOW_PRODUCTION=yes to run against a real project (read-only unless --apply-backfill).");
  process.exit(2);
}

type Doc = Record<string, unknown>;

export type BackfillRow = {
  uid: string;
  orderId: string;
  source: "credited" | "legacy";
  qualifyingAt: string;
  currentState: "eligible" | "not-eligible" | "no-profile";
  /** The stamp already on the profile, when there is one (never replaced). */
  existingOrderId: string | null;
  existingAt: string | null;
  action: "stamp" | "keep-existing" | "skip-no-profile";
};

function millis(v: unknown): number | null {
  const ms = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

export async function runRewardsEligibilityBackfill(apply: boolean, now: Date = new Date()) {
  const db = getAdminDb();
  const [users, orders, itemRequests, returns] = await Promise.all([
    db.collection("users").get(),
    db.collection("orders").get(),
    db.collection("itemRequests").get(),
    db.collection("returns").get(),
  ]);

  const userById = new Map<string, Doc>(users.docs.map((d) => [d.id, (d.data() || {}) as Doc]));
  const returnsById = new Map<string, Doc>(returns.docs.map((d) => [d.id, (d.data() || {}) as Doc]));
  const itemRequestsByOrder = new Map<string, Doc[]>();
  for (const d of itemRequests.docs) {
    const data = (d.data() || {}) as Doc;
    const oid = typeof data.orderId === "string" ? data.orderId : "";
    if (!oid) continue;
    itemRequestsByOrder.set(oid, [...(itemRequestsByOrder.get(oid) || []), data]);
  }

  // Earliest qualifying order per customer.
  const best = new Map<string, { orderId: string; source: "credited" | "legacy"; atMs: number; at: Timestamp }>();
  const awaitingCredit: { uid: string; orderId: string }[] = [];
  const legacyNotQualifying: Record<string, number> = {};
  let ordersWithoutOwner = 0;
  let creditedWithoutTime = 0;

  for (const o of orders.docs) {
    const order = (o.data() || {}) as RewardCreditOrder & Doc;
    const uid = typeof order.userId === "string" && order.userId ? order.userId : null;
    if (!uid) {
      ordersWithoutOwner++;
      continue;
    }

    let candidate: { source: "credited" | "legacy"; atMs: number; at: Timestamp } | null = null;
    if (order.rewardPointsStatus === "credited") {
      const atMs = millis(order.rewardPointsCreditedAt);
      if (atMs === null) creditedWithoutTime++;
      else candidate = { source: "credited", atMs, at: order.rewardPointsCreditedAt as Timestamp };
    } else {
      const legacy = order.rewardPointsStatus !== "pending";
      const legacyReturn = returnsById.get(returnIdFor(uid, o.id)) || null;
      const itemReturns = summariseItemReturns(
        (itemRequestsByOrder.get(o.id) || []).filter((r) => r.userId === uid) as never
      );
      // A legacy order has no rewardPointsStatus; evaluate it exactly as a
      // "pending" one would be. Every other condition is the live rule's.
      const verdict = evaluateRewardCredit(
        { ...order, rewardPointsStatus: "pending" },
        legacyReturn ? { status: legacyReturn.status } : null,
        now,
        itemReturns
      );
      if (verdict.eligible) {
        if (legacy) {
          const endsAt = returnWindowEndsAt(order);
          if (endsAt) candidate = { source: "legacy", atMs: endsAt.getTime(), at: Timestamp.fromDate(endsAt) };
        } else {
          awaitingCredit.push({ uid, orderId: o.id });
        }
      } else if (legacy) {
        const reason: RewardIneligibleReason = verdict.reason;
        legacyNotQualifying[reason] = (legacyNotQualifying[reason] || 0) + 1;
      }
    }

    if (!candidate) continue;
    const current = best.get(uid);
    if (!current || candidate.atMs < current.atMs || (candidate.atMs === current.atMs && o.id < current.orderId)) {
      best.set(uid, { orderId: o.id, ...candidate });
    }
  }

  const rows: BackfillRow[] = [...best.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([uid, q]) => {
      const user = userById.get(uid);
      const existingMs = user ? rewardsEligibleAtMs(user) : null;
      const currentState = !user ? "no-profile" : isRewardsEligible(user) ? "eligible" : "not-eligible";
      return {
        uid,
        orderId: q.orderId,
        source: q.source,
        qualifyingAt: new Date(q.atMs).toISOString(),
        currentState,
        existingOrderId: user && typeof user[REWARDS_ELIGIBLE_ORDER_ID] === "string" ? (user[REWARDS_ELIGIBLE_ORDER_ID] as string) : null,
        existingAt: existingMs === null ? null : new Date(existingMs).toISOString(),
        action: currentState === "no-profile" ? "skip-no-profile" : currentState === "eligible" ? "keep-existing" : "stamp",
      };
    });

  let written = 0;
  if (apply) {
    for (const row of rows.filter((r) => r.action === "stamp")) {
      const ref = db.collection("users").doc(row.uid);
      const stamped = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        // Re-checked under the transaction: a profile that disappeared or was
        // stamped (live credit, or a concurrent run) since the report is left alone.
        if (!snap.exists || isRewardsEligible(snap.data())) return false;
        tx.update(ref, {
          // The qualifying moment itself (a credited order keeps its exact
          // rewardPointsCreditedAt), not a re-parse of the report string.
          [REWARDS_ELIGIBLE_AT]: best.get(row.uid)!.at,
          [REWARDS_ELIGIBLE_ORDER_ID]: row.orderId,
        });
        return true;
      });
      if (stamped) written++;
    }
  }

  return {
    mode: apply ? "APPLY" : "DRY-RUN",
    rows,
    summary: {
      qualifyingCustomers: rows.length,
      toStamp: rows.filter((r) => r.action === "stamp").length,
      alreadyEligible: rows.filter((r) => r.action === "keep-existing").length,
      noProfile: rows.filter((r) => r.action === "skip-no-profile").length,
      awaitingLiveCredit: awaitingCredit.length,
      legacyNotQualifying,
      ordersWithoutOwner,
      creditedWithoutTime,
    },
    awaitingCredit,
    written,
  };
}

// Run only when executed directly (the tests import runRewardsEligibilityBackfill).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrations/rewards-eligibility-backfill.ts")) {
  runRewardsEligibilityBackfill(APPLY)
    .then((report) => {
      if (JSON_OUT) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`Rewards eligibility backfill — ${report.mode}`);
        console.log(`Summary: ${JSON.stringify(report.summary)}`);
        for (const r of report.rows) {
          console.log(`  ${r.uid}  order=${r.orderId} (${r.source}) qualifyingAt=${r.qualifyingAt}  state=${r.currentState}${r.existingOrderId ? ` existing=${r.existingOrderId}@${r.existingAt}` : ""}  -> ${r.action}`);
        }
        console.log(`Proposed writes (rewardsEligibleAt + rewardsEligibleOrderId only): ${report.summary.toStamp}`);
        console.log(`Written: ${report.written}`);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("rewards eligibility backfill failed:", error);
      process.exit(1);
    });
}
