import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import {
  computeVendorPayable,
  evaluateWithdrawalRequest,
} from "@/lib/vendorPayable";
import { mintSequential } from "@/lib/humanIds";

// ---------------------------------------------------------------------------
// The single authoritative path for requesting a payout.
//
// This used to be an addDoc() straight from app/seller/wallet. firestore.rules
// pinned WHO the request belonged to (vendorId, vendorEmail) and WHAT state it
// started in (status 'Pending', amount a positive number) — but not HOW MUCH,
// because the real balance is a sum over every order plus two payout ledgers
// and rules cannot query or sum collections. The "is this within your balance?"
// test therefore lived only in the browser, where it is not a test at all: a
// seller writing through the SDK could request any figure.
//
// The amount is now decided here. The client sends a figure, the server
// recomputes what is actually payable from the vendor's own delivered-and-paid
// orders minus every existing commitment, and refuses anything larger.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb()
    .collection("rateLimits")
    .doc(`request-withdrawal_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;

    const windowStart = Number(data?.windowStart || 0);
    const count = Number(data?.count || 0);

    if (!data || now - windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 }, { merge: true });
      return true;
    }

    if (count >= RATE_LIMIT_MAX) return false;

    tx.set(ref, { windowStart, count: count + 1 }, { merge: true });
    return true;
  });
}

/** Deterministic id, so a double-submitted form cannot reserve twice. */
function withdrawalIdFor(uid: string, idempotencyKey: string): string {
  return `${uid}_${idempotencyKey}`;
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { amount?: unknown; idempotencyKey?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const idempotencyKey =
      typeof body.idempotencyKey === "string" && body.idempotencyKey.trim()
        ? body.idempotencyKey.trim().slice(0, 64)
        : "";

    if (!idempotencyKey) {
      return Response.json(
        { error: "Missing request key." },
        { status: 400 }
      );
    }

    const db = getAdminDb();
    const withdrawalId = withdrawalIdFor(requester.uid, idempotencyKey);
    const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);

    // Fast path: a retry of an already-accepted request must not reserve a
    // second time. Mirrors app/api/place-order's idempotency handling.
    const existing = await withdrawalRef.get();
    if (existing.exists) {
      return Response.json({
        success: true,
        alreadyRequested: true,
        withdrawalId,
        amount: Number(existing.data()?.amount || 0),
      });
    }

    // The vendor profile supplies the display name only. Identity comes from
    // the verified token, never from the profile or the request.
    const vendorSnap = await db
      .collection("vendors")
      .where("uid", "==", requester.uid)
      .limit(1)
      .get();

    if (vendorSnap.empty) {
      return Response.json(
        { error: "No seller account found for this login." },
        { status: 403 }
      );
    }

    const vendor = vendorSnap.docs[0].data();
    const businessName =
      typeof vendor?.businessName === "string" ? vendor.businessName : "";

    // ---- What is actually payable, recomputed from source ----
    const [orderSnap, payoutSnap, withdrawalSnap] = await Promise.all([
      db.collection("orders").where("vendorIds", "array-contains", requester.uid).get(),
      db.collection("vendor_payouts").where("vendorId", "==", requester.uid).get(),
      db.collection("withdrawals").where("vendorId", "==", requester.uid).get(),
    ]);

    const payable = computeVendorPayable({
      vendorUid: requester.uid,
      orders: orderSnap.docs.map((d) => d.data()),
      payouts: payoutSnap.docs.map((d) => d.data()),
      withdrawals: withdrawalSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    });

    const verdict = evaluateWithdrawalRequest({ amount: body.amount, payable });

    if (!verdict.ok) {
      if (verdict.reason === "invalid-amount") {
        return Response.json(
          { error: "Enter a whole rupee amount greater than zero." },
          { status: 400 }
        );
      }

      return Response.json(
        {
          error:
            "That is more than you can withdraw right now. Available: ₹" +
            Math.max(0, verdict.payable).toLocaleString("en-IN"),
          payable: Math.max(0, verdict.payable),
        },
        { status: 409 }
      );
    }

    // Human-readable payout number, minted atomically in its own counter
    // transaction. A burned number on a later failure is an acceptable gap —
    // numbers must never DUPLICATE or be REUSED, which the counter guarantees.
    const payoutNumber = await db.runTransaction((tx) =>
      mintSequential(tx, db, "payout")
    );

    // create() rather than set(): if two requests race past the existence
    // check above, the second fails instead of overwriting the first.
    try {
      await withdrawalRef.create({
        vendorId: requester.uid,
        vendorEmail: requester.email || "",
        vendorName: businessName,
        payoutNumber,
        // Server-decided. The figure in the request body only ever narrows
        // this, never widens it — anything above `payable` was refused above.
        amount: verdict.amount,
        status: "Pending",
        createdAt: Timestamp.now(),
      });
    } catch {
      return Response.json({
        success: true,
        alreadyRequested: true,
        withdrawalId,
      });
    }

    return Response.json({
      success: true,
      withdrawalId,
      amount: verdict.amount,
      remaining: payable - verdict.amount,
    });
  } catch (error) {
    console.error("request-withdrawal failed:", error);
    return Response.json(
      { error: "Could not submit your withdrawal request." },
      { status: 500 }
    );
  }
}
