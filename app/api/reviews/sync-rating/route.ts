import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { computeProductRating, reviewerKey } from "@/lib/reviews/productRating";

// ---------------------------------------------------------------------------
// POST /api/reviews/sync-rating  { productId }
//
// The product's aggregate rating / reviewCount, recomputed on the SERVER from
// the product's actual reviews (productReviews). Replaces the product page and
// admin reviews page writing an average they computed in the browser —
// firestore.rules no longer let any client write rating/reviewCount.
//
//   - Signed-in customers may trigger it only for a product they have
//     reviewed themselves (their token email has a productReviews doc for it);
//     an admin may trigger it for any product (after deleting a review).
//   - The figures come only from the stored reviews: one review per reviewer
//     email (the newest counts, so a duplicate can never weight the average),
//     ratings outside 1–5 ignored. A caller cannot supply a number.
//
// Same collection and meaning as before (web productReviews); the Customer
// App's separate `reviews` collection is unchanged and still not aggregated.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

function millis(v: unknown): number {
  return (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("review-sync", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    let body: { productId?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const productId = typeof body?.productId === "string" ? body.productId.trim() : "";
    if (!productId || productId.length > 200 || productId.includes("/")) {
      return Response.json({ error: "Missing product id." }, { status: 400 });
    }

    const db = getAdminDb();
    const productRef = db.collection("products").doc(productId);
    const reviewsQuery = db.collection("productReviews").where("productId", "==", productId);

    const outcome = await db.runTransaction(async (tx) => {
      const [productSnap, reviewSnap] = await Promise.all([tx.get(productRef), tx.get(reviewsQuery)]);
      if (!productSnap.exists) return { status: 404, error: "Product not found." } as const;

      if (requester.isAdmin !== true) {
        const email = (requester.email || "").toLowerCase();
        const own = email && reviewSnap.docs.some((d) => String(d.data().userEmail || "").toLowerCase() === email);
        if (!own) return { status: 403, error: "You have not reviewed this product." } as const;
      }

      // One review per reviewer (newest wins), valid ratings only — the same
      // calculation app/api/reviews runs when a review is created.
      const { rating, reviewCount } = computeProductRating(
        reviewSnap.docs.map((d) => ({
          reviewer: reviewerKey(d.data(), d.id),
          rating: d.get("rating"),
          atMs: millis(d.get("createdAt")),
        }))
      );
      tx.update(productRef, { rating, reviewCount });
      return { status: 200, rating, reviewCount } as const;
    });

    if (outcome.status !== 200) return Response.json({ error: outcome.error }, { status: outcome.status });
    return Response.json({ success: true, rating: outcome.rating, reviewCount: outcome.reviewCount });
  } catch (error) {
    console.error("review rating sync failed:", error);
    return Response.json({ error: "Could not update the rating." }, { status: 500 });
  }
}
