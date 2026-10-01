// "Order again" planner (client + test safe, no I/O).
//
// Turns ONE historical order item plus the product's CURRENT document into
// either a cart-ready line or the reason it cannot be added. The order item is
// only a record of what was bought — it carries no stock, and its price and name
// may be out of date — so everything that decides "can this be added, and how
// many" comes from the live product, never from the order.
//
// The server rule is unchanged and mirrored exactly (lib/orderPricing.ts):
//   * a product whose stock lives on its variants is variant-ordered ONLY — a
//     line must carry the seller's real variantId;
//   * a variantId that no longer exists on the product is refused.
// The client never invents or substitutes a variant: an order item that has a
// variantId keeps exactly that one, and an item that has none for a product that
// now needs one is skipped (the customer must choose on the product page).
import type { AddToCartOptions } from "@/lib/cart";
import { hasStockBearingVariants } from "@/lib/products/inventory";
import {
  effectiveVariantPrice,
  findVariantById,
  variantAttributes,
} from "@/lib/products/variantSelection";
import { isProductVisible } from "@/lib/products/visibility";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";

export type ReorderOrderItem = {
  id?: string;
  name?: string;
  qty?: number | string;
  size?: string;
  color?: string;
  variantId?: string;
  attributes?: Record<string, string>;
};

export type ReorderSkipReason =
  | "unavailable" // product deleted, blocked or not for sale
  | "option-unavailable" // the exact variant it was bought in no longer exists
  | "needs-options" // product now has variants and the old item named none
  | "out-of-stock"; // nothing (or none of that variant) left

export type ReorderPlan =
  | { ok: true; product: ReturnType<typeof toLegacyProduct>; options: AddToCartOptions }
  | { ok: false; reason: ReorderSkipReason };

export function planReorderLine(
  item: ReorderOrderItem,
  productData: unknown | null
): ReorderPlan {
  const id = typeof item?.id === "string" ? item.id : "";
  if (!id || !productData || typeof productData !== "object") {
    return { ok: false, reason: "unavailable" };
  }
  const data = productData as Record<string, any>;
  if (!isProductVisible(data)) return { ok: false, reason: "unavailable" };

  const variantId =
    typeof item.variantId === "string" && item.variantId ? item.variantId : "";
  const variants = Array.isArray(data.variants) ? data.variants : [];

  let variant: { stock?: unknown } | null = null;
  let available: number;

  if (variantId) {
    // Keep the exact variant the customer bought; never substitute another.
    variant = findVariantById(variants, variantId);
    if (!variant) return { ok: false, reason: "option-unavailable" };
    available = Number(variant.stock);
  } else if (hasStockBearingVariants(data.variants)) {
    // Variant products are variant-ordered only — an item with no variant cannot
    // be added, and we must not guess which one the customer would want now.
    return { ok: false, reason: "needs-options" };
  } else {
    available = Number(data.stock);
  }

  if (!Number.isFinite(available) || available <= 0) {
    return { ok: false, reason: "out-of-stock" };
  }

  const requested = Math.max(1, Math.floor(Number(item.qty)) || 1);
  const qty = Math.min(requested, Math.floor(available));

  const live = toLegacyProduct(id, data);
  return {
    ok: true,
    // `stock` is the CURRENT figure for what is being added (the variant's own
    // stock for a variant line), so lib/cart.ts caps the merged quantity on it.
    product: { ...live, stock: Math.floor(available) },
    options: {
      qty,
      size: item.size,
      color: item.color,
      ...(variant ? { variantId, attributes: variantAttributes(variant as never) } : {}),
      unitPrice: effectiveVariantPrice(Number(live.price), variant),
    },
  };
}
