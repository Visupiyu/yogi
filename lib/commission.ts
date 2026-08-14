import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Used ONLY as computeVendorShare()'s fallback for orders that predate the
// commissionRate field entirely — placed before this feature shipped, when
// checkout unconditionally charged a hardcoded 10%. This preserves what
// those specific historical orders were actually charged; it must NEVER be
// used as the default for new orders. YOMICO's current business decision
// is a zero-commission launch period — see getEffectiveCommissionRate().
export const LEGACY_ORDER_COMMISSION_RATE = 0.1;

// Resolves settings/global's {commissionEnabled, commissionRate} down to
// the single number a new order should be charged. Defaults to 0 (no
// commission) in every case except an explicit, validly-configured,
// enabled rate — including when the settings doc doesn't exist yet, when
// commissionEnabled is false/absent, when commissionRate is malformed
// despite being enabled, and when the read itself fails. This fails toward
// the currently-promised "no commission" policy, deliberately the opposite
// direction from the legacy fallback above.
export async function getEffectiveCommissionRate(): Promise<number> {
  try {
    const snap = await getDoc(doc(db, "settings", "global"));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;

    if (data?.commissionEnabled !== true) return 0;

    const rate = data.commissionRate;
    return typeof rate === "number" && rate >= 0 && rate <= 1 ? rate : 0;
  } catch (error) {
    console.error(
      "Failed to load commission settings, defaulting to 0% (no charge):",
      error
    );
    return 0;
  }
}
