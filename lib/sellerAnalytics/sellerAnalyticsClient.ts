// Browser helpers for the seller dashboard, analytics and reports screens.
// All aggregation happens on the server (app/api/seller/analytics,
// app/api/seller/reports); these screens no longer read products, reviews or
// orders from Firestore themselves.
import { auth } from "@/lib/firebase";
import type { SellerAnalytics, SellerReport } from "@/lib/sellerAnalytics/sellerAnalytics";

async function getJson<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  const user = auth.currentUser;
  if (!user) return { data: null, error: "Please sign in." };
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await user.getIdToken()}` } });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: typeof body?.error === "string" ? body.error : "Something went wrong." };
    return { data: body as T, error: null };
  } catch {
    return { data: null, error: "Network error. Please try again." };
  }
}

/** The signed-in seller's dashboard/analytics figures. */
export function fetchSellerAnalytics() {
  return getJson<SellerAnalytics>("/api/seller/analytics");
}

/** The signed-in seller's order report; from/to are optional YYYY-MM-DD (IST days, inclusive). */
export function fetchSellerReport(range: { from?: string; to?: string } = {}) {
  const q = new URLSearchParams();
  if (range.from) q.set("from", range.from);
  if (range.to) q.set("to", range.to);
  const qs = q.toString();
  return getJson<SellerReport>(`/api/seller/reports${qs ? `?${qs}` : ""}`);
}
