// Dependency-free validation of the price/stock/tax fields a SELLER controls on
// a product document. Shared by the two trusted server write paths —
// app/api/seller/create-product and app/api/seller/update-product — and by
// ProductForm as an early, identical client-side check (so images are not
// uploaded for a product the server will refuse). The client check is a
// convenience only; the server routes are the enforcement, and firestore.rules
// denies sellers any direct client write to these fields.
//
// Every numeric field must already BE a finite number of the right kind. Null,
// NaN, Infinity, strings and fractions (where an integer is required) are
// rejected — nothing is coerced into a valid-looking value.
//
// Validated against the WHOLE resulting document (on update: the stored
// product merged with the edit), so an edit cannot leave an invalid value
// behind in a field it did not touch without being told about it.

import { MAX_RETURN_DAYS, MIN_RETURN_DAYS, isValidReturnDays } from "@/lib/returnEligibility";

/** The GST slabs the seller form offers (app/seller/components/ProductForm). */
export const GST_SLABS: readonly number[] = [0, 5, 12, 18, 28];

/**
 * YOMICO's minimum selling price for a listed product, in rupees. A LISTING
 * policy applied to sellingPrice, a seller-sent legacy `price` and every
 * priced variant (validateSellerProductPricing below). It is NOT the
 * free-delivery threshold (lib/shippingRules.ts FREE_SHIPPING_THRESHOLD),
 * which happens to share the value — the two must be able to change
 * independently, so neither is derived from the other.
 */
export const MIN_SELLING_PRICE = 499;

/**
 * The fields whose change on an update re-runs the pricing policy. A
 * stock-only or content-only edit of a legacy product (e.g. one listed before
 * MRP was mandatory) is not forced to reprice first; creation always runs it.
 */
export const PRICE_POLICY_FIELDS = ["mrp", "sellingPrice", "price", "variants"] as const;

export function pricePolicyFieldsChanged(changes: Record<string, unknown>): boolean {
  return PRICE_POLICY_FIELDS.some((f) => Object.prototype.hasOwnProperty.call(changes, f));
}

/**
 * The product's discount percentage, derived ONLY from its MRP and selling
 * price — the same rounding every display uses (lib/products/pricing.ts
 * calculateDiscount, lib/products/helpers.ts getDiscountPercentage, the
 * storefront min-discount filter). 0 whenever there is no genuine discount
 * (no valid MRP, no valid price, or price >= MRP), so a stored badge figure
 * can never claim more than MRP and price support. The server writes this on
 * every create and update; a client-sent `discount` is never stored.
 */
export function deriveDiscountPercent(mrp: unknown, sellingPrice: unknown): number {
  if (!isFiniteNumber(mrp) || mrp <= 0) return 0;
  if (!isFiniteNumber(sellingPrice) || sellingPrice <= 0 || sellingPrice >= mrp) return 0;
  return Math.round(((mrp - sellingPrice) / mrp) * 100);
}

export type SellerProductValidation =
  | { ok: true }
  | { ok: false; errors: string[] };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function has(product: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(product, key) && product[key] !== undefined;
}

export function validateSellerProductMoney(
  product: Record<string, unknown>
): SellerProductValidation {
  const errors: string[] = [];

  // sellingPrice — the base price every checkout path charges. Required, > 0.
  if (!isFiniteNumber(product.sellingPrice) || product.sellingPrice <= 0) {
    errors.push("Selling price must be a number greater than zero.");
  }

  // price — a legacy field some products still carry; the mobile checkout
  // reads it before sellingPrice. Optional, but when present it must be a
  // valid positive price, never zero/negative/non-numeric.
  if (has(product, "price")) {
    if (!isFiniteNumber(product.price) || product.price <= 0) {
      errors.push("Price must be a number greater than zero.");
    }
  }

  // mrp — display/discount basis. Optional here, but numeric when present.
  if (has(product, "mrp")) {
    if (!isFiniteNumber(product.mrp) || product.mrp < 0) {
      errors.push("MRP must be a number of zero or more.");
    }
  }

  // costPrice — the seller's own cost figure. Optional, but numeric and never
  // negative when present.
  if (has(product, "costPrice")) {
    if (!isFiniteNumber(product.costPrice) || product.costPrice < 0) {
      errors.push("Cost price must be a number of zero or more.");
    }
  }

  // stock — whole units only.
  if (!isNonNegativeInteger(product.stock)) {
    errors.push("Stock must be a whole number of zero or more.");
  }

  // gstRate — the product's GST slab, required at listing.
  if (!isFiniteNumber(product.gstRate) || !GST_SLABS.includes(product.gstRate)) {
    errors.push(`GST rate must be one of ${GST_SLABS.join(", ")}.`);
  }

  // gstPercent — the field the mobile checkout reads. Optional, but when
  // present it must use the same slabs.
  if (has(product, "gstPercent")) {
    if (!isFiniteNumber(product.gstPercent) || !GST_SLABS.includes(product.gstPercent)) {
      errors.push(`GST percent must be one of ${GST_SLABS.join(", ")}.`);
    }
  }

  // variants — per-variant price (0 = "use the product price") and stock.
  if (has(product, "variants")) {
    if (!Array.isArray(product.variants)) {
      errors.push("Variants must be a list.");
    } else {
      product.variants.forEach((variant: unknown, index: number) => {
        const label = `Variant ${index + 1}`;
        if (!variant || typeof variant !== "object" || Array.isArray(variant)) {
          errors.push(`${label} is not valid.`);
          return;
        }
        const v = variant as Record<string, unknown>;
        if (!isFiniteNumber(v.price) || v.price < 0) {
          errors.push(`${label}: price must be a number of zero or more.`);
        }
        if (!isNonNegativeInteger(v.stock)) {
          errors.push(`${label}: stock must be a whole number of zero or more.`);
        }
      });
    }
  }

  // returnDays — the product's return window (whole days). Optional: a
  // product without one sells with the platform default. When present it must
  // be in range; it is snapshotted onto each order line at order creation.
  if (has(product, "returnDays") && !isValidReturnDays(product.returnDays)) {
    errors.push(`Return days must be a whole number from ${MIN_RETURN_DAYS} to ${MAX_RETURN_DAYS}.`);
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

/**
 * The MRP / selling-price policy (F-10), on top of validateSellerProductMoney's
 * per-field checks:
 *   - MRP is mandatory: a finite number greater than zero;
 *   - sellingPrice is within [MIN_SELLING_PRICE, MRP];
 *   - every PRICED variant (price 0 = "use the product price") is within
 *     [MIN_SELLING_PRICE, MRP] — there is no per-variant MRP, so the product's
 *     MRP applies to each;
 *   - a legacy `price` is within [MIN_SELLING_PRICE, MRP] when
 *     `checkLegacyPrice` (the seller is setting it: on create, or an update
 *     that changes it). Checkout charges sellingPrice, so a stored legacy
 *     value the form cannot edit never blocks an unrelated price edit.
 * Runs on the WHOLE resulting document. create-product always runs it;
 * update-product runs it when the edit changes a PRICE_POLICY_FIELDS field.
 */
export function validateSellerProductPricing(
  product: Record<string, unknown>,
  options: { checkLegacyPrice: boolean }
): SellerProductValidation {
  const errors: string[] = [];
  const floor = MIN_SELLING_PRICE;

  const mrp = product.mrp;
  const mrpOk = isFiniteNumber(mrp) && mrp > 0;
  if (!mrpOk) errors.push("MRP is required and must be a number greater than zero.");

  const inPolicy = (label: string, value: unknown) => {
    if (!isFiniteNumber(value)) return; // reported by validateSellerProductMoney
    if (value < floor) errors.push(`${label} must be at least ₹${floor}.`);
    if (mrpOk && value > (mrp as number)) errors.push(`${label} cannot be more than the MRP (₹${mrp}).`);
  };

  if (!isFiniteNumber(product.sellingPrice)) {
    errors.push("Selling price must be a number.");
  } else {
    inPolicy("Selling price", product.sellingPrice);
  }

  if (options.checkLegacyPrice && has(product, "price")) inPolicy("Price", product.price);

  if (Array.isArray(product.variants)) {
    product.variants.forEach((variant: unknown, index: number) => {
      const v = (variant && typeof variant === "object" ? variant : {}) as Record<string, unknown>;
      if (v.price === 0) return; // uses the product's own price
      inPolicy(`Variant ${index + 1} price`, v.price);
    });
  }

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
