// SERVER-ONLY (Admin SDK). Loads the seller-scoped order views
// (lib/sellerOrders/sellerOrderView.ts) for app/api/seller/orders. Sellers no
// longer read orders/{id} directly — firestore.rules deny it — so these
// loaders are the one place an order reaches a seller, and every shape they
// return is the allow-listed view, never the stored document.
import type { Firestore } from "firebase-admin/firestore";
import {
  buildSellerOrderDetail,
  buildSellerOrderSummary,
  type SellerOrderDetail,
  type SellerOrderSummary,
} from "@/lib/sellerOrders/sellerOrderView";

/** Firestore-safe order id: no path separator, not a reserved id. */
export function isValidOrderId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length > 0 &&
    id.length <= 200 &&
    !id.includes("/") &&
    id !== "." &&
    id !== ".." &&
    !/^__.*__$/.test(id)
  );
}

/** Every order carrying this seller's items (newest first), as seller summaries. */
export async function listSellerOrders(
  db: Firestore,
  vendorUid: string,
  limit: number
): Promise<SellerOrderSummary[]> {
  const [ordersSnap, recordsSnap] = await Promise.all([
    db.collection("orders").where("vendorIds", "array-contains", vendorUid).get(),
    db.collection("sellerOrders").where("vendorId", "==", vendorUid).get(),
  ]);
  const records = new Map<string, Record<string, unknown>>();
  for (const d of recordsSnap.docs) {
    const r = d.data() as Record<string, unknown>;
    if (typeof r.orderId === "string") records.set(r.orderId, r);
  }
  const summaries: SellerOrderSummary[] = [];
  for (const d of ordersSnap.docs) {
    const view = buildSellerOrderSummary({
      orderId: d.id,
      order: d.data() as Record<string, unknown>,
      record: records.get(d.id) || null,
      vendorUid,
    });
    if (view) summaries.push(view);
  }
  summaries.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return summaries.slice(0, limit);
}

/** One order as this seller may see it, or null (unknown, not theirs, or Pending). */
export async function loadSellerOrderDetail(
  db: Firestore,
  vendorUid: string,
  orderId: string
): Promise<SellerOrderDetail | null> {
  if (!isValidOrderId(orderId)) return null;
  const [orderSnap, recordSnap] = await Promise.all([
    db.collection("orders").doc(orderId).get(),
    db.collection("sellerOrders").doc(`${orderId}_${vendorUid}`).get(),
  ]);
  if (!orderSnap.exists) return null;
  return buildSellerOrderDetail({
    orderId,
    order: orderSnap.data() as Record<string, unknown>,
    record: recordSnap.exists ? (recordSnap.data() as Record<string, unknown>) : null,
    vendorUid,
  });
}
