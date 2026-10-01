export interface CartItem {
  id: string;
  name: string;
  price: number;
  mrp?: number;
  image?: string;
  stock: number;
  qty: number;
  size?: string;
  color?: string;
  vendorId?: string;
  vendorName?: string;

  // The seller's own variant id, and that variant's full attribute map.
  //
  // size/color above only ever covered two dimensions, so an appliance sold in
  // 1 L and 1.5 L produced two cart lines that were indistinguishable. Identity
  // now comes from variantId, and `attributes` carries every dimension —
  // Capacity, RAM, Storage, Processor, Material, Pack Size — for display.
  //
  // Both optional: carts already sitting in a customer's localStorage, and the
  // mobile app, have neither. Lines without a variantId keep matching on
  // id+size+color exactly as before.
  variantId?: string;
  attributes?: Record<string, string>;
}

export interface AddToCartOptions {
  qty: number;
  size?: string;
  color?: string;
  variantId?: string;
  attributes?: Record<string, string>;

  // The effective unit price the caller resolved for this selection — a
  // positive per-variant price when one applies, otherwise the product's
  // sellingPrice (the same rule the server enforces in lib/orderPricing.ts).
  // Optional and display-only: when omitted the line falls back to the
  // product's own price, so existing call sites and stored carts are
  // unaffected. The server ALWAYS re-prices authoritatively from the product
  // document at checkout — this value is never trusted for the final charge.
  unitPrice?: number;
}

/**
 * Whether a stored line is the same purchasable thing as the one described.
 *
 * A variantId on BOTH sides is authoritative — that is the seller's own
 * identity for the combination. When neither has one this falls back to the
 * historical id+size+color match, so pre-existing carts keep working. A line
 * that has a variantId is deliberately NOT merged with one that lacks it: they
 * may be different variants that happen to share a colour, and silently
 * combining them would reintroduce the ambiguity this change removes.
 */
export function isSameLine(
  item: CartItem,
  target: {
    id: string;
    variantId?: string;
    size?: string;
    color?: string;
  }
): boolean {
  if (item.id !== target.id) return false;

  const stored = item.variantId || "";
  const wanted = target.variantId || "";

  if (stored || wanted) return stored === wanted;

  return item.size === target.size && item.color === target.color;
}

/**
 * The single place a purchasable line is shaped (id, price, stock, qty, variant
 * identity). Used by addToCart for the persistent cart and by Buy Now for its
 * one-line checkout, so both produce identical lines. Pure: touches no storage.
 */
export function buildCartLine(
  product: any,
  options: AddToCartOptions
): CartItem {
  const addQty = Math.max(1, Math.floor(Number(options.qty)) || 1);
  const rawStock = Number(product.stock);
  const liveStock = Number.isFinite(rawStock) ? Math.max(0, rawStock) : null;

  return {
    id: product.id,
    name: product.name ?? "",
    // Prefer the caller-resolved effective unit price; fall back to the
    // product's own price for callers that don't pass one. Display state
    // only — the server re-prices from the product document at checkout.
    price:
      typeof options.unitPrice === "number" && options.unitPrice > 0
        ? options.unitPrice
        : product.price ?? 0,
    mrp: product.mrp,
    image: product.image,
    stock: liveStock ?? 0,
    qty: liveStock !== null && liveStock > 0 ? Math.min(addQty, liveStock) : addQty,
    size: options.size,
    color: options.color,
    vendorId: product.vendorId ?? "",
    vendorName: product.vendorName ?? "",
    // Omitted entirely rather than written as undefined, so a line for a
    // product with no variants stays byte-identical to what it was before.
    ...(options.variantId ? { variantId: options.variantId } : {}),
    ...(options.attributes && Object.keys(options.attributes).length > 0
      ? { attributes: options.attributes }
      : {}),
  };
}

export function addToCart(
  product: any,
  options: AddToCartOptions
): boolean {

  if (!product) return false;

  const cart: CartItem[] = JSON.parse(
    localStorage.getItem("cart") || "[]"
  );

  const index = cart.findIndex((item) =>
    isSameLine(item, {
      id: product.id,
      variantId: options.variantId,
      size: options.size,
      color: options.color,
    })
  );

  // Quantity/stock are sanitised once here so no caller can write a NaN, zero or
  // negative quantity into the cart. `product.stock` is the CURRENT stock when
  // the caller has the product (product page, Quick View, reorder); a caller
  // that has none (undefined/NaN) simply gets no cap here — the cart page and the
  // server still enforce stock — instead of Math.min(..., undefined) === NaN.
  const addQty = Math.max(1, Math.floor(Number(options.qty)) || 1);
  const rawStock = Number(product.stock);
  const liveStock = Number.isFinite(rawStock) ? Math.max(0, rawStock) : null;

  if (index > -1) {

    const merged = cart[index].qty + addQty;
    cart[index].qty = Math.max(
      1,
      liveStock !== null ? Math.min(merged, liveStock) : merged
    );
    // Keep the stored stock current so the cart's + button caps on today's
    // figure, not the one captured when the line was first added.
    if (liveStock !== null) cart[index].stock = liveStock;

  } else {

    cart.push(buildCartLine(product, options));

  }

  localStorage.setItem(
    "cart",
    JSON.stringify(cart)
  );

  window.dispatchEvent(
    new Event("cartUpdated")
  );

  return true;
}
export function getCartItems(): CartItem[] {

  if (typeof window === "undefined") {
    return [];
  }

  return JSON.parse(
    localStorage.getItem("cart") || "[]"
  );

}
export function getCartCount(): number {

  const cart = getCartItems();

  return cart.reduce(
    (total, item) => total + item.qty,
    0
  );

}
export function removeFromCart(
  id: string,
  size?: string,
  color?: string,
  variantId?: string
): void {

  const cart = getCartItems();

  const updatedCart = cart.filter(
    (item) => !isSameLine(item, { id, variantId, size, color })
  );

  localStorage.setItem(
    "cart",
    JSON.stringify(updatedCart)
  );

  window.dispatchEvent(
    new Event("cartUpdated")
  );

}
export function updateCartQuantity(
  id: string,
  qty: number,
  size?: string,
  color?: string,
  variantId?: string
): void {

  const cart = getCartItems();

  const updatedCart = cart.map((item) => {

    if (isSameLine(item, { id, variantId, size, color })) {
      return {
        ...item,
        // A stored line without a numeric stock (older carts, bundle adds) must
        // not turn the quantity into NaN: with no usable cap the requested
        // quantity stands (the server still enforces stock at checkout).
        qty: Math.max(
          1,
          Number.isFinite(Number(item.stock))
            ? Math.min(Math.floor(Number(qty)) || 1, Number(item.stock))
            : Math.floor(Number(qty)) || 1
        ),
      };
    }

    return item;

  });

  localStorage.setItem(
    "cart",
    JSON.stringify(updatedCart)
  );

  window.dispatchEvent(
    new Event("cartUpdated")
  );

}
export function getCartTotal(): number {

  const cart = getCartItems();

  return cart.reduce(
    (total, item) => total + item.price * item.qty,
    0
  );

}
export function clearCart(): void {

  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("cart");

  window.dispatchEvent(
    new Event("cartUpdated")
  );

}

/**
 * Buy Now (product page) checks out ONE line from "checkoutItems" and marks it
 * with checkoutSource="buyNow"; a cart checkout (app/cart) clears that marker.
 * After an order is placed, a cart checkout empties the cart, but a Buy Now
 * checkout only discards its own one-line list — the customer's cart is left
 * exactly as it was.
 */
export function clearCheckoutAfterOrder(source?: string | null): void {
  // `source` is what this checkout was STARTED as (captured when the checkout
  // page loaded). Falling back to storage only covers callers that did not
  // capture it; storage is shared between tabs, so another tab starting a Buy
  // Now / cart checkout in the meantime must not change what THIS order clears.
  const startedAs = source !== undefined ? source : localStorage.getItem("checkoutSource");
  if (startedAs !== "buyNow") {
    localStorage.removeItem("cart");
  }
  localStorage.removeItem("checkoutItems");
  localStorage.removeItem("checkoutSource");
  window.dispatchEvent(new Event("cartUpdated"));
}
