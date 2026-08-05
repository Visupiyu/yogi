export const FREE_SHIPPING_THRESHOLD = 999;

export const STANDARD_SHIPPING_CHARGE = 99;

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

  let estimatedDays = 5;

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