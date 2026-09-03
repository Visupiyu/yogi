import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { computeVendorPayable } from "@/lib/vendorPayable";

// ---------------------------------------------------------------------------
// Read-only "how much may this seller withdraw right now" for the signed-in
// vendor — the SAME authoritative figure /api/request-withdrawal enforces.
//
// The seller wallet used to show an Available Balance it computed in the
// browser from delivered-and-paid orders minus withdrawals. That omitted
// active RETURN deductions, so the displayed figure ran higher than what the
// server would actually allow. Those deductions cannot be computed client-side:
// they sum over the `returns` collection, which firestore.rules make
// unreadable to a seller (a return is owned by the CUSTOMER's email). So the
// wallet reads the number from here instead of re-deriving it.
//
// This recomputes it with the Admin SDK via lib/vendorPayable — the single
// shared calc the withdrawal request and admin settlement routes already use,
// never a second formula. Identity is the verified token; no vendorId is taken
// from the client, and only the caller's own collections are read, so one
// seller's balance can never leak another's.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (
      !(await isWithinRateLimit(
        "seller-payable",
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

    // Identical read set to app/api/request-withdrawal — the returns query is
    // by status only (rules cannot scope it to a vendor), then filtered to this
    // seller's own orders so an unrelated order's return never counts.
    const [orderSnap, payoutSnap, withdrawalSnap, itemReqSnap, legacyReturnSnap] =
      await Promise.all([
        db
          .collection("orders")
          .where("vendorIds", "array-contains", requester.uid)
          .get(),
        db
          .collection("vendor_payouts")
          .where("vendorId", "==", requester.uid)
          .get(),
        db
          .collection("withdrawals")
          .where("vendorId", "==", requester.uid)
          .get(),
        db
          .collection("itemRequests")
          .where("vendorId", "==", requester.uid)
          .get(),
        db.collection("returns").where("status", "==", "Refunded").get(),
      ]);

    const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const orderIds = new Set(orders.map((o) => o.id));
    const legacyReturns = legacyReturnSnap.docs
      .map((d) => d.data())
      .filter((r) =>
        orderIds.has(String((r as { orderId?: unknown })?.orderId || ""))
      );

    const payable = computeVendorPayable({
      vendorUid: requester.uid,
      orders,
      payouts: payoutSnap.docs.map((d) => d.data()),
      withdrawals: withdrawalSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      itemRequests: itemReqSnap.docs.map((d) => d.data()),
      legacyReturns,
    });

    // `payable` may be negative (a post-payout return recovery); the wallet
    // shows max(0, payable) as the withdrawable figure, same as every caller.
    return Response.json({ payable, available: Math.max(0, payable) });
  } catch (error) {
    console.error("seller-payable failed:", error);
    return Response.json(
      { error: "Could not load your balance." },
      { status: 500 }
    );
  }
}
