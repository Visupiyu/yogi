// ==========================================
// YOMICO Marketplace
// lib/products/pricing.ts
// ==========================================

export interface Pricing {

  mrp: number;

  sellingPrice: number;

  costPrice?: number;

  gst?: number;

  commission?: number;

  shippingCharge?: number;

  handlingCharge?: number;

  packingCharge?: number;

  platformFee?: number;

  taxIncluded?: boolean;

  currency: string;

}

export function calculateDiscount(

  mrp: number,

  sellingPrice: number

): number {

  if (mrp <= 0) return 0;

  return Math.round(

    ((mrp - sellingPrice) / mrp) * 100

  );

}

export function calculateGST(

  price: number,

  gst: number

): number {

  return Number(

    ((price * gst) / 100).toFixed(2)

  );

}

export function calculateCommission(

  sellingPrice: number,

  commission: number

): number {

  return Number(

    ((sellingPrice * commission) / 100).toFixed(2)

  );

}

export function calculateFinalPrice(

  sellingPrice: number,

  shipping: number = 0,

  handling: number = 0,

  packing: number = 0

): number {

  return Number(

    (

      sellingPrice +

      shipping +

      handling +

      packing

    ).toFixed(2)

  );

}

export function calculateVendorPayout(

  sellingPrice: number,

  commissionAmount: number,

  gstAmount: number = 0

): number {

  return Number(

    (

      sellingPrice -

      commissionAmount -

      gstAmount

    ).toFixed(2)

  );

}