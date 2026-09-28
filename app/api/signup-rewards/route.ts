import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { FieldValue, Timestamp, type DocumentSnapshot } from "firebase-admin/firestore";
import {
  REFERRER_BONUS,
  WELCOME_BONUS,
  generateReferralCode,
  isNewCustomerProfile,
  isWellFormedReferralCode,
  referrerLedgerId,
  welcomeLedgerId,
} from "@/lib/referrals";
import { applyPointsMovements } from "@/lib/points/pointsLedger";

// ---------------------------------------------------------------------------
// Referral code + signup referral bonus. SERVER-AUTHORITATIVE.
//
// rewardPoints is money — it is the checkout discount currency AND the refund
// currency — so firestore.rules let no client write it, and no client can
// write the referral state either: referralCode, referredBy (after profile
// creation) and signupRewardsGrantedAt are frozen for the owner.
//
// Called by the signup page (right after the profile is created), the login
// page and the referrals page, so a referral waiting for email verification
// (or for an unblock) is paid on a later visit. It:
//   1. issues the caller's own referral code if they have none (server-issued,
//      unique; an existing code never changes);
//   2. pays the signup referral bonus (lib/referrals — amounts unchanged) when
//      the profile records a valid referrer. Direct referrals are UNLIMITED and
//      ONE LEVEL only: only the holder of the code is paid.
//
// Eligibility, in order:
//   settled already                     -> "already"
//   no code                             -> "no-referral"
//   unknown code                        -> settled, nothing paid ("no-referral")
//   code held by two accounts           -> "needs-review" (not settled)
//   self-referral                       -> settled, nothing paid ("no-referral")
//   referred customer OR referrer is
//     Blocked                           -> "blocked": neither paid, NOT settled,
//                                          so it can pay after an unblock
//   Auth creation time unknown          -> "needs-review" (fail closed, not settled)
//   not a genuinely new customer (the
//     profile was created > 30 minutes
//     after the Auth account)           -> "not-eligible": nothing paid, the
//                                          profile is not modified
//   email not verified                  -> "pending-verification"
//   otherwise                           -> "granted"
//
// A grant moves both balances through lib/points (atomic with their ledger
// rows) on the fixed ids rewardTransactions/referral_{uid} and
// referrer_{uid}, which only the server can write, plus the (frozen)
// signupRewardsGrantedAt stamp. All in one transaction.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CODE_ATTEMPTS = 6;

type GrantResult =
  | "granted"
  | "already"
  | "no-referral"
  | "pending-verification"
  | "blocked"
  | "not-eligible"
  | "needs-review";

type Outcome =
  | { kind: "ok"; result: GrantResult; referralCode: string | null }
  | { kind: "error"; status: number; error: string };

const isBlocked = (snap: DocumentSnapshot) => snap.exists && snap.get("status") === "Blocked";

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
      let referrer: DocumentSnapshot | null = null;

      if (settled) {
        result = "already";
      } else if (!code) {
        result = "no-referral";
      } else {
        const referrerSnap = await tx.get(db.collection("users").where("referralCode", "==", code).limit(2));
        const profileCreatedMs = userSnap.createTime?.toMillis() ?? null;
        const authCreatedMs = requester.createdAtMs ?? null;
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
        } else if (isBlocked(userSnap) || isBlocked(referrerSnap.docs[0])) {
          // Neither side is paid while either is blocked; not settled, so the
          // referral can still pay once both accounts are active.
          result = "blocked";
        } else if (authCreatedMs === null || profileCreatedMs === null) {
          // Fail closed: without both timestamps "new customer" cannot be shown.
          result = "needs-review";
        } else if (!isNewCustomerProfile(profileCreatedMs, authCreatedMs)) {
          // Not a genuinely new customer account: nothing paid, profile untouched.
          result = "not-eligible";
        } else if (!requester.emailVerified) {
          result = "pending-verification";
        } else {
          referrer = referrerSnap.docs[0];
          result = "granted";
        }
      }

      // ---- WRITES ----
      if (referrer) {
        const now = Timestamp.fromMillis(nowMs);
        userUpdate.signupRewardsGrantedAt = now;
        const referrerEmail = referrer.get("email");
        applyPointsMovements(
          tx,
          db,
          {
            ref: referrer.ref,
            snap: referrer,
            uid: referrer.id,
            email: typeof referrerEmail === "string" ? referrerEmail : null,
            write: "update",
            userFields: { totalReferrals: FieldValue.increment(1) },
          },
          [{ kind: "referral_referrer", id: referrerLedgerId(requester.uid), requested: REFERRER_BONUS }]
        );
        applyPointsMovements(
          tx,
          db,
          {
            ref: userRef,
            snap: userSnap,
            uid: requester.uid,
            email: requester.email || (typeof user.email === "string" ? user.email : null),
            write: "update",
            userFields: userUpdate,
          },
          [{ kind: "referral_welcome", id: welcomeLedgerId(requester.uid), requested: WELCOME_BONUS }]
        );
      } else if (Object.keys(userUpdate).length > 0) {
        tx.update(userRef, userUpdate);
      }

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
