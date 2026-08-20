import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

// Client-side entry point for the shared shipping rule. The constants, the
// ShippingSettings shape and calculateShippingCharge() itself now live in
// lib/shippingRules.ts so the server (lib/orderPricing.ts) can use the exact
// same logic without importing the client Firebase SDK this file pulls in.
// Re-exported here so existing client imports keep working unchanged.
import {
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_CHARGE,
  calculateShippingCharge,
  type ShippingSettings,
} from "@/lib/shippingRules";

export {
  FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_CHARGE,
  calculateShippingCharge,
  type ShippingSettings,
};

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

  // Delegates to the shared rule rather than re-deriving it, so this
  // helper cannot drift from what the cart, checkout and server charge.
  const shippingCharge = calculateShippingCharge(subtotal, {
    freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
    standardShippingCharge: STANDARD_SHIPPING_CHARGE,
  });

  const shippingMethod: ShippingMethod =
    shippingCharge === 0 ? "Free" : "Standard";

  const estimatedDays = 5;

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
