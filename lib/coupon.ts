export interface Coupon {

  code: string;

  title: string;

  description?: string;

  discountType: "PERCENTAGE" | "FLAT";

  discountValue: number;

  minimumOrder: number;

  maximumDiscount: number;

  active: boolean;

  expiryDate?: Date;

  usageLimit?: number;

  usedCount?: number;

}

export interface CouponResult {

  valid: boolean;

  discount: number;

  finalAmount: number;

  message: string;

}

export function validateCoupon(

  coupon: Coupon,

  orderAmount: number

): CouponResult {

  if (!coupon.active) {

    return {

      valid: false,

      discount: 0,

      finalAmount: orderAmount,

      message: "Coupon is inactive.",

    };

  }

  if (
    coupon.expiryDate &&
    coupon.expiryDate < new Date()
  ) {

    return {

      valid: false,

      discount: 0,

      finalAmount: orderAmount,

      message: "Coupon has expired.",

    };

  }

  if (orderAmount < coupon.minimumOrder) {

    return {

      valid: false,

      discount: 0,

      finalAmount: orderAmount,

      message: `Minimum order value is ₹${coupon.minimumOrder}.`,

    };

  }

  let discount = 0;

  if (coupon.discountType === "PERCENTAGE") {

    discount =
      (orderAmount * coupon.discountValue) / 100;

    if (discount > coupon.maximumDiscount) {

      discount = coupon.maximumDiscount;

    }

  } else {

    discount = coupon.discountValue;

  }

  return {

    valid: true,

    discount,

    finalAmount: Math.max(
      0,
      orderAmount - discount
    ),

    message: "Coupon applied successfully.",

  };

}

export function canUseCoupon(
  coupon: Coupon
): boolean {

  if (!coupon.active) return false;

  if (
    coupon.expiryDate &&
    coupon.expiryDate < new Date()
  ) {
    return false;
  }

  if (
    coupon.usageLimit !== undefined &&
    coupon.usedCount !== undefined &&
    coupon.usedCount >= coupon.usageLimit
  ) {
    return false;
  }

  return true;

}

export function increaseCouponUsage(
  coupon: Coupon
): Coupon {

  return {

    ...coupon,

    usedCount:
      (coupon.usedCount || 0) + 1,

  };

}