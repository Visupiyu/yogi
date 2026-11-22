// ==========================================
// YOMICO Marketplace
// lib/orderInventory.ts
// ==========================================
//
// Cancellation inventory evidence: did this order ACTUALLY take stock (and
// count sales) when it was created? app/api/cancel-order restores inventory
// only when it can prove that, so a cancellation never creates stock that was
// never removed, and never drives a sales counter below zero.
//
// The evidence is the order's `rewardPointsStatus`:
//   * every server creation path — app/api/place-order, lib/onlineOrder,
//     app/api/mobile/place-order, lib/mobileOnlineOrder — writes
//     rewardPointsStatus: "pending" in the SAME transaction that decrements
//     product stock and increments sales (since 2026-08-26);
//   * the only other writer (lib/rewardCreditServer) moves "pending" to
//     "credited", and only from "pending" (lib/rewardCredit
//     evaluateRewardCredit);
//   * no client may create an order (firestore.rules: orders `allow create:
//     if false`) or change the field (orderRewardStateUnchanged()).
// So "pending"/"credited" proves an atomic server deduction. Anything else —
// absent (the pre-2026-08-20 browser checkout, whose stock/sales writes were
// separate and errors were swallowed), or an unexpected value — is
// UNVERIFIED and must not be reversed.
//
// Dependency-free: safe for routes and tests.

export type InventoryDeductionEvidence = "server-atomic" | "unverified";

export function inventoryDeductionEvidence(order: unknown): InventoryDeductionEvidence {
  const status = (order as { rewardPointsStatus?: unknown } | null | undefined)?.rewardPointsStatus;
  return status === "pending" || status === "credited" ? "server-atomic" : "unverified";
}

/**
 * How much to take off a product's `sales` when `restored` units go back to
 * stock: never more than the counter holds, so it cannot go negative. The
 * stock restored is NOT reduced by this floor — the deduction is proven; a
 * low counter is an anomaly to record, not a reason to lose stock.
 */
export function flooredSalesDecrement(
  currentSales: unknown,
  restored: number
): { decrement: number; floorApplied: boolean } {
  const want = Number.isFinite(restored) && restored > 0 ? restored : 0;
  const cur = Number(currentSales);
  const available = Number.isFinite(cur) && cur > 0 ? cur : 0;
  const decrement = Math.min(want, available);
  return { decrement, floorApplied: decrement < want };
}
