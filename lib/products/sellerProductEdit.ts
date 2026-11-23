// What ProductForm SENDS when a seller edits an existing product (F-10).
//
// The edit form's state is the form defaults overlaid with the stored product
// (`{ ...defaultProduct, ...existingProduct }`), so a legacy product that
// never had an MRP, a cost price or variants shows — and used to SEND — the
// defaults `mrp: 0`, `costPrice: 0`, `variants: []`. app/api/seller/
// update-product treats any SENT price field that differs from what is stored
// as an intentional edit and validates it strictly (it does not normalize),
// so a stock-only save of such a product would be refused for "MRP 0".
//
// The fix is on the sending side: a money field is left OUT of the payload
// only when the stored product never had it AND the form still holds the
// exact default it filled in — i.e. the seller did not touch it. Anything the
// seller did enter (an MRP, even an invalid one such as -5; a cleared variant
// list on a product that HAD variants) is sent and the server judges it.
//
// Pure and dependency-light (client and tests import it).

import { pickSellerProductFields } from "@/lib/products/sellerProductFields";
import { PRICE_POLICY_FIELDS } from "@/lib/products/sellerProductValidation";

/**
 * The money-field defaults ProductForm fills in (defaultProduct). Single
 * source: the form spreads this, and the omission rule below compares to it.
 */
export const PRODUCT_FORM_MONEY_DEFAULTS = {
  mrp: 0,
  sellingPrice: 0,
  costPrice: 0,
  discount: 0,
  variants: [] as unknown[],
};

/** The money fields a legacy product may lack, and so may carry a form default. */
const LEGACY_MONEY_FIELDS = ["mrp", "sellingPrice", "price", "costPrice", "variants"] as const;

function isAbsent(value: unknown): boolean {
  return value === undefined || value === null;
}

function isFormDefault(field: (typeof LEGACY_MONEY_FIELDS)[number], value: unknown): boolean {
  if (field === "variants") return Array.isArray(value) && value.length === 0;
  if (field === "price") return value === undefined; // not a form field: never defaulted
  return value === PRODUCT_FORM_MONEY_DEFAULTS[field];
}

/**
 * True when `field` is a money field the stored product never had and the
 * form value is still the untouched default for it.
 */
export function isUntouchedLegacyMoneyField(
  existing: Record<string, unknown>,
  field: (typeof LEGACY_MONEY_FIELDS)[number],
  formValue: unknown
): boolean {
  return isAbsent(existing[field]) && isFormDefault(field, formValue);
}

/**
 * The update-product payload for an edit: the seller product fields of the
 * form state, minus any money field the product never had that the seller
 * left at the form default. The client `discount` is still sent (the form
 * previews it) and is ignored by the server, which derives its own.
 */
export function sellerEditPayload(
  existing: Record<string, unknown>,
  formProduct: Record<string, unknown>
): Record<string, unknown> {
  const payload = pickSellerProductFields(formProduct);
  for (const field of LEGACY_MONEY_FIELDS) {
    if (field in payload && isUntouchedLegacyMoneyField(existing, field, payload[field])) {
      delete payload[field];
    }
  }
  return payload;
}

/**
 * Whether this payload edits a price-policy field — the same exact diff
 * update-product applies (a field that is sent and differs from what is
 * stored). Drives the form's early pricing check.
 */
export function editTouchesPricing(
  existing: Record<string, unknown>,
  payload: Record<string, unknown>
): boolean {
  return PRICE_POLICY_FIELDS.some(
    (f) => f in payload && payload[f] !== undefined && JSON.stringify(existing[f]) !== JSON.stringify(payload[f])
  );
}
