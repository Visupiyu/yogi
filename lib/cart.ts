export interface CartItem {
  id: string;
  name: string;
  price: number;
  image?: string;
  stock: number;
  qty: number;
  size?: string;
  color?: string;
  vendorId?: string;
  vendorName?: string;
}

export interface AddToCartOptions {
  qty: number;
  size?: string;
  color?: string;
}

export function addToCart(
  product: any,
  options: AddToCartOptions
): boolean {

  if (!product) return false;

  const cart: CartItem[] = JSON.parse(
    localStorage.getItem("cart") || "[]"
  );

  const index = cart.findIndex(
    (item) =>
      item.id === product.id &&
      item.size === options.size &&
      item.color === options.color
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
      image: product.image,
      stock: product.stock ?? 0,
      qty: options.qty,
      size: options.size,
      color: options.color,
      vendorId: product.vendorId ?? "",
      vendorName: product.vendorName ?? "",
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
  color?: string
): void {

  const cart = getCartItems();

  const updatedCart = cart.filter(
    (item) =>
      !(
        item.id === id &&
        item.size === size &&
        item.color === color
      )
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
  color?: string
): void {

  const cart = getCartItems();

  const updatedCart = cart.map((item) => {

    if (
      item.id === id &&
      item.size === size &&
      item.color === color
    ) {
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