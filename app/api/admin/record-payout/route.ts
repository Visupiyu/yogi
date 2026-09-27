import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import {
  computeVendorPayableBreakdown,
  evaluateWithdrawalRequest,
} from "@/lib/vendorPayable";
import { mintSequential } from "@/lib/humanIds";

// ---------------------------------------------------------------------------
// Server-authoritative ADMIN direct payout — the only way a vendor_payouts
// document comes into existence.
//
// app/admin/payouts used to work out the amount in the BROWSER and addDoc() it
// straight into vendor_payouts, which firestore.rules allowed for any admin
// write (create, edit or delete). Nothing re-checked the figure, a double click
// could record two payouts, and editing or deleting a payout record dropped it
// out of lib/vendorPayable.ts's committed total, making the same money payable
// again. firestore.rules now deny every client write to vendor_payouts; this
// route is the replacement:
//
//   - the caller must be the verified admin (token, never the request body);
//   - the seller must exist (vendors.uid) — the vendorUid only names WHICH
//     seller, it is never trusted for anything else;
//   - the payable is recomputed here from source with the SAME engine the
//     withdrawal request and settle-withdrawal routes use
//     (computeVendorPayableBreakdown), and the amount must be a whole-rupee
//     figure that fits in it (evaluateWithdrawalRequest) — so a negative or
//     zero payable can never be paid;
//   - reads, the check and the write happen in ONE transaction, which also
//     reads every existing payout and withdrawal for the seller, so two
//     concurrent payouts serialise and the second sees the first;
//   - the document id is deterministic per (seller, idempotency key), so a
//     retried or double-submitted request collapses onto the one payout.
//
// The audit_logs entry is written in the same transaction as the payout, so
// a recorded payout always has its audit entry.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

/** A Firestore-safe seller uid: no path separator, no reserved id. */
function isValidVendorUid(uid: string): boolean {
  return (
    uid.length > 0 &&
    uid.length <= 128 &&
    !uid.includes("/") &&
    uid !== "." &&
    uid !== ".." &&
    !/^__.*__$/.test(uid)
  );
}

/** Deterministic id, so a repeated request cannot record a second payout. */
function payoutIdFor(vendorUid: string, idempotencyKey: string): string {
  return `adminpay_${vendorUid}_${idempotencyKey}`;
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    // Admin only — a seller or customer can never record a payout.
    if (requester.isAdmin !== true) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (
      !(await isWithinRateLimit(
        "admin-record-payout",
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

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const input = body as { vendorUid?: unknown; amount?: unknown; idempotencyKey?: unknown };

    const vendorUid = typeof input.vendorUid === "string" ? input.vendorUid.trim() : "";
    if (!isValidVendorUid(vendorUid)) {
      return Response.json({ error: "Invalid seller." }, { status: 400 });
    }

    const idempotencyKey =
      typeof input.idempotencyKey === "string" ? input.idempotencyKey.trim() : "";
    if (!KEY_PATTERN.test(idempotencyKey)) {
      return Response.json({ error: "Missing request key." }, { status: 400 });
    }

    // Shape check only (whole rupees > 0). Whether it FITS is decided inside
    // the transaction against the recomputed payable.
    const shape = evaluateWithdrawalRequest({ amount: input.amount, payable: Infinity });
    if (!shape.ok) {
      return Response.json(
        { error: "Enter a whole rupee amount greater than zero." },
        { status: 400 }
      );
    }
    const amount = shape.amount;

    const db = getAdminDb();
    const payoutRef = db.collection("vendor_payouts").doc(payoutIdFor(vendorUid, idempotencyKey));

    type TxResult =
      | { kind: "already"; amount: number; payoutNumber: string | null }
      | { kind: "key-conflict" }
      | { kind: "no-vendor" }
      | { kind: "exceeds"; payable: number }
      | { kind: "paid"; amount: number; payoutNumber: string; remaining: number };

    const outcome = await db.runTransaction<TxResult>(async (tx) => {
      // ---- ALL READS FIRST ----
      const existing = await tx.get(payoutRef);
      if (existing.exists) {
        const prior = existing.data() || {};
        // Same key, same seller (the id), same amount -> the same payout.
        // A key reused for a DIFFERENT amount is refused, never re-priced.
        if (Number(prior.amount) === amount) {
          return {
            kind: "already",
            amount,
            payoutNumber: typeof prior.payoutNumber === "string" ? prior.payoutNumber : null,
          };
        }
        return { kind: "key-conflict" };
      }

      const vendorSnap = await tx.get(
        db.collection("vendors").where("uid", "==", vendorUid).limit(1)
      );
      if (vendorSnap.empty) return { kind: "no-vendor" };
      const vendor = vendorSnap.docs[0].data();
      const vendorName =
        vendor?.storeName || vendor?.businessName || vendor?.shopName || "Vendor";

      // The same read set as app/api/request-withdrawal and settle-withdrawal.
      const [orderSnap, payoutSnap, withdrawalSnap, itemReqSnap, legacyReturnSnap, sellerOrderSnap] =
        await Promise.all([
          tx.get(db.collection("orders").where("vendorIds", "array-contains", vendorUid)),
          tx.get(db.collection("vendor_payouts").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("withdrawals").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("itemRequests").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("returns").where("status", "==", "Refunded")),
          tx.get(db.collection("sellerOrders").where("vendorId", "==", vendorUid)),
        ]);

      const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const orderIds = new Set(orders.map((o) => o.id));
      const legacyReturns = legacyReturnSnap.docs
        .map((d) => d.data())
        .filter((r) => orderIds.has(String((r as { orderId?: unknown })?.orderId || "")));

      const breakdown = computeVendorPayableBreakdown({
        vendorUid,
        orders,
        payouts: payoutSnap.docs.map((d) => d.data()),
        withdrawals: withdrawalSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        itemRequests: itemReqSnap.docs.map((d) => d.data()),
        legacyReturns,
        sellerOrders: sellerOrderSnap.docs.map((d) => d.data()),
      });

      // A zero or negative payable refuses every amount.
      const verdict = evaluateWithdrawalRequest({ amount, payable: breakdown.payable });
      if (!verdict.ok) return { kind: "exceeds", payable: breakdown.payable };

      // Counter read precedes every write below.
      const payoutNumber = await mintSequential(tx, db, "payout");

      // ---- WRITES ----
      const now = Timestamp.now();
      tx.create(payoutRef, {
        vendorId: vendorUid,
        vendorName: String(vendorName),
        payoutNumber,
        amount: verdict.amount,
        status: "Paid",
        source: "admin_direct",
        idempotencyKey,
        paidBy: requester.uid,
        paidByEmail: requester.email || "",
        payableBefore: breakdown.payable,
        createdAt: now,
        paidAt: now,
      });
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: "vendor_payout",
        targetId: vendorUid,
        details: {
          vendorName: String(vendorName),
          amount: verdict.amount,
          payoutId: payoutRef.id,
          payoutNumber,
          payableBefore: breakdown.payable,
          payableAfter: breakdown.payable - verdict.amount,
        },
        createdAt: now,
      });

      return {
        kind: "paid",
        amount: verdict.amount,
        payoutNumber,
        remaining: breakdown.payable - verdict.amount,
      };
    });

    switch (outcome.kind) {
      case "already":
        return Response.json({
          success: true,
          alreadyRecorded: true,
          payoutId: payoutRef.id,
          payoutNumber: outcome.payoutNumber,
          amount: outcome.amount,
        });
      case "key-conflict":
        return Response.json(
          { error: "This request key was already used for a different payout." },
          { status: 409 }
        );
      case "no-vendor":
        return Response.json({ error: "Seller not found." }, { status: 404 });
      case "exceeds":
        return Response.json(
          {
            error:
              "That is more than this seller can be paid right now. Payable: ₹" +
              Math.max(0, outcome.payable).toLocaleString("en-IN"),
            payable: Math.max(0, outcome.payable),
          },
          { status: 409 }
        );
      default:
        return Response.json({
          success: true,
          payoutId: payoutRef.id,
          payoutNumber: outcome.payoutNumber,
          amount: outcome.amount,
          remaining: outcome.remaining,
        });
    }
  } catch (error) {
    console.error("record-payout failed:", error);
    return Response.json({ error: "Could not record this payout." }, { status: 500 });
  }
}
