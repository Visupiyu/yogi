import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { computeVendorPayable } from "@/lib/vendorPayable";

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
// Firestore rules are unchanged — withdrawals stay create:false / update:admin.
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

      let vendorUid = typeof w?.vendorId === "string" ? w.vendorId : "";
      if (!vendorUid && typeof w?.vendorEmail === "string" && w.vendorEmail) {
        const vs = await tx.get(
          db.collection("vendors").where("email", "==", w.vendorEmail).limit(1)
        );
        if (!vs.empty) vendorUid = String(vs.docs[0].data()?.uid || "");
      }
      if (!vendorUid) return { kind: "no-vendor" };

      const [orderSnap, payoutSnap, withdrawalSnap, itemReqSnap, legacyReturnSnap] =
        await Promise.all([
          tx.get(db.collection("orders").where("vendorIds", "array-contains", vendorUid)),
          tx.get(db.collection("vendor_payouts").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("withdrawals").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("itemRequests").where("vendorId", "==", vendorUid)),
          tx.get(db.collection("returns").where("status", "==", "Refunded")),
        ]);

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
        excludeWithdrawalId: withdrawalId,
      });

      const amount = Number(w?.amount || 0);
      if (!Number.isFinite(amount) || amount <= 0 || amount > payable) {
        return { kind: "insufficient", amount, payable };
      }

      tx.update(withdrawalRef, {
        status: "Paid",
        paidAt: Timestamp.now(),
        paidBy: requester.uid,
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
