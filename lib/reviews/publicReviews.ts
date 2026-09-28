// The PUBLIC shapes of a product's web reviews and questions — the only fields
// a product page (or anyone else) receives. The stored documents also carry
// the author's email / uid, which firestore.rules no longer expose publicly.
// Server-side (node:crypto); the routes and the tests share one allow-list.
import { createHash } from "node:crypto";

export type PublicReview = {
  id: string;
  customerName: string;
  rating: number;
  review: string;
  createdAt: string | null;
  verifiedPurchase: boolean;
};

export const PUBLIC_REVIEW_KEYS = ["id", "customerName", "rating", "review", "createdAt", "verifiedPurchase"] as const;

export type PublicQuestion = {
  id: string;
  customerName: string;
  question: string;
  answer: string;
  createdAt: string | null;
  answeredAt: string | null;
};

export const PUBLIC_QUESTION_KEYS = ["id", "customerName", "question", "answer", "createdAt", "answeredAt"] as const;

/** At most this many reviews / questions are returned for one product. */
export const PUBLIC_LIST_MAX = 200;

type Doc = Record<string, unknown>;

export function toIsoOrNull(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d.toISOString();
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v.toISOString();
  return null;
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/**
 * An opaque, stable id for the public view. A review document id is
 * {productId}_{uid}, so returning it as-is would publish the reviewer's uid.
 */
export function publicReviewId(docId: string): string {
  return createHash("sha256").update(docId).digest("hex").slice(0, 20);
}

export function toPublicReview(docId: string, data: Doc): PublicReview | null {
  const rating = Number(data.rating);
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) return null;
  return {
    id: publicReviewId(docId),
    customerName: text(data.customerName, 100) || "Customer",
    rating: Math.round(rating),
    review: text(data.review, 2000),
    createdAt: toIsoOrNull(data.createdAt),
    verifiedPurchase: data.verifiedPurchase === true,
  };
}

export function toPublicQuestion(id: string, data: Doc): PublicQuestion {
  return {
    id,
    customerName: text(data.customerName, 100) || "Customer",
    question: text(data.question, 1000),
    // Only an answer the seller gave through the answer route (status
    // "Answered") is shown — a legacy question created with a pre-filled
    // answer is displayed as unanswered.
    answer: data.status === "Answered" ? text(data.answer, 1000) : "",
    createdAt: toIsoOrNull(data.createdAt),
    answeredAt: data.status === "Answered" ? toIsoOrNull(data.answeredAt) : null,
  };
}

/** Newest first; entries without a date last. */
export function newestFirst<T extends { createdAt: string | null }>(items: T[]): T[] {
  return [...items].sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}
