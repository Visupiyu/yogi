// A product's storefront rating, computed from its stored web reviews
// (productReviews). One review per reviewer counts — the latest — so a
// reviewer cannot weight the average by posting more than once. Shared by
// app/api/reviews (on create) and app/api/reviews/sync-rating.

export type RatedReview = {
  /** Who wrote it: the reviewer's email, else the document id. */
  reviewer: string;
  rating: unknown;
  atMs: number;
};

export function reviewerKey(data: { userEmail?: unknown }, docId: string): string {
  return String(data.userEmail || docId).toLowerCase();
}

export function computeProductRating(reviews: RatedReview[]): { rating: number; reviewCount: number } {
  const latest = new Map<string, { rating: number; at: number }>();
  for (const r of reviews) {
    const rating = Number(r.rating);
    if (!Number.isFinite(rating) || rating < 1 || rating > 5) continue;
    const prev = latest.get(r.reviewer);
    if (!prev || r.atMs >= prev.at) latest.set(r.reviewer, { rating, at: r.atMs });
  }
  const reviewCount = latest.size;
  const rating =
    reviewCount === 0 ? 0 : [...latest.values()].reduce((s, v) => s + v.rating, 0) / reviewCount;
  return { rating, reviewCount };
}
