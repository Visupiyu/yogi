import crypto from "crypto";
import { FieldPath } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  creditOneOrder,
  type CreditResult,
} from "@/lib/rewardCreditServer";

// ---------------------------------------------------------------------------
// Scheduled sweep that actually pays out deferred reward points.
//
// Reward points are granted only once an order is delivered, paid for and past
// its 7-day return window. Nothing about that is time-triggered by the
// customer, so without this job an order that becomes eligible on day 8 would
// simply never be credited unless the customer happened to open the app.
//
// This route decides NOTHING about eligibility. It finds candidate orders and
// hands each one to creditOneOrder() in lib/rewardCreditServer.ts — the same
// function app/api/credit-reward-points uses — which re-reads the order and
// its return document inside a transaction and applies lib/rewardCredit.ts's
// rule. There is exactly one credit implementation and one eligibility rule.
// ---------------------------------------------------------------------------

// Vercel Cron invokes scheduled routes with GET.
export const dynamic = "force-dynamic";

// The sweep is a sequence of one transaction per order, so it needs longer
// than the default. Vercel caps this by plan (60s on Pro); the internal budget
// below stops well short so the response is always written.
export const maxDuration = 60;

// Orders are examined in pages rather than one big read, so that a backlog of
// still-in-window orders cannot crowd out the eligible ones behind them.
const PAGE_SIZE = 100;

// Hard ceiling on work per run. A backlog larger than this is simply picked up
// by the next run — every run is safe to repeat and makes forward progress,
// because a credited order leaves the candidate query permanently.
const MAX_ORDERS_PER_RUN = 1000;

// Leaves headroom under maxDuration to serialise and return the summary.
const TIME_BUDGET_MS = 45_000;

/**
 * Constant-time secret comparison, following lib/razorpayVerify.ts's
 * verifyRazorpayWebhookSignature() — length first, because timingSafeEqual
 * throws on a length mismatch.
 */
function secretMatches(provided: string, expected: string): boolean {
  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Vercel Cron sends `Authorization: Bearer $CRON_SECRET` automatically when
 * CRON_SECRET is set on the project. Without a configured secret the endpoint
 * refuses every request rather than defaulting to open — an unprotected
 * money-moving endpoint is worse than a job that does not run.
 */
function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET;
  if (!expected) return false;

  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer (.+)$/);
  if (!match) return false;

  return secretMatches(match[1], expected);
}

async function runSweep() {
  const db = getAdminDb();
  const startedAt = Date.now();

  let examined = 0;
  let credited = 0;
  let points = 0;
  let failed = 0;
  const reasons: Record<string, number> = {};
  let cursor: string | null = null;
  let exhausted = false;

  while (examined < MAX_ORDERS_PER_RUN) {
    if (Date.now() - startedAt > TIME_BUDGET_MS) break;

    // Candidates only. Both filters are cheap indexed equalities, and every
    // one of them is still fully re-verified inside creditOneOrder's
    // transaction — this query is a narrowing device, never the decision.
    //
    // Ordered by document id purely to give the cursor a stable key.
    let query = db
      .collection("orders")
      .where("rewardPointsStatus", "==", "pending")
      .where("status", "==", "Delivered")
      .orderBy(FieldPath.documentId())
      .limit(PAGE_SIZE);

    if (cursor) query = query.startAfter(cursor);

    const page = await query.get();

    if (page.empty) {
      exhausted = true;
      break;
    }

    for (const doc of page.docs) {
      examined++;

      try {
        // { uid: null, isAdmin: true } — the sweep runs as the system and owns
        // no account, so the ownership check is bypassed. Eligibility is not.
        const result: CreditResult = await creditOneOrder(doc.id, {
          uid: null,
          isAdmin: true,
        });

        if (result.credited) {
          credited++;
          points += result.points;
        } else {
          reasons[result.reason] = (reasons[result.reason] || 0) + 1;
        }
      } catch (error) {
        // One bad order must never abort the sweep — the rest of the backlog
        // still deserves to be paid out, and this order is retried next run.
        failed++;
        console.error("cron/credit-reward-points: order failed:", doc.id, error);
      }
    }

    cursor = page.docs[page.docs.length - 1].id;

    if (page.size < PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }

  return {
    examined,
    credited,
    points,
    failed,
    // Ineligible counts, by reason — "return-window-open" dominating is the
    // healthy steady state; "return-window-unknown" accumulating means orders
    // are being marked Delivered without a usable date and need an admin.
    skipped: reasons,
    exhausted,
    durationMs: Date.now() - startedAt,
  };
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return Response.json({ error: "Not authorized." }, { status: 401 });
  }

  try {
    const summary = await runSweep();
    console.log("cron/credit-reward-points:", JSON.stringify(summary));
    return Response.json({ success: true, ...summary });
  } catch (error) {
    console.error("cron/credit-reward-points failed:", error);
    return Response.json(
      { error: "Reward point sweep failed." },
      { status: 500 }
    );
  }
}

// Same handler under POST, so the job can be triggered manually with curl (or
// by an external scheduler) using the identical secret. Safe to repeat.
export async function POST(request: Request) {
  return GET(request);
}
