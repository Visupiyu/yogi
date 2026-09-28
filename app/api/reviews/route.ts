import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId, loadCustomerProfile } from "@/lib/customerAccount/customerGuards";
import { computeProductRating, reviewerKey } from "@/lib/reviews/productRating";

// ---------------------------------------------------------------------------
// POST /api/reviews { productId, rating, review } — a customer's web review.
//
// Reviews used to be written straight from the browser: any signed-in account
// could review any product any number of times (the one-per-product check was
// client-side only), including a seller rating their own or a competitor's
// products. Now, on the server:
//   - the reviewer is the verified token, and must have RECEIVED the product
//     (one of their orders containing it is Delivered);
//   - one review per customer per product: the document id is
//     {productId}_{uid}, and an older free-form review by the same email also
//     counts;
//   - a seller cannot review their own product; a blocked account cannot post;
//   - the name shown is the customer's own profile name, the date is the
//     server's, and the product's rating/reviewCount are recomputed in the
//     same transaction (lib/reviews/productRating — one review per reviewer).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_REVIEW_CHARS = 2000;

type Outcome = { kind: "ok"; id: string } | { kind: "error"; status: number; error: string };

function millis(v: unknown): number {
  return (v as { toMillis?: () => number } | null)?.toMillis?.() ?? 0;
}

function orderHasProduct(order: Record<string, unknown>, productId: string): boolean {
  const items = Array.isArray(order.items) ? (order.items as Record<string, unknown>[]) : [];
  return items.some((it) => it?.id === productId || it?.productId === productId);
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("review-create", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    let body: { productId?: unknown; rating?: unknown; review?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    const rating = body.rating;
    const review = typeof body.review === "string" ? body.review.trim() : "";
    if (!isValidDocId(productId)) return Response.json({ error: "Missing product." }, { status: 400 });
    if (typeof rating !== "number" || !Number.isInteger(rating) || rating < 1 || rating > 5) {
      return Response.json({ error: "Choose a rating from 1 to 5 stars." }, { status: 400 });
    }
    if (!review || review.length > MAX_REVIEW_CHARS) {
      return Response.json({ error: `Write a review of up to ${MAX_REVIEW_CHARS} characters.` }, { status: 400 });
    }

    const db = getAdminDb();
    const profile = await loadCustomerProfile(db, requester.uid);
    if (profile.blocked) {
      return Response.json({ error: "Your account can't post reviews. Please contact support." }, { status: 403 });
    }

    const productRef = db.collection("products").doc(productId);
    const reviewRef = db.collection("productReviews").doc(`${productId}_${requester.uid}`);

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const productSnap = await tx.get(productRef);
      if (!productSnap.exists) return { kind: "error", status: 404, error: "Product not found." };
      const product = productSnap.data() as Record<string, unknown>;
      if (product.vendorId === requester.uid) {
        return { kind: "error", status: 403, error: "You can't review your own product." };
      }

      const [existing, ordersSnap, reviewsSnap] = await Promise.all([
        tx.get(reviewRef),
        tx.get(db.collection("orders").where("userId", "==", requester.uid)),
        tx.get(db.collection("productReviews").where("productId", "==", productId)),
      ]);

      const email = (requester.email || "").toLowerCase();
      const alreadyReviewed =
        existing.exists ||
        (email !== "" &&
          reviewsSnap.docs.some((d) => String(d.get("userEmail") || "").toLowerCase() === email)) ||
        reviewsSnap.docs.some((d) => d.get("userId") === requester.uid);
      if (alreadyReviewed) return { kind: "error", status: 409, error: "You've already reviewed this product." };

      const purchased = ordersSnap.docs.some((d) => {
        const order = d.data() as Record<string, unknown>;
        return order.status === "Delivered" && orderHasProduct(order, productId);
      });
      if (!purchased) {
        return { kind: "error", status: 403, error: "You can review a product once it has been delivered to you." };
      }

      const now = Timestamp.now();
      const doc = {
        productId,
        productName: typeof product.title === "string" ? product.title : typeof product.name === "string" ? product.name : "",
        userId: requester.uid,
        userEmail: requester.email || "",
        customerName: profile.displayName,
        rating,
        review,
        verifiedPurchase: true,
        createdAt: now,
      };

      const { rating: avg, reviewCount } = computeProductRating([
        ...reviewsSnap.docs.map((d) => ({
          reviewer: reviewerKey(d.data(), d.id),
          rating: d.get("rating"),
          atMs: millis(d.get("createdAt")),
        })),
        { reviewer: reviewerKey(doc, reviewRef.id), rating, atMs: now.toMillis() },
      ]);

      tx.create(reviewRef, doc);
      tx.update(productRef, { rating: avg, reviewCount });
      return { kind: "ok", id: reviewRef.id };
    });

    if (outcome.kind === "error") return Response.json({ error: outcome.error }, { status: outcome.status });
    return Response.json({ success: true, id: outcome.id });
  } catch (error) {
    console.error("review create failed:", error);
    return Response.json({ error: "Couldn't submit your review. Please try again." }, { status: 500 });
  }
}
