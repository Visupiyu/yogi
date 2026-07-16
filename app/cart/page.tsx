"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const FREE_DELIVERY_THRESHOLD = 999; // keep in sync with TopStrip
const SHIPPING_FEE = 99;

export default function CartPage() {
  const [cart, setCart] = useState<any[]>([]);
  const [coupon, setCoupon] = useState("");
  const [discount, setDiscount] = useState(0);

  useEffect(() => {
    const storedCart = JSON.parse(localStorage.getItem("cart") || "[]");
    setCart(storedCart);
  }, []);

  const persist = (updated: any[]) => {
    setCart(updated);
    localStorage.setItem("cart", JSON.stringify(updated));
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const updateQty = (index: number, type: string) => {
    const updated = [...cart];
    if (type === "inc" && updated[index].qty < updated[index].stock) {
      updated[index].qty += 1;
    }
    if (type === "dec" && updated[index].qty > 1) {
      updated[index].qty -= 1;
    }
    persist(updated);
  };

  const removeItem = (index: number) => {
    persist(cart.filter((_, i) => i !== index));
  };

  const clearCart = () => {
    localStorage.removeItem("cart");
    setCart([]);
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const applyCoupon = () => {
    if (coupon.trim().toUpperCase() === "TEST50") {
      setDiscount(100);
      alert("Coupon applied");
    } else {
      setDiscount(0);
      alert("Invalid coupon");
    }
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
  const shipping = total > FREE_DELIVERY_THRESHOLD || total === 0 ? 0 : SHIPPING_FEE;
  const grandTotal = Math.max(0, total + shipping - discount);
  const totalSavings = productSavings + discount + (shipping === 0 && total > 0 ? SHIPPING_FEE : 0);

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
    <section className="py-8 px-4 bg-gray-50 min-h-screen">
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

        <h1 className="text-3xl md:text-4xl font-bold mb-6">
          Shopping Cart
          {cart.length > 0 && (
            <span className="text-gray-400 text-xl font-semibold ml-3">
              ({totalItems} {totalItems === 1 ? "item" : "items"})
            </span>
          )}
        </h1>

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
                const hasMrp =
                  Number(item.mrp) && Number(item.mrp) > Number(item.price);
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
                      <div className="flex justify-between gap-3">
                        <Link href={`/product/${item.id}`}>
                          <h2 className="text-lg font-bold hover:text-green-700 transition line-clamp-2">
                            {item.name}
                          </h2>
                        </Link>
                        <button
                          onClick={() => removeItem(index)}
                          className="text-gray-400 hover:text-red-500 transition shrink-0"
                          title="Remove"
                        >
                          🗑 Remove
                        </button>
                      </div>

                      {/* size / color */}
                      {(item.size || item.color) && (
                        <p className="text-sm text-gray-500 mt-1">
                          {item.size ? `Size: ${item.size}` : ""}
                          {item.size && item.color ? " • " : ""}
                          {item.color ? `Color: ${item.color}` : ""}
                        </p>
                      )}

                      {/* price */}
                      <div className="flex items-center gap-2 mt-2">
                        <span className="text-green-600 font-bold text-xl">
                          ₹{Number(item.price).toLocaleString("en-IN")}
                        </span>
                        {hasMrp && (
                          <>
                            <span className="text-gray-400 line-through text-sm">
                              ₹{Number(item.mrp).toLocaleString("en-IN")}
                            </span>
                            <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                              {Math.round(
                                ((item.mrp - item.price) / item.mrp) * 100
                              )}
                              % OFF
                            </span>
                          </>
                        )}
                      </div>

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
                            className="w-10 h-10 text-xl text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
                          >
                            −
                          </button>
                          <span className="w-10 text-center font-bold">
                            {item.qty}
                          </span>
                          <button
                            onClick={() => updateQty(index, "inc")}
                            disabled={item.qty >= item.stock}
                            className="w-10 h-10 text-xl text-gray-600 hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition"
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

              <button
                onClick={clearCart}
                className="text-sm text-gray-500 hover:text-red-500 transition font-medium"
              >
                Clear entire cart
              </button>
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

              {/* COUPON CARD */}
              <div className="bg-white rounded-2xl shadow-sm p-5">
                <h3 className="font-bold mb-3 flex items-center gap-2">
                  🎟 Apply Coupon
                </h3>
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Enter code"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    className="flex-1 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={applyCoupon}
                    className="bg-green-600 hover:bg-green-700 text-white px-6 rounded-xl font-semibold transition"
                  >
                    Apply
                  </button>
                </div>
                {discount > 0 && (
                  <p className="text-green-600 text-sm mt-2 font-medium">
                    ✓ Coupon applied — ₹{discount} off
                  </p>
                )}
              </div>

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

                  {discount > 0 && (
                    <div className="flex justify-between text-green-600">
                      <span>Coupon</span>
                      <span>- ₹{discount.toLocaleString("en-IN")}</span>
                    </div>
                  )}

                  <div className="flex justify-between text-2xl font-bold border-t pt-4 mt-2">
                    <span>Total</span>
                    <span>₹{grandTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>

                <button
                  onClick={proceedCheckout}
                  className="w-full mt-6 bg-green-600 hover:bg-green-700 text-white py-4 rounded-2xl font-bold text-lg transition"
                >
                  Proceed to Checkout
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
                    🔒 Secure payments
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    ✅ Genuine products
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    ↩️ Easy 7-day returns
                  </div>
                  <div className="flex items-center gap-2 text-gray-600">
                    🚚 Fast delivery
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
