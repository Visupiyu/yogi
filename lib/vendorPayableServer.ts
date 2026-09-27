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
