// SERVER-ONLY (Admin SDK). Loads one seller's dashboard analytics and order
// report for app/api/seller/analytics and app/api/seller/reports. The seller
// is always the verified caller's uid — never an id from the request — and
// every read is scoped to it:
//   - products where vendorId == uid (cut to lib/sellerAnalytics' stat shape);
//   - orders through lib/sellerOrders/sellerOrderViewServer.listSellerOrders,
//     the one place a seller's orders are read (own lines, own item value);
//   - money through lib/vendorPayableServer.loadVendorPayableBreakdown, the
//     same single settlement calculation as the wallet and withdrawals.
import type { Firestore } from "firebase-admin/firestore";
import { listSellerOrders } from "@/lib/sellerOrders/sellerOrderViewServer";
import { loadVendorPayableBreakdown } from "@/lib/vendorPayableServer";
import {
  buildSellerProductStat,
  buildSellerReport,
  summariseSellerOrders,
  summariseSellerProducts,
  type ReportRange,
  type SellerAnalytics,
  type SellerReport,
} from "@/lib/sellerAnalytics/sellerAnalytics";

/** Every order, not a page of them: totals must never silently cap. */
const ALL_ORDERS = Number.MAX_SAFE_INTEGER;

export async function loadSellerAnalytics(db: Firestore, vendorUid: string, nowMs = Date.now()): Promise<SellerAnalytics> {
  const [productSnap, orders, settlement] = await Promise.all([
    db.collection("products").where("vendorId", "==", vendorUid).get(),
    listSellerOrders(db, vendorUid, ALL_ORDERS),
    loadVendorPayableBreakdown(db, vendorUid),
  ]);
  const products = productSnap.docs
    // Defence in depth: the query already guarantees ownership.
    .filter((d) => d.get("vendorId") === vendorUid)
    .map((d) => buildSellerProductStat(d.id, d.data() || {}));
  return {
    generatedAt: new Date(nowMs).toISOString(),
    products: summariseSellerProducts(products),
    orders: summariseSellerOrders(orders, nowMs),
    settlement,
  };
}

export async function loadSellerReport(db: Firestore, vendorUid: string, range: ReportRange): Promise<SellerReport> {
  return buildSellerReport(await listSellerOrders(db, vendorUid, ALL_ORDERS), range);
}
