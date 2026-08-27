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
function isSameLine(
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

  if (index > -1) {

    cart[index].qty = Math.min(
      cart[index].qty + options.qty,
      product.stock
    );

  } else {

    cart.push({
      id: product.id,
      name: product.name ?? "",
      price: product.price ?? 0,
      mrp: product.mrp,
      image: product.image,
      stock: product.stock ?? 0,
      qty: options.qty,
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
    });

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
        qty: Math.max(
          1,
          Math.min(qty, item.stock)
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