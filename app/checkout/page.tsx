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
const FREE_SHIPPING_THRESHOLD = 2000;
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
      await updateDoc(doc(db, "products", item.id), {
        sales: increment(item.qty),
        stock: increment(-item.qty),
      });

      if (item.vendorId) {
        await addDoc(collection(db, "notifications"), {
          userId: item.vendorId,
          role: "seller",
          title: "🛒 New Order",
          message: `${name} ordered ${item.name}`,
          type: "order",
          read: false,
          createdAt: Timestamp.now(),
        });
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
    <section className="py-10 px-4">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* LEFT */}
        <div className="lg:col-span-2 bg-white rounded-3xl shadow-md p-8">
          <h1 className="text-3xl font-bold mb-8">Checkout</h1>

          <div className="space-y-5">
            <input
              type="text"
              placeholder="Full Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full border rounded-xl px-5 py-4 outline-none"
            />
            <input
              type="text"
              placeholder="Phone Number"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full border rounded-xl px-5 py-4 outline-none"
            />
            <textarea
              placeholder="Delivery Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              rows={5}
              className="w-full border rounded-xl px-5 py-4 outline-none"
            />
          </div>
        </div>

        {/* RIGHT */}
        <div className="bg-white rounded-3xl shadow-md p-8 h-fit">
          <h2 className="text-2xl font-bold mb-6">Order Summary</h2>

          <div className="space-y-5">
            {items.map((item: any, index) => (
              <div key={index} className="flex items-center gap-4">
                <img
                  src={item?.image || "/no-image.png"}
                  alt=""
                  className="w-20 h-20 object-cover rounded-xl"
                />
                <div className="flex-1">
                  <h3 className="font-semibold">{item?.name}</h3>
                  <p className="text-gray-500 text-sm">Qty: {item?.qty}</p>
                </div>
                <p className="font-bold">
                  ₹{((item?.price || 0) * (item?.qty || 0)).toLocaleString("en-IN")}
                </p>
              </div>
            ))}
          </div>

          <div className="border-t mt-8 pt-6">
            <div className="flex justify-between text-xl font-bold">
              <span>Total</span>
              <span>₹{total.toLocaleString("en-IN")}</span>
            </div>

            <div className="flex justify-between mt-4 text-green-600 font-semibold">
              <span>Discount</span>
              <span>- ₹{discount.toLocaleString("en-IN")}</span>
            </div>

            <div className="flex justify-between mt-4 text-blue-600 font-semibold">
              <span>Shipping</span>
              <span>{shipping === 0 ? "FREE" : `₹${shipping}`}</span>
            </div>

            <div className="flex justify-between mt-4 text-gray-600 text-sm">
              <span>Estimated Delivery</span>
              <span>{deliveryDate}</span>
            </div>

            <div className="mt-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={redeemPoints}
                  onChange={() => setRedeemPoints(!redeemPoints)}
                />
                <span>
                  Redeem Reward Points ({availablePoints} Available)
                </span>
              </label>
            </div>

            {redeemPoints && (
              <div className="flex justify-between mt-4 text-purple-600 font-semibold">
                <span>Reward Discount</span>
                <span>- ₹{rewardValue.toLocaleString("en-IN")}</span>
              </div>
            )}

            <div className="flex justify-between mt-5 text-2xl font-bold">
              <span>Final Total</span>
              <span>₹{grandTotal.toLocaleString("en-IN")}</span>
            </div>

            {/* PAYMENT METHOD */}
            <div className="mt-8">
              <h3 className="text-xl font-bold mb-4">Payment Method</h3>
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    value="COD"
                    checked={paymentMethod === "COD"}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  Cash On Delivery
                </label>
                <label className="flex items-center gap-3">
                  <input
                    type="radio"
                    value="ONLINE"
                    checked={paymentMethod === "ONLINE"}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  />
                  Online Payment
                </label>
              </div>
            </div>

            <button
              onClick={handlePlaceOrder}
              disabled={loading}
              className="w-full mt-6 bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white py-4 rounded-2xl font-bold text-lg transition"
            >
              {loading ? "Processing..." : "Place Order"}
            </button>

            {/* COUPON */}
            <div className="bg-white rounded-3xl shadow-md p-6 mt-8">
              <h2 className="text-2xl font-bold mb-5">Apply Coupon</h2>
              <div className="flex gap-4">
                <input
                  type="text"
                  placeholder="Enter coupon code"
                  value={coupon}
                  onChange={(e) => setCoupon(e.target.value)}
                  className="flex-1 border rounded-2xl px-4 py-3"
                />
                <button
                  onClick={applyCoupon}
                  disabled={couponApplied}
                  className="bg-green-600 hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-6 rounded-2xl font-semibold"
                >
                  {couponApplied ? "Applied" : "Apply"}
                </button>
              </div>

              <div className="mt-5 text-sm text-gray-500 leading-7">
                Try: <span className="font-bold">YOGI10</span> or{" "}
                <span className="font-bold">SAVE500</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
