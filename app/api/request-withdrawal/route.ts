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

    // The reservation is done in ONE transaction: read the idempotency doc, the
    // vendor, and every collection the payable depends on; recompute payable;
    // verify the amount fits; and create the withdrawal — all serialized. Two
    // concurrent requests with DIFFERENT idempotency keys can no longer each see
    // the full balance and each reserve it: the second transaction re-reads the
    // first's just-created reservation (a committed Pending row) and recomputes
    // a smaller payable. Same-key requests still collapse onto the one
    // deterministic document (existence check + create()).
    type TxResult =
      | { kind: "already"; amount: number }
      | { kind: "no-vendor" }
      | { kind: "not-approved" }
      | { kind: "invalid" }
      | { kind: "exceeds"; payable: number }
      | { kind: "created"; amount: number; remaining: number };

    const outcome = await db.runTransaction<TxResult>(async (tx) => {
      // ---- ALL READS FIRST ----
      const existing = await tx.get(withdrawalRef);
      if (existing.exists) {
        return { kind: "already", amount: Number(existing.data()?.amount || 0) };
      }

      // The vendor profile supplies the display name only. Identity comes from
      // the verified token, never from the profile or the request.
      const vendorSnap = await tx.get(
        db.collection("vendors").where("uid", "==", requester.uid).limit(1)
      );
      if (vendorSnap.empty) return { kind: "no-vendor" };
      const vendor = vendorSnap.docs[0].data();

      // Only an admin-Approved seller may withdraw. Status is read from the
      // vendor document (by the verified uid), never from the request, so a
      // Pending/Rejected/Blocked seller cannot self-withdraw already-earned
      // payable through this API — any exceptional release is an admin process.
      if (vendor?.status !== "Approved") {
        return { kind: "not-approved" };
      }

      const businessName =
        typeof vendor?.businessName === "string" ? vendor.businessName : "";

      const [orderSnap, payoutSnap, withdrawalSnap, itemReqSnap, legacyReturnSnap] =
        await Promise.all([
          tx.get(
            db.collection("orders").where("vendorIds", "array-contains", requester.uid)
          ),
          tx.get(db.collection("vendor_payouts").where("vendorId", "==", requester.uid)),
          tx.get(db.collection("withdrawals").where("vendorId", "==", requester.uid)),
          tx.get(db.collection("itemRequests").where("vendorId", "==", requester.uid)),
          tx.get(db.collection("returns").where("status", "==", "Refunded")),
        ]);

      const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const orderIds = new Set(orders.map((o) => o.id));
      const legacyReturns = legacyReturnSnap.docs
        .map((d) => d.data())
        .filter((r) => orderIds.has(String((r as { orderId?: unknown })?.orderId || "")));

      const payable = computeVendorPayable({
        vendorUid: requester.uid,
        orders,
        payouts: payoutSnap.docs.map((d) => d.data()),
        withdrawals: withdrawalSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        itemRequests: itemReqSnap.docs.map((d) => d.data()),
        legacyReturns,
      });

      const verdict = evaluateWithdrawalRequest({ amount: body.amount, payable });
      if (!verdict.ok) {
        if (verdict.reason === "invalid-amount") return { kind: "invalid" };
        return { kind: "exceeds", payable };
      }

      // Human-readable payout number, minted in the SAME transaction (its
      // counter read precedes every write here). A burned number on a retry is
      // acceptable — numbers must never DUPLICATE, which the counter guarantees.
      const payoutNumber = await mintSequential(tx, db, "payout");

      tx.create(withdrawalRef, {
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

      return {
        kind: "created",
        amount: verdict.amount,
        remaining: payable - verdict.amount,
      };
    });

    if (outcome.kind === "already") {
      return Response.json({
        success: true,
        alreadyRequested: true,
        withdrawalId,
        amount: outcome.amount,
      });
    }
    if (outcome.kind === "no-vendor") {
      return Response.json(
        { error: "No seller account found for this login." },
        { status: 403 }
      );
    }
    if (outcome.kind === "not-approved") {
      return Response.json(
        { error: "Your seller account is not approved for withdrawals." },
        { status: 403 }
      );
    }
    if (outcome.kind === "invalid") {
      return Response.json(
        { error: "Enter a whole rupee amount greater than zero." },
        { status: 400 }
      );
    }
    if (outcome.kind === "exceeds") {
      return Response.json(
        {
          error:
            "That is more than you can withdraw right now. Available: ₹" +
            Math.max(0, outcome.payable).toLocaleString("en-IN"),
          payable: Math.max(0, outcome.payable),
        },
        { status: 409 }
      );
    }

    return Response.json({
      success: true,
      withdrawalId,
      amount: outcome.amount,
      remaining: outcome.remaining,
    });
  } catch (error) {
    console.error("request-withdrawal failed:", error);
    return Response.json(
      { error: "Could not submit your withdrawal request." },
      { status: 500 }
    );
  }
}
