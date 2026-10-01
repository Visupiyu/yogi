// "Payment received — order confirmation pending" (client-side marker).
//
// Razorpay can report a successful payment while /api/finalize-online-order then
// fails (network drop, a server error, an expired session). The customer HAS paid
// but no order is confirmed yet; the webhook may still create it. Until this is
// resolved the checkout must not look like a fresh, payable checkout — that is how
// someone pays twice for the same items.
//
// The marker is stored in localStorage (the only place the client can keep it
// without a backend change) and is:
//   * scoped to the account (uid) — another account on the device ignores it;
//   * time-limited (PENDING_TTL_MS) so it can never block checkout forever;
//   * resolved automatically when the order document (id = the Razorpay payment
//     id) appears, or by an explicit "retry confirmation", which only re-sends the
//     same three identifiers to the idempotent finalize route — never a payment.
// It holds the three Razorpay identifiers that finalize needs. They are not
// secrets: the signature is an HMAC over ids that is useless without the key.
//
// LIMITATION: this is per browser. Another device, or a cleared browser, has no
// marker; the server-side reconciliation (finalize idempotency + webhook) is what
// protects those cases.
const KEY = "pendingOnlinePayment";
export const PENDING_TTL_MS = 24 * 60 * 60 * 1000;

export type PendingPayment = {
  uid: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
  /** "buyNow" or null/other (cart) — decides whether the cart is cleared on resolution. */
  source: string | null;
  at: number;
};

export function savePendingPayment(p: PendingPayment): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    // Storage unavailable: nothing more the client can do.
  }
}

export function loadPendingPayment(uid: string, now: number = Date.now()): PendingPayment | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<PendingPayment>;
    if (
      !p ||
      typeof p.uid !== "string" ||
      typeof p.razorpayOrderId !== "string" ||
      typeof p.razorpayPaymentId !== "string" ||
      typeof p.razorpaySignature !== "string" ||
      typeof p.at !== "number"
    ) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (now - p.at > PENDING_TTL_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    if (p.uid !== uid) return null;
    return p as PendingPayment;
  } catch {
    return null;
  }
}

export function clearPendingPayment(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
