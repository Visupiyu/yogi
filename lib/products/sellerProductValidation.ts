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

/** The GST slabs the seller form offers (app/seller/components/ProductForm). */
export const GST_SLABS: readonly number[] = [0, 5, 12, 18, 28];

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

  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}
