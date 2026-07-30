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