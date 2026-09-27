// Browser helper: the signed-in seller's payable breakdown from the server's
// single calculation (app/api/seller/payable -> lib/vendorPayable). Seller
// screens read their money figures from here instead of re-deriving them.
import { auth } from "@/lib/firebase";
import type { VendorPayableBreakdown } from "@/lib/vendorPayable";

export async function fetchSellerPayableBreakdown(): Promise<VendorPayableBreakdown | null> {
  const token = await auth.currentUser?.getIdToken();
  if (!token) return null;
  const res = await fetch("/api/seller/payable", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => null);
  return res.ok && data?.breakdown ? (data.breakdown as VendorPayableBreakdown) : null;
}
