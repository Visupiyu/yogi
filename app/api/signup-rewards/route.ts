import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import {
  REFERRAL_MONTHLY_CAP,
  REFERRER_BONUS,
  WELCOME_BONUS,
  generateReferralCode,
  isWellFormedReferralCode,
  paidReferralsThisMonth,
  referrerLedgerId,
  welcomeLedgerId,
} from "@/lib/referrals";

// ---------------------------------------------------------------------------
// Referral code + signup referral bonus. SERVER-AUTHORITATIVE.
//
// rewardPoints is money — it is the checkout discount currency AND the refund
// currency — so firestore.rules let no client write it, and (since this
// hardening) no client can write the referral state either: referralCode,
// referredBy (after profile creation) and signupRewardsGrantedAt are frozen
// for the owner. Before that, deleting signupRewardsGrantedAt re-armed this
// route and minted points on every call.
//
// Called by the signup page (right after the profile is created) and by the
// login page (so a referral that was waiting for email verification, or for
// the referrer's monthly cap, is paid on a later visit). It:
//   1. issues the caller's own referral code if they have none (server-issued,
//      unique; an existing code never changes);
//   2. pays the signup referral bonus (lib/referrals — amounts unchanged) when
//      the profile records a valid referrer, the caller's email is verified,
//      and the referrer is under this month's cap. Otherwise it reports why
//      and leaves the referral eligible for a later call.
//
// Idempotent on the fixed-id ledger rows rewardTransactions/referral_{uid} and
// referrer_{uid}, which only the server can write, plus the (now frozen)
// signupRewardsGrantedAt stamp that settled accounts already carry.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CODE_ATTEMPTS = 6;

type GrantResult =
  | "granted"
  | "already"
  | "no-referral"
  | "pending-verification"
  | "deferred"
  | "needs-review";

type Outcome =
  | { kind: "ok"; result: GrantResult; referralCode: string | null }
  | { kind: "error"; status: number; error: string };

function millis(v: unknown): number | null {
  const ms = (v as { toMillis?: () => number } | null)?.toMillis?.();
  return typeof ms === "number" && Number.isFinite(ms) ? ms : null;
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinRateLimit("signup-rewards", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(requester.uid);
    const welcomeRef = db.collection("rewardTransactions").doc(welcomeLedgerId(requester.uid));
    const referrerRowRef = db.collection("rewardTransactions").doc(referrerLedgerId(requester.uid));
    const nowMs = Date.now();

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      // ---- READS FIRST ----
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) return { kind: "error", status: 404, error: "Profile not found." };
      const user = userSnap.data() as {
        referralCode?: unknown;
        referredBy?: unknown;
        email?: unknown;
        signupRewardsGrantedAt?: unknown;
      };
      const welcomeSnap = await tx.get(welcomeRef);

      // 1. The caller's own referral code — issued once, never changed.
      let referralCode = isWellFormedReferralCode(user.referralCode) ? user.referralCode : null;
      let issuedCode: string | null = null;
      if (!referralCode) {
        for (let i = 0; i < CODE_ATTEMPTS && !issuedCode; i++) {
          const candidate = generateReferralCode();
          const taken = await tx.get(db.collection("users").where("referralCode", "==", candidate).limit(1));
          if (taken.empty) issuedCode = candidate;
        }
        referralCode = issuedCode;
      }

      // 2. The signup referral bonus.
      const userUpdate: Record<string, unknown> = {};
      if (issuedCode) userUpdate.referralCode = issuedCode;

      const settled = welcomeSnap.exists || Boolean(user.signupRewardsGrantedAt);
      const code = typeof user.referredBy === "string" ? user.referredBy.trim() : "";

      let result: GrantResult;
      let pay: { referrerRef: DocumentReference; referrerEmail: string | null } | null = null;

      if (settled) {
        result = "already";
      } else if (!code) {
        result = "no-referral";
      } else {
        const referrerSnap = await tx.get(db.collection("users").where("referralCode", "==", code).limit(2));
        if (referrerSnap.empty) {
          // Unknown code: settle it so it isn't retried forever; nothing paid.
          userUpdate.signupRewardsGrantedAt = Timestamp.fromMillis(nowMs);
          result = "no-referral";
        } else if (referrerSnap.size > 1) {
          // Two accounts claim this code — paying either could reward a
          // hijacked code. Left unsettled for an admin to resolve.
          result = "needs-review";
        } else if (referrerSnap.docs[0].id === requester.uid) {
          // Self-referral pays nothing.
          userUpdate.signupRewardsGrantedAt = Timestamp.fromMillis(nowMs);
          result = "no-referral";
        } else if (!requester.emailVerified) {
          result = "pending-verification";
        } else {
          const referrerDoc = referrerSnap.docs[0];
          const rows = await tx.get(db.collection("rewardTransactions").where("userId", "==", referrerDoc.id));
          const paid = paidReferralsThisMonth(
            rows.docs.map((d) => ({ id: d.id, createdAtMs: millis(d.get("createdAt")) })),
            nowMs
          );
          if (paid >= REFERRAL_MONTHLY_CAP) {
            result = "deferred";
          } else {
            const email = referrerDoc.get("email");
            pay = { referrerRef: referrerDoc.ref, referrerEmail: typeof email === "string" ? email : null };
            result = "granted";
          }
        }
      }

      // ---- WRITES ----
      const now = Timestamp.fromMillis(nowMs);
      if (pay) {
        tx.update(pay.referrerRef, {
          rewardPoints: FieldValue.increment(REFERRER_BONUS),
          totalReferrals: FieldValue.increment(1),
        });
        userUpdate.rewardPoints = FieldValue.increment(WELCOME_BONUS);
        userUpdate.signupRewardsGrantedAt = now;
        // create(), not set(): if either row somehow exists the whole
        // transaction fails rather than paying twice.
        tx.create(welcomeRef, {
          userId: requester.uid,
          userEmail: requester.email || (typeof user.email === "string" ? user.email : null),
          points: WELCOME_BONUS,
          type: "Referral Bonus",
          createdAt: now,
        });
        tx.create(referrerRowRef, {
          userId: pay.referrerRef.id,
          userEmail: pay.referrerEmail,
          points: REFERRER_BONUS,
          type: "Referral Bonus",
          createdAt: now,
        });
      }
      if (Object.keys(userUpdate).length > 0) tx.update(userRef, userUpdate);

      return { kind: "ok", result, referralCode };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }
    return Response.json({ success: true, result: outcome.result, referralCode: outcome.referralCode });
  } catch (error) {
    console.error("signup-rewards: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
