import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { loadVendorPayableBreakdown } from "@/lib/vendorPayableServer";

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

    // The same read set as app/api/request-withdrawal (lib/vendorPayableServer,
    // shared with the seller/admin AI tools) fed to lib/vendorPayable's one
    // breakdown.
    const breakdown = await loadVendorPayableBreakdown(db, requester.uid);

    // `payable` may be negative (a post-payout return recovery); the wallet
    // shows max(0, payable) as the withdrawable figure, same as every caller.
    // `breakdown` itemises it (gross, discount share, commission ₹0, delivery,
    // returns, paid/reserved) for the payout report, dashboard and analytics.
    return Response.json({
      payable: breakdown.payable,
      available: breakdown.available,
      breakdown,
    });
  } catch (error) {
    console.error("seller-payable failed:", error);
    return Response.json(
      { error: "Could not load your balance." },
      { status: 500 }
    );
  }
}
