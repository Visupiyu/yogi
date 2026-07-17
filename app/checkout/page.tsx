"use client";

import { useEffect, useState } from "react";
import {
  collection,
  addDoc,
  Timestamp,
  doc,
  updateDoc,
  increment,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { useRouter } from "next/navigation";

// Free shipping threshold — keep this in sync with TopStrip/cart.
const FREE_SHIPPING_THRESHOLD = 999;
const SHIPPING_FEE = 99;

export default function CheckoutPage() {
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [coupon, setCoupon] = useState("");
  const [shipping, setShipping] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("COD");
  const [deliveryDate, setDeliveryDate] = useState("");
  const [discount, setDiscount] = useState(0);
  const [couponApplied, setCouponApplied] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [availablePoints, setAvailablePoints] = useState(0);

  useEffect(() => {
    const storedItems = JSON.parse(
      localStorage.getItem("checkoutItems") || "[]"
    );
    setItems(storedItems);

    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    setAvailablePoints(Number(userData.rewardPoints || 0));
  }, []);

  const total = items.reduce(
    (sum, item) => sum + item.price * item.qty,
    0
  );

  const finalAmount = total - discount;

  const rewardValue = redeemPoints
    ? Math.min(availablePoints, Math.floor(finalAmount))
    : 0;

  const grandTotal = Math.max(0, finalAmount + shipping - rewardValue);
  const commission = Math.round(grandTotal * 0.1);
  const sellerEarning = grandTotal - commission;

  // Shipping + delivery date recompute whenever the amount changes.
  useEffect(() => {
    setShipping(finalAmount > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE);

    const d = new Date();
    d.setDate(d.getDate() + 5);
    setDeliveryDate(d.toDateString());
  }, [finalAmount]);

  const applyCoupon = async () => {
    if (couponApplied) {
      alert("Coupon already applied");
      return;
    }
    try {
      const q = query(
        collection(db, "coupons"),
        where("code", "==", coupon.trim().toUpperCase())
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        alert("Invalid coupon");
        return;
      }

      const couponData = snapshot.docs[0].data();
      if (!couponData.active) {
        alert("Coupon inactive");
        return;
      }

      const discountAmount = total * (couponData.discount / 100);
      setDiscount(discountAmount);
      setCouponApplied(true);
      alert(`${couponData.discount}% discount applied`);
    } catch (error) {
      console.error(error);
      alert("Coupon check failed");
    }
  };

  const loadRazorpayScript = () =>
    new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });

  // Unique vendor ids in this order (for scoped vendor reads under rules).
  const vendorIdsForOrder = () => [
    ...new Set(items.map((i: any) => i.vendorId).filter(Boolean)),
  ];

  // Shared side-effects after an order document is created.
  const applyPostOrderEffects = async (
    firebaseUser: any,
    orderId: string,
    paymentStatus: string
  ) => {
    const earnedPoints = Math.floor(grandTotal / 100);

    // Admin notification
    await addDoc(collection(db, "notifications"), {
      title: "🛒 New Order",
      message: `${name} placed an order worth ₹${grandTotal}`,
      type: "order",
      role: "admin",
      read: false,
      createdAt: Timestamp.now(),
    });

   // Stock + sales per item, and seller notifications
    for (const item of items) {
      try {
        await updateDoc(doc(db, "products", item.id), {
          sales: increment(item.qty),
          stock: increment(-item.qty),
        });
        console.log("✅ Product updated:", item.name);
      } catch (e) {
        console.error("❌ Product update failed:", item.name, e);
        // Do NOT throw — a stock-write hiccup shouldn't fail the whole order
      }

      if (item.vendorId) {
        try {
          await addDoc(collection(db, "notifications"), {
            userId: item.vendorId,
            role: "seller",
            title: "🛒 New Order",
            message: `${name} ordered ${item.name}`,
            type: "order",
            read: false,
            createdAt: Timestamp.now(),
          });
          console.log("✅ Seller notification:", item.name);
        } catch (e) {
          console.error("❌ Seller notification failed:", item.name, e);
          // Do NOT throw
        }
      }
    }
    // Customer notification
    await addDoc(collection(db, "notifications"), {
      userId: firebaseUser.uid,
      role: "customer",
      title: "✅ Order Placed",
      message: `Your order worth ₹${grandTotal} has been placed successfully.`,
      type: "order",
      read: false,
      createdAt: Timestamp.now(),
    });

    // Confirmation email (best-effort)
    try {
      await fetch("/api/send-order-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: name,
          customerEmail: firebaseUser.email,
          orderId,
          total: grandTotal,
        }),
      });
    } catch (e) {
      console.error("Order email failed:", e);
    }

    // Update reward points in localStorage
    const user = JSON.parse(localStorage.getItem("user") || "{}");
    const currentPoints = Number(user.rewardPoints || 0);
    user.rewardPoints = Math.max(
      0,
      currentPoints + earnedPoints - rewardValue
    );
    localStorage.setItem("user", JSON.stringify(user));

    // Reward transactions (must include userId to satisfy Firestore rules)
    await addDoc(collection(db, "rewardTransactions"), {
      userId: firebaseUser.uid,
      userEmail: firebaseUser.email,
      type: "Earned",
      points: earnedPoints,
      orderTotal: grandTotal,
      createdAt: Timestamp.now(),
    });

    if (rewardValue > 0) {
      await addDoc(collection(db, "rewardTransactions"), {
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email,
        type: "Redeemed",
        points: rewardValue,
        createdAt: Timestamp.now(),
      });
    }

    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const buildOrderData = (firebaseUser: any, paymentStatus: string) => ({
    customerName: name,
    phone,
    address,
    userEmail: firebaseUser.email,
    userId: firebaseUser.uid,
    vendorIds: vendorIdsForOrder(),
    items,
    total,
    status: "Pending",
    paymentMethod,
    paymentStatus,
    shippingCharge: shipping,
    finalTotal: grandTotal,
    deliveryDate,
    commission,
    sellerEarning,
    couponCode: couponApplied ? coupon : "",
    discount,
    createdAt: Timestamp.now(),
  });

  const validateForm = () => {
    if (!name.trim() || !phone.trim() || !address.trim()) {
      alert("Fill all checkout fields");
      return false;
    }
    if (!/^\d{10}$/.test(phone)) {
      alert("Enter valid 10 digit phone number");
      return false;
    }
    if (items.length === 0) {
      alert("Cart is empty");
      return false;
    }
    return true;
  };

  const placeCODOrder = async () => {
    if (!validateForm()) return;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      alert("Please login again.");
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      const orderRef = await addDoc(
        collection(db, "orders"),
        buildOrderData(firebaseUser, "Pending")
      );
      await applyPostOrderEffects(firebaseUser, orderRef.id, "Pending");

      alert("Order Placed Successfully");
      window.location.href = "/orders";
    } catch (error) {
      console.error("Checkout Error:", error);
      alert("Order Failed");
    } finally {
      setLoading(false);
    }
  };

  const payNow = async () => {
    if (!validateForm()) return;

    const res: any = await loadRazorpayScript();
    if (!res) {
      alert("Razorpay failed");
      return;
    }

    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY) {
      alert("Razorpay Key Missing");
      return;
    }

    const response = await fetch("/api/create-order", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amount: grandTotal }),
    });
    const data = await response.json();

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY,
      amount: data.amount,
      currency: data.currency,
      name: "Yogi Mart",
      description: "Marketplace Payment",
      order_id: data.id,
      handler: async function (rzp: any) {
        const verifyResponse = await fetch("/api/verify-payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            razorpay_order_id: rzp.razorpay_order_id,
            razorpay_payment_id: rzp.razorpay_payment_id,
            razorpay_signature: rzp.razorpay_signature,
          }),
        });
        const verifyData = await verifyResponse.json();

        if (!verifyData.success) {
          alert("Payment Verification Failed");
          return;
        }

        const firebaseUser = auth.currentUser;
        if (!firebaseUser) {
          alert("Please login again.");
          return;
        }

        setLoading(true);
        try {
          const orderRef = await addDoc(
            collection(db, "orders"),
            buildOrderData(firebaseUser, "Paid")
          );
          await applyPostOrderEffects(firebaseUser, orderRef.id, "Paid");

          alert("Order Placed Successfully");
          window.location.href = "/orders";
        } catch (error) {
          console.error("Checkout Error:", error);
          alert("Order save failed");
        } finally {
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          alert("Payment Cancelled");
        },
      },
      theme: { color: "#16a34a" },
    };

    const paymentObject = new (window as any).Razorpay(options);
    paymentObject.open();
  };

  const handlePlaceOrder = () => {
    if (paymentMethod === "ONLINE") payNow();
    else placeCODOrder();
  };

  return (
    <section className="py-8 px-4 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
  <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-8 mb-8">

  <h1 className="text-4xl font-bold">
    💳 Secure Checkout
  </h1>

  <p className="mt-2 text-lg opacity-90">
    Complete your purchase safely with Yogi Mart
  </p>

</div>      
        {/* CHECKOUT PROGRESS BAR */}
        <div className="flex items-center justify-center gap-2 sm:gap-4 mb-8">
          {[
            { label: "Cart", done: true },
            { label: "Address", done: false },
            { label: "Payment", done: false },
          ].map((s, i) => (
            <div key={s.label} className="flex items-center gap-2 sm:gap-4">
              <div className="flex flex-col items-center">
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-sm ${
                    s.done || i === 1
                      ? "bg-green-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {s.done ? "✓" : i + 1}
                </div>
                <span
                  className={`text-xs mt-1 ${
                    s.done || i === 1
                      ? "text-green-700 font-semibold"
                      : "text-gray-400"
                  }`}
                >
                  {s.label}
                </span>
              </div>
              {i < 2 && (
                <div
                  className={`w-10 sm:w-20 h-2 rounded-full ${
                    i === 0 ? "bg-green-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* LEFT: ADDRESS + PAYMENT */}
          <div className="lg:col-span-2 space-y-6">
            {/* DELIVERY ADDRESS */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-2xl font-bold mb-6 flex items-center gap-3">
📍 Delivery Address
</h2>
<p className="text-gray-500 mb-6">
Please enter your shipping details.
</p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                 👤 Full Name
                  </label>
                  <input
                    type="text"
                    placeholder="Enter your full name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full border rounded-xl px-5 py-3.5 outline-none focus:ring-2 focus:ring-green-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                 📞 Phone Number
                  </label>
                  <input
                    type="tel"
                    placeholder="10 digit mobile number"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full border rounded-xl px-5 py-3.5 outline-none focus:ring-2 focus:ring-green-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-500 mb-1">
                 🏠 Delivery Address
                  </label>
                  <textarea
                    placeholder="House no, street, area, city, state, PIN"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    rows={4}
                    className="w-full border rounded-xl px-5 py-3.5 outline-none focus:ring-2 focus:ring-green-500 transition"
                  />
                </div>
              </div>
            </div>
 
            {/* PAYMENT METHOD */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
                💳 Payment Method
              </h2>
              <p className="text-gray-500 mb-5">
Choose your preferred payment option.</p>
              <div className="space-y-3">
                <label
                  className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer transition ${
                    paymentMethod === "COD"
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-4 h-4 accent-green-600"
                  />
                  <div>
                    <p className="font-semibold">Cash on Delivery</p>
                    <p className="text-sm text-gray-500">
                      Pay when your order arrives
                    </p>
                  </div>
                </label>

                <label
                  className={`flex items-center gap-3 border-2 rounded-xl p-4 cursor-pointer transition ${
                    paymentMethod === "ONLINE"
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    value="ONLINE"
                    checked={paymentMethod === "ONLINE"}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-4 h-4 accent-green-600"
                  />
                  <div>
                    <p className="font-semibold">Online Payment</p>
                    <p className="text-sm text-gray-500">
                      UPI, Cards &amp; Netbanking via Razorpay
                    </p>
                  </div>
                </label>
              </div>
            </div>

            {/* TRUST BADGES */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
<div className="bg-green-50 rounded-xl p-4 text-center">
🔒
<p className="font-semibold mt-2">
100% Secure
</p>
</div>
<div className="bg-blue-50 rounded-xl p-4 text-center">
🚚
<p className="font-semibold mt-2">
Fast Delivery
</p>
</div>
<div className="bg-yellow-50 rounded-xl p-4 text-center">
🛡
<p className="font-semibold mt-2">
Buyer Protection
</p>
</div>
<div className="bg-purple-50 rounded-xl p-4 text-center">
↩
<p className="font-semibold mt-2">
Easy Returns
</p>
</div>
</div>
 </div>
          {/* RIGHT: SUMMARY */}
          <div className="lg:sticky lg:top-24 h-fit space-y-5">
            {/* FREE DELIVERY NOTE */}
            <div
              className={`rounded-2xl p-4 text-sm font-medium ${
                shipping === 0
                  ? "bg-green-50 text-green-700"
                  : "bg-yellow-50 text-yellow-700"
              }`}
            >
              {shipping === 0
                ? "🎉 You have unlocked FREE delivery"
                : `🚚 Add ₹${Math.max(
                    0,
                    FREE_SHIPPING_THRESHOLD - finalAmount
                  ).toLocaleString("en-IN")} more for FREE delivery`}
            </div>

            {/* ORDER SUMMARY */}
            <div className="bg-white rounded-2xl shadow-sm p-6">
              <h2 className="text-xl font-bold mb-5">Order Summary</h2>

              <div className="space-y-4 max-h-64 overflow-y-auto pr-1">
                {items.map((item: any, index: number) => (
                  <div key={index} className="flex items-center gap-3">
                    <img
                      src={item?.image || "/no-image.png"}
                      alt=""
                      className="w-16 h-16 object-cover rounded-xl border border-gray-100"
                    />
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-sm line-clamp-1">
                        {item?.name}
                      </h3>
                      <p className="text-gray-500 text-xs">
                        Qty: {item?.qty}
                        {item?.size ? ` • ${item.size}` : ""}
                        {item?.color ? ` • ${item.color}` : ""}
                      </p>
                    </div>
                    <p className="font-bold text-sm">
                      ₹
                      {((item?.price || 0) * (item?.qty || 0)).toLocaleString(
                        "en-IN"
                      )}
                    </p>
                  </div>
                ))}
              </div>

              {/* COUPON */}
              <div className="mt-6">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="🎟 Coupon code"
                    value={coupon}
                    onChange={(e) => setCoupon(e.target.value)}
                    className="flex-1 border rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-green-500"
                  />
                  <button
                    onClick={applyCoupon}
                    disabled={couponApplied}
                    className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-5 rounded-xl font-semibold transition"
                  >
                    {couponApplied ? "Applied" : "Apply"}
                  </button>
                </div>
                <p className="mt-2 text-xs text-gray-400">
                💡 Try SAVE10 to get instant discount.
                </p>
              </div>

              {/* REDEEM POINTS */}
              <div className="border rounded-2xl p-5 mt-5 bg-yellow-50">

<p className="font-semibold mb-3">

⭐ Reward Points

</p>
              <label className="flex items-center gap-2 mt-5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={redeemPoints}
                  onChange={() => setRedeemPoints(!redeemPoints)}
                  className="w-4 h-4 accent-green-600"
                />
                <span className="text-sm">
                  Redeem Reward Points ({availablePoints} available)
                </span>
              </label>
              </div>

              {/* PRICE BREAKDOWN */}
              <div className="border-t mt-5 pt-5 space-y-3 text-gray-700">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span>₹{total.toLocaleString("en-IN")}</span>
                </div>

                {discount > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>Coupon discount</span>
                    <span>- ₹{discount.toLocaleString("en-IN")}</span>
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

                {redeemPoints && rewardValue > 0 && (
                  <div className="flex justify-between text-purple-600">
                    <span>Reward discount</span>
                    <span>- ₹{rewardValue.toLocaleString("en-IN")}</span>
                  </div>
                )}

                <div className="flex justify-between text-xs text-gray-500">
                  <span>Estimated delivery</span>
                  <span>{deliveryDate}</span>
                </div>
                <div className="flex justify-between">
                 <span> GST </span>
                 <span className="text-green-600"> Included </span>
                  </div>
                   <div className="flex justify-between text-2xl font-bold border-t pt-4">
                  <span>Total</span>
                  <span>₹{grandTotal.toLocaleString("en-IN")}</span>
                </div>
              </div>

              <button
                onClick={handlePlaceOrder}
                disabled={loading}
                className="w-full mt-6 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-4 rounded-2xl font-bold text-lg transition"
              >
                {loading
                  ? "Processing..."
                  : paymentMethod === "ONLINE"
                  ? `💳 Pay Securely ₹${grandTotal.toLocaleString("en-IN")}`
                  : "🔒 Place Secure Order"}
              </button>

              <p className="text-center text-xs text-gray-400 mt-3">
                🔒 100% secure &amp; encrypted checkout
              </p>
            </div>
          </div>
        </div>
        
      </div>
    </section>
  );
}
