import { YOMICO_COMMISSION_RATE } from "@/lib/commissionPolicy";

// YOMICO charges sellers NO commission — see lib/commissionPolicy.ts. The
// legacy 10% LEGACY_ORDER_COMMISSION_RATE fallback has been removed: an order
// without a commissionRate is charged ₹0 like every other order.
//
// Browser-side twin of the server rate, kept for app/checkout/page.tsx. It no
// longer reads settings/global at all: no admin setting can create commission.
export async function getEffectiveCommissionRate(): Promise<number> {
  return YOMICO_COMMISSION_RATE;
}
