import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Canonical stored paymentMethod value for Pay on Delivery orders — the
// customer pays this exact amount to YOMICO's own UPI account directly;
// the delivery partner never receives or retains the money themselves.
export const PAY_ON_DELIVERY_UPI = "PAY_ON_DELIVERY_UPI";

export interface UpiSettings {
  upiEnabled: boolean;
  upiVpa: string;
  upiPayeeName: string;
}

// No real VPA is ever hardcoded here — until an admin sets one via
// Settings, upiEnabled stays false and upiVpa stays empty. Not a secret:
// a UPI VPA is meant to be handed to payers (same as a shop's printed QR
// code), so settings/global's existing public-read rule already covers
// this field correctly — see firestore.rules.
export async function getUpiSettings(): Promise<UpiSettings> {
  try {
    const snap = await getDoc(doc(db, "settings", "global"));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;

    return {
      upiEnabled: data?.upiEnabled === true,
      upiVpa: typeof data?.upiVpa === "string" ? data.upiVpa : "",
      upiPayeeName:
        typeof data?.upiPayeeName === "string" && data.upiPayeeName
          ? data.upiPayeeName
          : "YOMICO",
    };
  } catch (error) {
    console.error("Failed to load UPI settings:", error);
    return { upiEnabled: false, upiVpa: "", upiPayeeName: "YOMICO" };
  }
}

// Pure string construction — the standard UPI deep-link/QR payload. Safe
// to call from client or server: none of its inputs are secret (the VPA
// is meant to be given to payers; the amount is already the order's own
// server-verified paymentAmount, itself readable by whoever can read the
// order). No package needed beyond the QR renderer already in use
// elsewhere (react-qr-code) — this just produces the string it encodes.
export function buildUpiPaymentUri(params: {
  vpa: string;
  payeeName: string;
  amount: number;
  orderId: string;
}): string {
  const query = new URLSearchParams({
    pa: params.vpa,
    pn: params.payeeName,
    am: params.amount.toFixed(2),
    tn: `YOMICO Order ${params.orderId.slice(0, 8)}`,
    cu: "INR",
  });

  return `upi://pay?${query.toString()}`;
}
