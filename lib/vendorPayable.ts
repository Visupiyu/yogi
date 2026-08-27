import { computeVendorShare } from "@/lib/vendorEarnings";

// How much a vendor may actually be paid right now.
//
// Transcribed from app/admin/withdrawals' payableForWithdrawal(). That screen
// still has its own copy — deliberately not refactored here, because it is a
// working money path and this change is scoped to the REQUEST side. The two
// must be kept in step.
//
// Deliberately takes plain arrays rather than Firestore handles: the admin page
// reads them with the client SDK and the request route with the Admin SDK, and
// neither variant belongs in this file.
//
// Firestore security rules cannot express this at all — it is a sum across
// three collections — which is exactly why the amount has to be settled by a
// server route rather than by a rule.

export type PayableOrder = {
  status?: unknown;
  paymentStatus?: unknown;
  needsReview?: unknown;
  items?: unknown;
  [key: string]: unknown;
};

export type PayableWithdrawal = {
  id?: string;
  vendorId?: unknown;
  amount?: unknown;
  status?: unknown;
};

export type PayablePayout = {
  vendorId?: unknown;
  amount?: unknown;
};

/** Withdrawal states that have already reserved or spent money. */
const COMMITTED_STATUSES = ["Paid", "Pending", "Approved"];

/**
 * earnings - commitments, for one vendor.
 *
 * `excludeWithdrawalId` omits the request being settled or re-priced, so it is
 * not subtracted from the balance it is being checked against.
 */
export function computeVendorPayable(params: {
  vendorUid: string;
  orders: PayableOrder[];
  payouts: PayablePayout[];
  withdrawals: PayableWithdrawal[];
  excludeWithdrawalId?: string | null;
}): number {
  const { vendorUid, orders, payouts, withdrawals, excludeWithdrawalId } = params;

  if (!vendorUid) return 0;

  let earnings = 0;

  for (const order of orders || []) {
    // The same fulfilled-and-paid gate the payouts page, the seller wallet and
    // the admin settlement screen all use: money is payable only once the
    // goods arrived AND the customer's payment landed. needsReview means the
    // order was paid but could not be fulfilled as priced (short stock, a
    // spent coupon, a moved reward balance), and its items[] still carry the
    // full requested quantities — so crediting it would pay for units that
    // were never in stock.
    if (
      order?.status !== "Delivered" ||
      order?.paymentStatus !== "Paid" ||
      order?.needsReview === true
    ) {
      continue;
    }

    const share = computeVendorShare(order as never, vendorUid);
    if (share) earnings += share.vendorEarning;
  }

  let committed = 0;

  // Direct admin settlements.
  for (const payout of payouts || []) {
    if (payout?.vendorId === vendorUid) {
      committed += Number(payout?.amount || 0);
    }
  }

  // Every other withdrawal already settled or reserved.
  for (const withdrawal of withdrawals || []) {
    if (excludeWithdrawalId && withdrawal?.id === excludeWithdrawalId) continue;
    if (!COMMITTED_STATUSES.includes(String(withdrawal?.status))) continue;
    if (withdrawal?.vendorId !== vendorUid) continue;
    committed += Number(withdrawal?.amount || 0);
  }

  return earnings - committed;
}

/** Whether a requested amount fits in what is left, with the reason if not. */
export function evaluateWithdrawalRequest(params: {
  amount: unknown;
  payable: number;
}):
  | { ok: true; amount: number }
  | { ok: false; reason: "invalid-amount" | "exceeds-payable"; payable: number } {
  // Strictly a number, not something that coerces to one. The Firestore rule
  // this replaces required `amount is number`, and silently accepting "500"
  // would quietly widen what the API takes compared with what it guaranteed
  // before.
  if (typeof params.amount !== "number") {
    return { ok: false, reason: "invalid-amount", payable: params.payable };
  }

  const amount = params.amount;

  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, reason: "invalid-amount", payable: params.payable };
  }

  // Whole rupees only — a fractional request cannot be paid out cleanly and is
  // a common way to probe rounding behaviour.
  if (Math.floor(amount) !== amount) {
    return { ok: false, reason: "invalid-amount", payable: params.payable };
  }

  if (amount > params.payable) {
    return { ok: false, reason: "exceeds-payable", payable: params.payable };
  }

  return { ok: true, amount };
}
