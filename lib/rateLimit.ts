import { getAdminDb } from "@/lib/firebaseAdmin";

// SERVER-ONLY. Imports lib/firebaseAdmin — never reachable from the browser
// bundle.
//
// Fixed-window per-uid rate limiter, extracted from the identical helper that
// app/api/create-order/route.ts introduced and that five other routes now
// carry their own copy of. Those copies are deliberately left alone: they sit
// on the money path (create-order, place-order, cancel-order) or on already-
// shipped and verified routes, and rewriting them buys nothing while risking
// a regression in code that works. New callers should use this instead of
// making a seventh copy.
//
// Same semantics as every existing copy, so behaviour is identical:
//   - one rateLimits/{key}_{uid} document per route namespace per user
//   - a window older than windowMs resets the count rather than sliding
//   - the read and the increment happen in one transaction, so two
//     simultaneous requests cannot both observe the same pre-increment count
//
// The rateLimits collection is written only by the Admin SDK, so Firestore's
// default-deny rule already covers it and no rules change is needed.
export async function isWithinRateLimit(
  namespace: string,
  uid: string,
  max: number,
  windowMs: number
): Promise<boolean> {
  const db = getAdminDb();
  const ref = db.collection("rateLimits").doc(`${namespace}_${uid}`);
  const now = Date.now();

  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > windowMs) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= max) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

/** Shared budget for the tool-calling AI chat routes. */
export const AI_CHAT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

/**
 * Higher than product-qa's 20 because chat is conversational — a single
 * useful session is several messages — but still low enough to bound a
 * runaway client loop, which is what actually costs money here: each turn
 * can trigger multiple Gemini calls through the tool loop.
 */
export const AI_CHAT_RATE_LIMIT_MAX = 30;
