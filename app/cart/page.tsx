"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  getCartItems,
  updateCartQuantity,
  removeFromCart,
  getCartTotal,
  clearCart,
} from "@/lib/cart";
import {
  FREE_SHIPPING_THRESHOLD as DEFAULT_FREE_DELIVERY_THRESHOLD,
  STANDARD_SHIPPING_CHARGE as DEFAULT_SHIPPING_FEE,
  calculateShippingCharge,
  getShippingSettings,
} from "@/lib/shipping";

export default function CartPage() {
  const [cart, setCart] = useState<any[]>([]);
  const [savedItems, setSavedItems] = useState<any[]>([]);
  const [FREE_DELIVERY_THRESHOLD, setFreeDeliveryThreshold] = useState(
    DEFAULT_FREE_DELIVERY_THRESHOLD
  );
  const [SHIPPING_FEE, setShippingFee] = useState(DEFAULT_SHIPPING_FEE);

 useEffect(() => {
  getShippingSettings().then((settings) => {
    setFreeDeliveryThreshold(settings.freeShippingThreshold);
    setShippingFee(settings.standardShippingCharge);
  });

  const items = getCartItems();
  setCart(items);

  setSavedItems(
    JSON.parse(
      localStorage.getItem("savedItems") || "[]"
    )
  );

  // item.stock is a snapshot from whenever it was added to the cart —
  // refresh it here so the quantity controls and "only N left" messaging
  // reflect what's actually available right now, not stock at add time.
  const refreshStock = async () => {
    if (items.length === 0) return;

    try {
      const updated = await Promise.all(
        items.map(async (item: any) => {
          const snap = await getDoc(doc(db, "products", item.id));
          return snap.exists()
            ? { ...item, stock: Number(snap.data().stock ?? 0) }
            : item;
        })
      );

      setCart(updated);
    } catch (error) {
      console.error("Failed to refresh cart stock:", error);
    }
  };

  refreshStock();
}, []);

  const persist = (updated: any[]) => {
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const updateQty = (index: number, type: string) => {

  const item = cart[index];

  if (!item) return;

  const newQty =
    type === "inc"
      ? item.qty + 1
      : item.qty - 1;

  updateCartQuantity(
    item.id,
    newQty,
    item.size,
    item.color
  );

  setCart(getCartItems());

};
const removeItem = (index: number) => {

  const item = cart[index];

  if (!item) return;

  removeFromCart(
    item.id,
    item.size,
    item.color
  );

  setCart(getCartItems());

};

 const clearCartHandler = () => {

  clearCart();

  setCart([]);

};

  const saveForLater = (index: number) => {

  const item = cart[index];

  const updatedCart =
    cart.filter((_, i) => i !== index);

  const updatedSaved = [
    ...savedItems,
    item,
  ];

  persist(updatedCart);

  setSavedItems(updatedSaved);

  localStorage.setItem(
    "savedItems",
    JSON.stringify(updatedSaved)
  );

};

const moveToCart = (index: number) => {

  const item = savedItems[index];

  const updatedSaved =
    savedItems.filter((_, i) => i !== index);

  const updatedCart = [
    ...cart,
    item,
  ];

  setSavedItems(updatedSaved);

  localStorage.setItem(
    "savedItems",
    JSON.stringify(updatedSaved)
  );

  persist(updatedCart);

};

  const total = cart.reduce(
    (sum, item) => sum + (Number(item.price) || 0) * (Number(item.qty) || 1),
    0
  );

  const mrpTotal = cart.reduce(
    (sum, item) =>
      sum +
      (Number(item.mrp) || Number(item.price) || 0) * (Number(item.qty) || 1),
    0
  );

  const productSavings = Math.max(0, mrpTotal - total);
  const shipping = calculateShippingCharge(total, {
    freeShippingThreshold: FREE_DELIVERY_THRESHOLD,
    standardShippingCharge: SHIPPING_FEE,
  });
  const grandTotal = Math.max(0, total + shipping);
  const totalSavings = productSavings + (shipping === 0 && total > 0 ? SHIPPING_FEE : 0);

  const totalItems = cart.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);

  const deliveryRemaining = Math.max(0, FREE_DELIVERY_THRESHOLD - total);
  const deliveryProgress = Math.min(100, (total / FREE_DELIVERY_THRESHOLD) * 100);

  const proceedCheckout = () => {
    if (cart.length === 0) {
      alert("Cart is empty");
      return;
    }
    localStorage.setItem("checkoutItems", JSON.stringify(cart));
    window.location.href = "/checkout";
  };

  return (
    <section className="py-8 px-4 pb-24 md:pb-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        {/* CHECKOUT PROGRESS BAR */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
          {["Cart", "Address", "Payment"].map((label, i) => (
            <div key={label} className="flex items-center gap-2 sm:gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm ${
                    i === 0
                      ? "bg-green-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {i + 1}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    i === 0 ? "text-green-700 font-semibold" : "text-gray-400"
                  }`}
                >
                  {label}
                </span>
              </div>
              {i < 2 && (
                <div className="w-10 sm:w-20 h-1 rounded-full bg-gray-200" />
              )}
            </div>
          ))}
        </div>
 </div>

       <div
  className="
    bg-gradient-to-r
    from-green-600
    to-blue-600
    rounded-3xl
    text-white
    p-8
    mb-8
  "
>
  <h1 className="text-4xl font-bold">
    🛒 Shopping Cart
  </h1>

  <p className="mt-2 text-lg opacity-90">
    {totalItems} {totalItems === 1 ? "item" : "items"} ready for checkout
  </p>

  <p className="opacity-80 mt-1">
    Everything looks good!
  </p>
</div>

        {cart.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-16 text-center">
            <div className="text-6xl mb-4">🛒</div>
            <p className="text-gray-500 text-lg mb-2">Your cart is empty</p>
            <p className="text-gray-400 text-sm mb-6">
              Looks like you haven&apos;t added anything yet.
            </p>
            <Link href="/">
              <button className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-semibold transition">
                Start Shopping
              </button>
                </Link>

              <div className="mt-10">

<p className="font-bold mb-4">

Popular Categories

</p>

<div className="flex justify-center gap-4 flex-wrap">

<span className="px-4 py-2 bg-white rounded-full shadow">
📱 Mobiles
</span>

<span className="px-4 py-2 bg-white rounded-full shadow">
👗 Fashion
</span>

<span className="px-4 py-2 bg-white rounded-full shadow">
💻 Electronics
</span>

<span className="px-4 py-2 bg-white rounded-full shadow">
🛒 Grocery
</span>

</div>

</div>
          
          </div>
        
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* LEFT: ITEMS */}
            <div className="lg:col-span-2 space-y-5">
              {/* FREE DELIVERY PROGRESS */}
              <div className="bg-white rounded-2xl shadow-sm p-5">
                {total > FREE_DELIVERY_THRESHOLD ? (
                  <p className="text-green-700 font-semibold flex items-center gap-2">
                    🎉 Yay! You&apos;ve unlocked FREE delivery
                  </p>
                ) : (
                  <p className="text-gray-700 font-medium flex items-center gap-2">
                    🚚 Add{" "}
                    <span className="text-green-700 font-bold">
                      ₹{deliveryRemaining.toLocaleString("en-IN")}
                    </span>{" "}
                    more for FREE delivery
                  </p>
                )}
                <div className="mt-3 h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                    style={{ width: `${deliveryProgress}%` }}
                  />
                </div>
              </div>

              {/* PRODUCT CARDS */}
              {cart.map((item: any, index: number) => {
                const lineTotal =
                  (Number(item.price) || 0) * (Number(item.qty) || 1);

                return (
                  <div
                    key={`${item.id}-${item.size || ""}-${item.color || ""}`}
                    className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition-shadow duration-300 p-5 flex flex-col sm:flex-row gap-5"
                  >
                    <Link href={`/product/${item.id}`} className="shrink-0 mx-auto sm:mx-0">
                      <img
                        src={item.image || "/no-image.png"}
                        alt={item.name}
                        className="w-32 h-32 object-cover rounded-2xl border border-gray-100 hover:scale-105 transition-transform"
                      />
                    </Link>

                    <div className="flex-1">
                      <div className="flex justify-between items-start gap-3">
                       <div className="flex-1">

                         <Link href={`/product/${item.id}`}>
                          <h2 className="text-lg font-bold hover:text-green-700 transition line-clamp-2">
                            {item.name}
                          </h2>
                        </Link>
                        </div>

                        <div className="text-right">

                        <p className="text-2xl font-bold text-green-700">
                        ₹{Number(item.price).toLocaleString("en-IN")}
                        </p>

                        </div>
   <div className="flex flex-col gap-2">

  <button
    onClick={() => saveForLater(index)}
    className="
      border
      border-blue-500
      text-blue-600
      px-3
      py-2
      rounded-xl
      hover:bg-blue-500
      hover:text-white
      transition
    "
  >
    ⭐ Save for Later
  </button>

  <button
    onClick={() => removeItem(index)}
    className="
      border
      border-red-500
      text-red-600
      px-3
      py-2
      rounded-xl
      hover:bg-red-500
      hover:text-white
      transition
    "
  >
    🗑 Remove Item
  </button>

</div>
      </div>
      

                      {/* size / color */}
                      {(item.size || item.color) && (
                        <p className="text-sm text-gray-500 mt-1">
                          {item.size ? `Size: ${item.size}` : ""}
                          {item.size && item.color ? " • " : ""}
                          {item.color ? `Color: ${item.color}` : ""}
                        </p>
                      )}
                
                      {/* stock */}
                      <p
                        className={`text-sm mt-1 ${
                          item.stock > 0 ? "text-gray-500" : "text-red-500"
                        }`}
                      >
                        {item.stock > 0
                          ? item.stock <= 5
                            ? `Only ${item.stock} left`
                            : "In stock"
                          : "Out of stock"}
                      </p>

                      {/* qty + line total */}
                      <div className="flex items-center justify-between mt-4">
                        <div className="flex items-center border rounded-full overflow-hidden">
                          <button
                            onClick={() => updateQty(index, "dec")}
                            disabled={item.qty <= 1}
                            className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white transition disabled:bg-gray-300"
                          >
                            −
                          </button>
                          <span className="w-10 text-center font-bold">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => updateQty(index, "inc")}
                            disabled={item.qty >= item.stock}
                           className="w-10 h-10 bg-green-600 hover:bg-green-700 text-white transition disabled:bg-gray-300"
                          >
                            +
                          </button>
                        </div>

                        <p className="text-xl font-bold">
                          ₹{lineTotal.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
{savedItems.length > 0 && (

  <div className="mt-10">

    <h2 className="text-2xl font-bold mb-5">
      ⭐ Saved for Later
    </h2>

    <div className="space-y-4">

      {savedItems.map((item: any, index: number) => (

        <div
          key={`${item.id}-${index}`}
          className="bg-white rounded-2xl shadow-sm p-5 flex flex-col sm:flex-row gap-5"
        >

          <img
            src={item.image || "/no-image.png"}
            alt={item.name}
            className="w-28 h-28 object-cover rounded-xl"
          />

          <div className="flex-1">

            <h3 className="font-bold">
              {item.name}
            </h3>

            <p className="text-green-700 font-bold mt-2">
              ₹{Number(item.price).toLocaleString("en-IN")}
            </p>

            <button
              onClick={() => moveToCart(index)}
              className="
                mt-4
                bg-green-600
                hover:bg-green-700
                text-white
                px-5
                py-2
                rounded-xl
                transition
              "
            >
              🛒 Move to Cart
            </button>

          </div>

        </div>

      ))}

    </div>

  </div>

)}
              <div className="flex flex-wrap gap-4 pt-2">

  <button
    onClick={clearCartHandler}
    className="text-sm text-gray-500 hover:text-red-500 transition font-medium"
  >
    🗑 Clear Cart
  </button>

</div>
            </div>

            {/* RIGHT: SUMMARY */}
            <div className="lg:sticky lg:top-24 h-fit space-y-5">
              {/* SAVINGS CARD */}
              {totalSavings > 0 && (
                <div className="bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-2xl p-5 shadow-md">
                  <p className="text-sm opacity-90">Your total savings</p>
                  <p className="text-3xl font-bold mt-1">
                    ₹{totalSavings.toLocaleString("en-IN")} 🎉
                  </p>
                </div>
              )}

              {/* PRICE SUMMARY */}
              <div className="bg-white rounded-2xl shadow-sm p-6">
                <h2 className="text-xl font-bold mb-5">Order Summary</h2>

                <div className="space-y-3 text-gray-700">
                  <div className="flex justify-between">
                    <span>Subtotal ({totalItems} items)</span>
                    <span>₹{total.toLocaleString("en-IN")}</span>
                  </div>

                  {productSavings > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Product discount</span>
                      <span>- ₹{productSavings.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="flex justify-between">
                    <span>Delivery</span>
                    <span
                      className={shipping === 0 ? "text-green-600 font-semibold" : ""}
                    >
                      {shipping === 0 ? "FREE" : `₹${shipping}`}
                    </span>
                  </div>

                  <div className="flex justify-between">
                  <span>GST</span>
                  <span className="text-green-600">Included</span>
                  </div>

                  <div className="flex justify-between text-2xl font-bold border-t pt-4 mt-2">
                    <span>Total</span>
                    <span>₹{grandTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <button
                  onClick={proceedCheckout}
                  className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-bold text-lg transition"
                >
                 🔒 Secure Checkout
                </button>

                <Link href="/">
                  <button className="w-full mt-3 border-2 border-green-600 text-green-600 hover:bg-green-600 hover:text-white py-3 rounded-2xl font-semibold transition">
                    ← Continue Shopping
                  </button>
                </Link>
              </div>

              {/* TRUST BADGES */}
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                     🔒 100% Secure Payments
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    🚚 Fast Delivery
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    ↩ Easy Returns
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                  🛡 Buyer Protection
                  </div>
                </div>
                
              </div>
            </div>
          </div>
        )}
    </section>
  );
}
