import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Fallback defaults — used whenever settings/global is missing, unreadable,
// or has a malformed field, so a bad/absent settings doc can never break
// checkout. Admin-configurable value lives in Firestore; see getShippingSettings().
export const FREE_SHIPPING_THRESHOLD = 499;

export const STANDARD_SHIPPING_CHARGE = 49;

export interface ShippingSettings {
  freeShippingThreshold: number;
  standardShippingCharge: number;
}

export async function getShippingSettings(): Promise<ShippingSettings> {
  try {
    const snap = await getDoc(doc(db, "settings", "global"));
    const data = snap.exists() ? (snap.data() as Record<string, unknown>) : null;

    return {
      freeShippingThreshold:
        typeof data?.freeShippingThreshold === "number"
          ? data.freeShippingThreshold
          : FREE_SHIPPING_THRESHOLD,
      standardShippingCharge:
        typeof data?.standardShippingCharge === "number"
          ? data.standardShippingCharge
          : STANDARD_SHIPPING_CHARGE,
    };
  } catch (error) {
    console.error("Failed to load shipping settings, using defaults:", error);
    return {
      freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
      standardShippingCharge: STANDARD_SHIPPING_CHARGE,
    };
  }
}

export type ShippingMethod =
  | "Standard"
  | "Express"
  | "Same Day"
  | "Free";

export interface ShippingDetails {

  subtotal: number;

  shippingCharge: number;

  shippingMethod: ShippingMethod;

  estimatedDays: number;

  estimatedDelivery: Date;

}

export function calculateShipping(
  subtotal: number
): ShippingDetails {

  const today = new Date();

  let shippingCharge = STANDARD_SHIPPING_CHARGE;

  let shippingMethod: ShippingMethod = "Standard";

  const estimatedDays = 5;

  if (subtotal >= FREE_SHIPPING_THRESHOLD) {

    shippingCharge = 0;

    shippingMethod = "Free";

  }

  const estimatedDelivery = new Date(today);

  estimatedDelivery.setDate(
    estimatedDelivery.getDate() + estimatedDays
  );

  return {

    subtotal,

    shippingCharge,

    shippingMethod,

    estimatedDays,

    estimatedDelivery,

  };

}

export function calculateGrandTotal(

  subtotal: number,

  shipping: number,

  discount: number = 0,

  rewardDiscount: number = 0

): number {

  return Math.max(

    0,

    subtotal + shipping - discount - rewardDiscount

  );

}

export function getRemainingForFreeShipping(
  subtotal: number
): number {

  return Math.max(

    0,

    FREE_SHIPPING_THRESHOLD - subtotal

  );

}

export function qualifiesForFreeShipping(
  subtotal: number
): boolean {

  return subtotal >= FREE_SHIPPING_THRESHOLD;

}

export function formatDeliveryDate(
  date: Date
): string {

  return date.toLocaleDateString("en-IN", {

    day: "numeric",

    month: "short",

    year: "numeric",

  });

}
