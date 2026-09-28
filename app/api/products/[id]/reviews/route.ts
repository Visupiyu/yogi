import { getAdminDb } from "@/lib/firebaseAdmin";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";
import { PUBLIC_LIST_MAX, newestFirst, toPublicReview, type PublicReview } from "@/lib/reviews/publicReviews";

// ---------------------------------------------------------------------------
// GET /api/products/[id]/reviews — PUBLIC. A product's web reviews as the
// allow-listed public shape (lib/reviews/publicReviews): name, rating, text,
// date and whether the purchase was verified. Never the reviewer's email or
// uid — firestore.rules no longer let anyone read the raw review documents,
// which is how every reviewer's email used to reach any visitor's browser.
// ---------------------------------------------------------------------------

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isValidDocId(id)) return Response.json({ reviews: [] });

    const snap = await getAdminDb().collection("productReviews").where("productId", "==", id).get();
    const reviews = newestFirst(
      snap.docs
        .map((d) => toPublicReview(d.id, d.data() as Record<string, unknown>))
        .filter((r): r is PublicReview => r !== null)
    ).slice(0, PUBLIC_LIST_MAX);

    return Response.json({ reviews });
  } catch (error) {
    console.error("public reviews failed:", error);
    return Response.json({ error: "Could not load reviews." }, { status: 500 });
  }
}
