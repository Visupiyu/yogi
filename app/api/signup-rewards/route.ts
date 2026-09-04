import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { FieldValue, Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Signup referral + welcome reward credit. SERVER-AUTHORITATIVE.
//
// rewardPoints is money — it is the checkout discount currency AND the refund
// currency, and lib/orderPricing.ts trusts the stored balance to grant a
// discount. firestore.rules therefore lets NO client write it; this Admin-SDK
// route is the only path that grants the signup bonuses.
//
// It replaces the browser writes app/signup/page.tsx used to make:
//   users/{referrer}  rewardPoints +100, totalReferrals +1
//   users/{newUser}   rewardPoints  +50
// plus their two rewardTransactions ledger rows. The amounts are unchanged —
// only who is trusted to write them.
//
// The referral code is NOT taken from the request body: it is read from the
// caller's own profile (`referredBy`, written when the profile was created),
// so the credited pair is always the one recorded on the account.
//
// Idempotent: the first successful grant stamps signupRewardsGrantedAt, and
// every later call returns already:true without crediting again — otherwise
// replaying this endpoint would mint points on every call.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/** Business rule, unchanged from the previous client implementation. */
const REFERRER_BONUS = 100;
const WELCOME_BONUS = 50;

type GrantOutcome =
  | { kind: "granted"; welcome: number; referrer: number }
  | { kind: "already" }
  | { kind: "no-referral" }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "signup-rewards",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    const db = getAdminDb();
    const userRef = db.collection("users").doc(requester.uid);

    const outcome = await db.runTransaction<GrantOutcome>(async (tx) => {
      // ---- READS FIRST ----
      const userSnap = await tx.get(userRef);
      if (!userSnap.exists) {
        return { kind: "error", status: 404, error: "Profile not found." };
      }

      const user = userSnap.data() as {
        referredBy?: unknown;
        userEmail?: unknown;
        email?: unknown;
        signupRewardsGrantedAt?: unknown;
      };

      // Already granted — never credit twice.
      if (user.signupRewardsGrantedAt) return { kind: "already" };

      const code =
        typeof user.referredBy === "string" ? user.referredBy.trim() : "";

      // No referral code on the profile: nothing to grant. The welcome bonus
      // has always been conditional on a valid referral (see the previous
      // client flow), so this is not a silent behaviour change.
      if (!code) return { kind: "no-referral" };

      const referrerSnap = await tx.get(
        db.collection("users").where("referralCode", "==", code).limit(1)
      );

      // Unknown code: mark as settled so a bad code can't be retried forever,
      // but credit nothing.
      if (referrerSnap.empty) {
        tx.update(userRef, { signupRewardsGrantedAt: Timestamp.now() });
        return { kind: "no-referral" };
      }

      const referrerDoc = referrerSnap.docs[0];

      // Self-referral pays nothing.
      if (referrerDoc.id === requester.uid) {
        tx.update(userRef, { signupRewardsGrantedAt: Timestamp.now() });
        return { kind: "no-referral" };
      }

      const now = Timestamp.now();
      const email =
        typeof user.email === "string" ? user.email : requester.email || "";

      // ---- WRITES ----
      tx.update(referrerDoc.ref, {
        rewardPoints: FieldValue.increment(REFERRER_BONUS),
        totalReferrals: FieldValue.increment(1),
      });

      tx.update(userRef, {
        rewardPoints: FieldValue.increment(WELCOME_BONUS),
        signupRewardsGrantedAt: now,
      });

      // Ledger rows — same shape the signup page wrote, so /profile/wallet
      // history is unchanged.
      tx.set(db.collection("rewardTransactions").doc(), {
        userId: requester.uid,
        userEmail: email,
        points: WELCOME_BONUS,
        type: "Referral Bonus",
        createdAt: now,
      });

      tx.set(db.collection("rewardTransactions").doc(), {
        userId: referrerDoc.id,
        points: REFERRER_BONUS,
        type: "Referral Bonus",
        createdAt: now,
      });

      return {
        kind: "granted",
        welcome: WELCOME_BONUS,
        referrer: REFERRER_BONUS,
      };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    return Response.json({ success: true, result: outcome.kind });
  } catch (error) {
    console.error("signup-rewards: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
