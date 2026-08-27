// The single rule for how a customer picks a variant, shared by the product
// page (which offers the choices) and the server (which re-resolves the choice
// against the seller's own data before pricing it).
//
// Deliberately dependency-free — no Firebase, no React — exactly like
// lib/returnEligibility.ts and lib/orderTracking.ts, so the same logic runs in
// the browser and on the server and can be unit-tested directly.
//
// WHY THIS EXISTS: the seller's VariantSelector can create any dimension the
// category defines — Color, Capacity, RAM, Storage, Processor, Material, Pack
// Size — but the product page only ever read `Color`/`Shade` and `Size`. Six of
// eight categories therefore had dimensions a customer could not select, so a
// 1 L and a 1.5 L mixer grinder were the same unbuyable-apart product. Nothing
// here is category-aware: dimensions are read from the variants the seller
// actually saved, so a new category dimension works with no code change.

export interface SelectableVariant {
  id?: string;
  attributes?: Record<string, string> | null;
  stock?: number;
  price?: number;
}

/** A partial or complete choice: dimension name -> chosen value. */
export type VariantSelection = Record<string, string>;

// Presentation order for the dimensions we know about. Anything not listed —
// including dimensions added to CATEGORY_VARIANTS later — keeps the order it
// first appears in on the product's own variants, appended after these.
const PREFERRED_ORDER = [
  "Color",
  "Shade",
  "Size",
  "Capacity",
  "Pack Size",
  "RAM",
  "Storage",
  "Processor",
  "Material",
];

function attributesOf(variant: SelectableVariant): Record<string, string> {
  const raw = variant?.attributes;
  if (!raw || typeof raw !== "object") return {};

  const clean: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    // Blank values are not a choice — a variant saved with Size: "" must not
    // produce an empty button the customer is then forced to press.
    if (typeof value === "string" && value.trim() !== "") {
      clean[key] = value;
    }
  }
  return clean;
}

/**
 * Every dimension this product actually varies on, in display order.
 *
 * Derived from the variants themselves rather than from the category, so it
 * stays correct for a product whose seller filled in only some dimensions.
 */
export function variantDimensions(
  variants: SelectableVariant[] | null | undefined
): string[] {
  if (!Array.isArray(variants) || variants.length === 0) return [];

  const seen: string[] = [];
  for (const variant of variants) {
    for (const key of Object.keys(attributesOf(variant))) {
      if (!seen.includes(key)) seen.push(key);
    }
  }

  const known = PREFERRED_ORDER.filter((name) => seen.includes(name));
  const rest = seen.filter((name) => !PREFERRED_ORDER.includes(name));
  return [...known, ...rest];
}

/**
 * The values still available for one dimension, given what is already chosen.
 *
 * Progressive filtering: once Colour is Silver, only the capacities Silver
 * actually comes in are offered, so a combination the seller never listed
 * cannot be assembled. Choices for the dimension being asked about are
 * ignored, otherwise it would only ever offer back the current value.
 */
export function optionsForDimension(
  variants: SelectableVariant[] | null | undefined,
  dimension: string,
  selection: VariantSelection = {}
): string[] {
  if (!Array.isArray(variants)) return [];

  const values: string[] = [];

  for (const variant of variants) {
    const attrs = attributesOf(variant);
    const value = attrs[dimension];
    if (!value) continue;

    const compatible = Object.entries(selection).every(
      ([key, chosen]) => key === dimension || !chosen || attrs[key] === chosen
    );

    if (compatible && !values.includes(value)) values.push(value);
  }

  return values;
}

/** Whether every dimension this product varies on has been chosen. */
export function isSelectionComplete(
  variants: SelectableVariant[] | null | undefined,
  selection: VariantSelection = {}
): boolean {
  const dimensions = variantDimensions(variants);
  if (dimensions.length === 0) return true;
  return dimensions.every((d) => Boolean(selection[d]));
}

/**
 * The one variant matching a complete selection, or null.
 *
 * Null when the selection is incomplete, matches nothing, or is ambiguous —
 * two variants matching the same complete selection means the seller saved a
 * duplicate, and guessing which one the customer meant is worse than refusing.
 */
export function resolveVariant<T extends SelectableVariant>(
  variants: T[] | null | undefined,
  selection: VariantSelection = {}
): T | null {
  if (!Array.isArray(variants) || variants.length === 0) return null;
  if (!isSelectionComplete(variants, selection)) return null;

  const dimensions = variantDimensions(variants);

  const matches = variants.filter((variant) => {
    const attrs = attributesOf(variant);
    return dimensions.every((d) => attrs[d] === selection[d]);
  });

  return matches.length === 1 ? matches[0] : null;
}

/** Look a variant up by the id stored on a cart line or order item. */
export function findVariantById<T extends SelectableVariant>(
  variants: T[] | null | undefined,
  variantId: string | null | undefined
): T | null {
  if (!Array.isArray(variants) || !variantId) return null;
  return variants.find((v) => v.id === variantId) || null;
}

/**
 * The attributes of a variant, cleaned — what gets stored on a cart line and,
 * once the server has re-resolved it, on the order item.
 */
export function variantAttributes(
  variant: SelectableVariant | null | undefined
): Record<string, string> {
  return variant ? attributesOf(variant) : {};
}

/**
 * A short human label: "Silver / 1.5 L". Used wherever an order line needs to
 * say which variant it is without knowing the dimensions in advance.
 */
export function describeVariant(
  attributes: Record<string, string> | null | undefined,
  dimensionOrder?: string[]
): string {
  if (!attributes) return "";

  const entries = Object.entries(attributes).filter(
    ([, value]) => typeof value === "string" && value.trim() !== ""
  );
  if (entries.length === 0) return "";

  const order =
    dimensionOrder && dimensionOrder.length > 0
      ? dimensionOrder
      : [
          ...PREFERRED_ORDER.filter((n) => entries.some(([k]) => k === n)),
          ...entries.map(([k]) => k).filter((k) => !PREFERRED_ORDER.includes(k)),
        ];

  return order
    .map((key) => attributes[key])
    .filter((v) => typeof v === "string" && v.trim() !== "")
    .join(" / ");
}

/**
 * Legacy bridge: the flat size/color a cart line has always carried.
 *
 * Every existing order, every cart already in a customer's localStorage and
 * the mobile app all speak size/color, so those fields keep being written
 * alongside the new ones rather than being replaced. Shade maps onto color
 * because Beauty products use it as the same axis.
 */
export function legacySizeColor(attributes: Record<string, string>): {
  size: string;
  color: string;
} {
  // Only the two dimensions these fields have ever meant. Folding Capacity
  // or Pack Size into `size` would both mislabel them ("Size: 1 L") and, far
  // worse, make Silver/1 L and Silver/1.5 L collapse to the same legacy key —
  // which is the very ambiguity this work exists to remove. Every other
  // dimension lives in `attributes`, and identity comes from variantId.
  return {
    size: attributes.Size || "",
    color: attributes.Color || attributes.Shade || "",
  };
}

/**
 * Variant combinations the seller has saved more than once.
 *
 * Two variants are duplicates when EVERY dimension matches — not just Colour
 * and Size. The seller UI's own check compared against the category's field
 * list, so a dimension the category did not define (or a product whose
 * category changed after the variants were created) slipped through.
 *
 * Comparison is on the variants' own attribute keys, sorted, so
 * { Color, Capacity } and { Capacity, Color } are recognised as the same
 * combination regardless of insertion order.
 *
 * Returns one entry per duplicated combination, never a mutation: the caller
 * shows these to the seller and refuses the save. Silently merging or
 * renaming someone's variants would lose the per-variant stock they entered.
 */
export function findDuplicateVariantGroups(
  variants: SelectableVariant[] | null | undefined
): { label: string; count: number }[] {
  if (!Array.isArray(variants) || variants.length < 2) return [];

  const groups = new Map<string, { label: string; count: number }>();

  for (const variant of variants) {
    const attrs = attributesOf(variant);
    const keys = Object.keys(attrs).sort();

    // A variant with no attributes at all is not a meaningful combination to
    // compare — validateProduct has its own opinion about those.
    if (keys.length === 0) continue;

    const key = keys.map((k) => k + "\u0000" + attrs[k]).join("\u0001");
    const existing = groups.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      groups.set(key, {
        label: keys.map((k) => k + ": " + attrs[k]).join(", "),
        count: 1,
      });
    }
  }

  return [...groups.values()].filter((g) => g.count > 1);
}
