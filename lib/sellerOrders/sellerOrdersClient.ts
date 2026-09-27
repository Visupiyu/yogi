// Client entry points for the seller-scoped order views
// (app/api/seller/orders, lib/sellerOrders/sellerOrderView.ts). Sellers no
// longer read orders/{id} from the browser — firestore.rules deny it — so the
// seller list, dashboard, reports, analytics and onboarding checklist fetch
// these views instead.
import { auth } from "@/lib/firebase";
import type { SellerOrderSummary } from "@/lib/sellerOrders/sellerOrderView";

/** The signed-in seller's order summaries (newest first), or null on failure. */
export async function fetchSellerOrders(limit?: number): Promise<SellerOrderSummary[] | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    const res = await fetch(`/api/seller/orders${limit ? `?limit=${limit}` : ""}`, {
      headers: { Authorization: `Bearer ${await user.getIdToken()}` },
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    return Array.isArray(data?.orders) ? (data.orders as SellerOrderSummary[]) : null;
  } catch {
    return null;
  }
}

/** A Firestore-Timestamp-like wrapper for components that call .toDate() / read .seconds. */
export function timestampLike(iso: string | null): { seconds: number; toDate: () => Date } | null {
  const ms = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(ms) ? { seconds: Math.floor(ms / 1000), toDate: () => new Date(ms) } : null;
}

/**
 * A summary in the field names the existing seller widgets already read
 * (id, status, customerName, createdAt, items[].vendorId/price/qty). Built only
 * from the allow-listed view: its items are this seller's own lines, tagged
 * with their own uid so the widgets' per-seller filters keep working.
 */
export function toSellerOrderRow(o: SellerOrderSummary, vendorUid: string) {
  return {
    id: o.orderId,
    orderNumber: o.orderNumber,
    status: o.orderStatus,
    customerName: o.customerName,
    createdAt: timestampLike(o.createdAt),
    sellerShare: o.sellerShare,
    items: o.items.map((item) => ({ ...item, id: item.productId, vendorId: vendorUid })),
  };
}
