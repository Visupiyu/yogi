import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { computeVendorPayable, evaluateWithdrawalRequest } from "@/lib/vendorPayable";

// ---------------------------------------------------------------------------
// Server-authoritative "mark a withdrawal Paid" — the money-moving transition.
//
// The admin screen used to recompute payable in the BROWSER and then write
// status:'Paid' directly (firestore.rules only checks isAdmin() on the update,
// not the amount). That put the one balance check that matters on the client.
// This route moves it server-side: it verifies the caller is a real admin,
// re-derives the authoritative payable from source with the Admin SDK, and only
// marks Paid inside a transaction — so a stale or hand-crafted write cannot
// overpay, and two concurrent settlements cannot both pay the same balance.
//
// A seller can never reach this: verifyRequestUser().isAdmin is the admin email
// AND a verified email (lib/serverAuth), matching firestore.rules' isAdmin().
// firestore.rules deny every client write to withdrawals (B2), so this route
// (and app/api/review-withdrawal for the non-money transitions) is the only
// way a withdrawal changes. Inside the one transaction it re-verifies the
// original request's seller identity and stored amount, re-derives payable,
// marks Paid and writes the audit_logs entry — so a settlement can never exist
// without its audit record, and a repeat or concurrent settle sees "Paid".
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 60;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`settle-withdrawal_${uid}`);
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

// Only a request that has NOT yet moved money may be settled.
const SETTLEABLE_FROM = new Set(["Pending", "Approved"]);

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    // Admin only — a seller can never invoke this.
    if (requester.isAdmin !== true) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    let body: { withdrawalId?: unknown } = {};
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const withdrawalId =
      typeof body.withdrawalId === "string" ? body.withdrawalId.trim() : "";
    if (!withdrawalId) {
      return Response.json({ error: "Missing withdrawal id." }, { status: 400 });
    }

    const db = getAdminDb();
    const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);

    type TxResult =
      | { kind: "not-found" }
      | { kind: "already-paid"; amount: number }
      | { kind: "bad-state"; status: string }
      | { kind: "no-vendor" }
      | { kind: "missing-vendor-id" }
      | { kind: "identity-mismatch" }
      | { kind: "invalid-amount" }
      | { kind: "insufficient"; amount: number; payable: number }
      | { kind: "paid"; amount: number };

    const outcome = await db.runTransaction<TxResult>(async (tx) => {
      // ---- ALL READS FIRST ----
      const snap = await tx.get(withdrawalRef);
      if (!snap.exists) return { kind: "not-found" };

      const w = snap.data() as {
        vendorId?: unknown;
        vendorEmail?: unknown;
        amount?: unknown;
        status?: unknown;
        payoutNumber?: unknown;
      };
      const status = String(w?.status || "Pending");

      // Duplicate-payment guard: re-reading the live status inside the
      // transaction means a second concurrent settle sees "Paid" and stops.
      if (status === "Paid") {
        return { kind: "already-paid", amount: Number(w?.amount || 0) };
      }
      if (!SETTLEABLE_FROM.has(status)) {
        return { kind: "bad-state", status };
      }

      // Settlement identity is the stored vendorId ONLY — never a vendorEmail
      // lookup. lib/vendorPayable.ts counts a Paid withdrawal against a seller
      // by vendorId alone, so a legacy row paid without one would never reduce
      // that seller's payable and the same money could be paid out again. Such
      // a row is refused (fail closed) until an admin corrects it; nothing is
      // assigned from the email here. The stored value must also be EXACTLY
      // the seller uid: a padded "seller_a " would be settled against
      // seller_a here but never matched by vendorPayable's exact comparison,
      // so it is refused rather than silently normalised.
      const vendorUid = typeof w?.vendorId === "string" ? w.vendorId : "";
      if (!vendorUid || vendorUid !== vendorUid.trim()) return { kind: "missing-vendor-id" };

      // Identity of the ORIGINAL request. app/api/request-withdrawal creates
      // every withdrawal at the deterministic id `${vendorUid}_${key}` and
      // stamps a payoutNumber, so a server-created request whose vendorId no
      // longer matches its own id has been re-pointed at another seller and is
      // never paid. (Legacy client-created rows have random ids and no
      // payoutNumber; they still need a real seller record below.)
      const serverCreated = typeof w?.payoutNumber === "string" && w.payoutNumber !== "";
      if (serverCreated && !withdrawalId.startsWith(`${vendorUid}_`)) {
        return { kind: "identity-mismatch" };
      }

      const [vendorSnap, orderSnap, payoutSnap, withdrawalSnap, itemReqSnap, legacyReturnSnap, sellerOrderSnap] =
        await Promise.all([
          tx.get(db.collection("vendors").where("uid", "==", vendorUid).limit(1)),
          tx.get(db.collection("orders").where("vendorIds", "array-contains", vendorUid)),
          tx.get(db.collection("vendor_payouts").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("withdrawals").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("itemRequests").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("returns").where("status", "==", "Refunded")),
          tx.get(db.collection("sellerOrders").where("vendorId", "==", vendorUid)),
        ]);

      if (vendorSnap.empty) return { kind: "no-vendor" };

      const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const orderIds = new Set(orders.map((o) => o.id));
      const legacyReturns = legacyReturnSnap.docs
        .map((d) => d.data())
        .filter((r) => orderIds.has(String((r as { orderId?: unknown })?.orderId || "")));

      // Exclude THIS request so the check is "does it fit in what's left after
      // every OTHER commitment", not double-counting its own reservation.
      const payable = computeVendorPayable({
        vendorUid,
        orders,
        payouts: payoutSnap.docs.map((d) => d.data()),
        withdrawals: withdrawalSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
        itemRequests: itemReqSnap.docs.map((d) => d.data()),
        legacyReturns,
        sellerOrders: sellerOrderSnap.docs.map((d) => d.data()),
        excludeWithdrawalId: withdrawalId,
      });

      // The stored amount, held to the same rule it was created under: a
      // whole-rupee number (never a coerced string), within what is payable.
      const verdict = evaluateWithdrawalRequest({ amount: w?.amount, payable });
      if (!verdict.ok) {
        if (verdict.reason === "invalid-amount") return { kind: "invalid-amount" };
        return { kind: "insufficient", amount: Number(w?.amount || 0), payable };
      }
      const amount = verdict.amount;

      // ---- WRITES: the Paid transition and its audit entry, atomically ----
      const now = Timestamp.now();
      const auditRef = db.collection("audit_logs").doc();
      tx.update(withdrawalRef, {
        status: "Paid",
        paidAt: now,
        paidBy: requester.uid,
        paidByEmail: requester.email || "",
        settlementAuditId: auditRef.id,
      });
      tx.set(auditRef, {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: "withdrawal_settlement",
        targetId: withdrawalId,
        details: {
          withdrawalId,
          vendorId: vendorUid,
          vendorEmail: typeof w?.vendorEmail === "string" ? w.vendorEmail : "",
          amount,
          payoutNumber: serverCreated ? w.payoutNumber : "",
          fromStatus: status,
          payableBefore: payable,
          payableAfter: payable - amount,
        },
        createdAt: now,
      });
      return { kind: "paid", amount };
    });

    switch (outcome.kind) {
      case "not-found":
        return Response.json({ error: "Withdrawal not found." }, { status: 404 });
      case "already-paid":
        return Response.json({
          success: true,
          alreadyPaid: true,
          amount: outcome.amount,
        });
      case "bad-state":
        return Response.json(
          {
            error: `A ${outcome.status} withdrawal cannot be marked paid.`,
          },
          { status: 409 }
        );
      case "no-vendor":
        return Response.json(
          { error: "Cannot identify the vendor for this withdrawal." },
          { status: 409 }
        );
      case "missing-vendor-id":
        return Response.json(
          {
            error:
              "This is a legacy withdrawal with no seller id. It needs administrative correction before it can be settled.",
          },
          { status: 409 }
        );
      case "identity-mismatch":
        return Response.json(
          { error: "This withdrawal's seller does not match its original request. It needs review." },
          { status: 409 }
        );
      case "invalid-amount":
        return Response.json(
          { error: "This withdrawal's amount is not a valid whole-rupee figure. It needs review." },
          { status: 409 }
        );
      case "insufficient":
        return Response.json(
          {
            error:
              "Insufficient balance. Payable now: ₹" +
              Math.max(0, outcome.payable).toLocaleString("en-IN"),
            payable: Math.max(0, outcome.payable),
          },
          { status: 409 }
        );
      default:
        return Response.json({ success: true, status: "Paid", amount: outcome.amount });
    }
  } catch (error) {
    console.error("settle-withdrawal failed:", error);
    return Response.json(
      { error: "Could not settle this withdrawal." },
      { status: 500 }
    );
  }
}
