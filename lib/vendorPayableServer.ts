// SERVER-ONLY (Admin SDK). The ONE read set behind a seller's payable — used
// by app/api/seller/payable (wallet, payout report, dashboard, analytics) and
// the AI seller/admin tools, so they all compute from identical inputs with
// lib/vendorPayable's shared breakdown. (The withdrawal request and settlement
// routes read the same set inside their transactions.)
import type { Firestore } from "firebase-admin/firestore";
import {
  computeVendorPayableBreakdown,
  type PayableItemRequest,
  type PayableLegacyReturn,
  type PayableOrder,
  type PayablePayout,
  type PayableSellerOrder,
  type PayableWithdrawal,
  type VendorPayableBreakdown,
} from "@/lib/vendorPayable";

export type VendorPayableInputs = {
  orders: PayableOrder[];
  payouts: PayablePayout[];
  withdrawals: PayableWithdrawal[];
  itemRequests: PayableItemRequest[];
  legacyReturns: PayableLegacyReturn[];
  sellerOrders: PayableSellerOrder[];
};

export async function loadVendorPayableInputs(
  db: Firestore,
  vendorUid: string
): Promise<VendorPayableInputs> {
  // The returns query is by status only (rules cannot scope it to a vendor),
  // then filtered to this seller's own orders so an unrelated order's return
  // never counts.
  const [orderSnap, payoutSnap, withdrawalSnap, itemReqSnap, legacyReturnSnap, sellerOrderSnap] =
    await Promise.all([
      db.collection("orders").where("vendorIds", "array-contains", vendorUid).get(),
      db.collection("vendor_payouts").where("vendorId", "==", vendorUid).get(),
      db.collection("withdrawals").where("vendorId", "==", vendorUid).get(),
      db.collection("itemRequests").where("vendorId", "==", vendorUid).get(),
      db.collection("returns").where("status", "==", "Refunded").get(),
      db.collection("sellerOrders").where("vendorId", "==", vendorUid).get(),
    ]);

  const orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  const orderIds = new Set(orders.map((o) => o.id));
  return {
    orders,
    payouts: payoutSnap.docs.map((d) => d.data()),
    withdrawals: withdrawalSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    itemRequests: itemReqSnap.docs.map((d) => d.data()),
    legacyReturns: legacyReturnSnap.docs
      .map((d) => d.data())
      .filter((r) => orderIds.has(String((r as { orderId?: unknown })?.orderId || ""))),
    sellerOrders: sellerOrderSnap.docs.map((d) => d.data()),
  };
}

export async function loadVendorPayableBreakdown(
  db: Firestore,
  vendorUid: string
): Promise<VendorPayableBreakdown> {
  const inputs = await loadVendorPayableInputs(db, vendorUid);
  return computeVendorPayableBreakdown({ vendorUid, ...inputs });
}


/**
 * The inputs for ONE seller's statement on ONE order (lib/sellerOrderStatement.ts),
 * or null when this seller may not see it: the order does not exist, has none
 * of the seller's items, or is still Pending (firestore.rules hide a Pending
 * order from its sellers until the admin confirms it). The seller identity is
 * always the verified caller — never a client-supplied id.
 */
export async function loadVendorOrderStatementInputs(
  db: Firestore,
  vendorUid: string,
  orderId: string
): Promise<{
  order: PayableOrder & { id: string };
  sellerOrder: PayableSellerOrder | null;
  itemRequests: PayableItemRequest[];
  legacyReturns: PayableLegacyReturn[];
} | null> {
  const orderSnap = await db.collection("orders").doc(orderId).get();
  if (!orderSnap.exists) return null;
  const data = orderSnap.data() || {};
  const items = Array.isArray(data.items) ? (data.items as { vendorId?: unknown }[]) : [];
  if (!items.some((item) => item?.vendorId === vendorUid)) return null;
  if (data.status === "Pending") return null;

  const [sellerOrderSnap, itemReqSnap, legacyReturnSnap] = await Promise.all([
    db.collection("sellerOrders").doc(`${orderId}_${vendorUid}`).get(),
    // Same query shape as loadVendorPayableInputs, then narrowed to this order.
    db.collection("itemRequests").where("vendorId", "==", vendorUid).get(),
    db.collection("returns").where("orderId", "==", orderId).get(),
  ]);

  return {
    order: { id: orderSnap.id, ...data },
    sellerOrder: sellerOrderSnap.exists ? (sellerOrderSnap.data() as PayableSellerOrder) : null,
    itemRequests: itemReqSnap.docs
      .map((d) => d.data())
      .filter((ir) => String((ir as { orderId?: unknown })?.orderId || "") === orderId),
    legacyReturns: legacyReturnSnap.docs.map((d) => d.data()),
  };
}
