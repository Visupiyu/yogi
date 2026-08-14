"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  collection,
  addDoc,
  Timestamp,
  doc,
  updateDoc,
  increment,
  getDocs, getDoc,
  query,
  where,
  limit,
  runTransaction,
} from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { useRouter } from "next/navigation";
import {
  FREE_SHIPPING_THRESHOLD as DEFAULT_FREE_SHIPPING_THRESHOLD,
  STANDARD_SHIPPING_CHARGE as DEFAULT_SHIPPING_FEE,
  getShippingSettings,
} from "@/lib/shipping";
import { getEffectiveCommissionRate } from "@/lib/commission";

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
  const [FREE_SHIPPING_THRESHOLD, setFreeShippingThreshold] = useState(
    DEFAULT_FREE_SHIPPING_THRESHOLD
  );
  const [SHIPPING_FEE, setShippingFee] = useState(DEFAULT_SHIPPING_FEE);
  // Defaults to 0 (no commission) until the live setting loads — matches
  // YOMICO's zero-commission launch policy; never guess a nonzero charge.
  const [commissionRate, setCommissionRate] = useState(0);

  useEffect(() => {
    getShippingSettings().then((settings) => {
      setFreeShippingThreshold(settings.freeShippingThreshold);
      setShippingFee(settings.standardShippingCharge);
    });
    getEffectiveCommissionRate().then(setCommissionRate);

    const storedItems = JSON.parse(
      localStorage.getItem("checkoutItems") || "[]"
    );
    setItems(storedItems);

    const userData = JSON.parse(localStorage.getItem("user") || "{}");
    setName(userData.name || "");
setPhone(userData.phone || "");
setAddress(userData.address || "");
    loadDefaultAddress();

    // Reward balance must come from Firestore, not the cached localStorage
    // value — that's trivially editable client-side and was never actually
    // the real source of truth (see logic bug notes on redemption below).
    // Also the earliest point to catch a logged-out visitor — previously
    // they could fill out the whole form and even attempt payment before
    // being told to log in.
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        alert("Please login to checkout.");
        router.push("/login");
        return;
      }

      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        setAvailablePoints(
          snap.exists() ? Number(snap.data().rewardPoints || 0) : 0
        );
      } catch (error) {
        console.error("Failed to load reward balance:", error);
      }
    });

    return () => unsubscribe();
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
  const commission = Math.round(grandTotal * commissionRate);

  // Shipping + delivery date recompute whenever the amount changes, or once
  // the live settings values load in behind the defaults.
  useEffect(() => {
    setShipping(finalAmount > FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_FEE);

    const d = new Date();
    d.setDate(d.getDate() + 5);
   setDeliveryDate(
  d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
);
  }, [finalAmount, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE]);

  const applyCoupon = async () => {
    if (couponApplied) {
      alert("Coupon already applied");
      return;
    }

    if (!auth.currentUser) {
      alert("Please login first.");
      router.push("/login");
      return;
    }

    try {
      const code = coupon.trim().toUpperCase();

      const q = query(
        collection(db, "coupons"),
        where("code", "==", code)
      );
      const snapshot = await getDocs(q);

      if (snapshot.empty) {
        alert("Invalid coupon");
        return;
      }

      // Coupons here have no built-in usage cap or per-user limit — check
      // this customer hasn't already redeemed this exact code before,
      // otherwise the same coupon could be reused on every order forever.
      const redemptionCheck = await getDocs(
        query(
          collection(db, "couponRedemptions"),
          where("userId", "==", auth.currentUser.uid),
          where("code", "==", code)
        )
      );

      if (!redemptionCheck.empty) {
        alert("You've already used this coupon.");
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
  async function loadDefaultAddress() {

  try {

    const user = JSON.parse(
      localStorage.getItem("user") || "{}"
    );

    if (!user.email) return;

    const q = query(
      collection(db, "addresses"),
      where("userEmail", "==", user.email),
      where("isDefault", "==", true),
      limit(1)
    );

    const snapshot = await getDocs(q);

    if (!snapshot.empty) {

      const data = snapshot.docs[0].data();

      setName(data.fullName || "");
      setPhone(data.phone || "");

      const fullAddress = [
        data.addressLine1,
        data.addressLine2,
        data.landmark,
        data.city,
        data.state,
        data.pincode,
      ]
        .filter(Boolean)
        .join(", ");

      setAddress(fullAddress);

    }

  } catch (error) {

    console.error(error);

  }

}

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

  // Shared side-effects after an order document is created. Stock/sales are
  // NOT touched here — reserveStock() already committed them atomically
  // before the order was created (see placeCODOrder/payNow).
  const applyPostOrderEffects = async (
    firebaseUser: any,
    orderId: string,
    paymentStatus: string,
    stockIssueItems: any[] = []
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

    if (stockIssueItems.length > 0) {
      try {
        await addDoc(collection(db, "notifications"), {
          title: "⚠ Stock oversold after payment",
          message: `Order ${orderId.slice(0, 8)}: ${stockIssueItems
            .map((i) => i.name)
            .join(", ")} sold out during checkout — payment was captured, stock was not decremented. Needs manual review.`,
          type: "order",
          role: "admin",
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (e) {
        console.error("❌ Stock-issue admin notification failed:", e);
      }
    }

    // Seller notifications
    for (const item of items) {
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
      const emailIdToken = await firebaseUser.getIdToken();
      await fetch("/api/send-order-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${emailIdToken}`,
        },
        body: JSON.stringify({
          customerName: name,
          orderId,
          total: grandTotal,
        }),
      });
    } catch (e) {
      console.error("Order email failed:", e);
    }

    // Reward points: read-modify-write against Firestore atomically, not
    // just localStorage — the cached value is trivially editable and was
    // never actually the source of truth, and a plain read-then-write here
    // would let two concurrent orders both redeem against the same stale
    // balance. Re-clamps the redemption against the REAL current balance
    // at write time, not just what the page happened to load with.
    let actualRedeemed = 0;
    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await transaction.get(userRef);
        const currentPoints = userSnap.exists()
          ? Number(userSnap.data().rewardPoints || 0)
          : 0;

        actualRedeemed = Math.min(rewardValue, currentPoints);
        const newBalance = Math.max(
          0,
          currentPoints + earnedPoints - actualRedeemed
        );

        transaction.set(
          userRef,
          { rewardPoints: newBalance },
          { merge: true }
        );
      });
    } catch (error) {
      console.error("Failed to update reward points:", error);
    }

    const user = JSON.parse(localStorage.getItem("user") || "{}");
    user.name = name; user.phone = phone; user.address = address;
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

    if (actualRedeemed > 0) {
      await addDoc(collection(db, "rewardTransactions"), {
        userId: firebaseUser.uid,
        userEmail: firebaseUser.email,
        type: "Redeemed",
        points: actualRedeemed,
        createdAt: Timestamp.now(),
      });
    }

    if (couponApplied && coupon) {
      try {
        await addDoc(collection(db, "couponRedemptions"), {
          userId: firebaseUser.uid,
          code: coupon.trim().toUpperCase(),
          orderId,
          createdAt: Timestamp.now(),
        });
      } catch (e) {
        console.error("Failed to record coupon redemption:", e);
      }
    }

    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    window.dispatchEvent(new Event("cartUpdated"));
  };

  const buildOrderData = (
    firebaseUser: any,
    paymentStatus: string,
    // For online payments, this is the amount Razorpay actually
    // confirmed was captured (from verify-payments) — using it instead
    // of the client-computed grandTotal means the order record always
    // matches what was really charged, even if they somehow diverge.
    verifiedAmount?: number
  ) => {
    const finalTotal = verifiedAmount ?? grandTotal;
    // Same commissionRate either way — captured once when the page loaded,
    // before payment method is chosen, so COD and Razorpay orders stamp
    // the identical rate.
    const orderCommission =
      verifiedAmount != null
        ? Math.round(verifiedAmount * commissionRate)
        : commission;
    const orderSellerEarning = finalTotal - orderCommission;

    return {
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
      finalTotal,
      deliveryDate,
      commission: orderCommission,
      sellerEarning: orderSellerEarning,
      commissionRate,
      couponCode: couponApplied ? coupon : "",
      discount,
      // Persisted so per-vendor earnings (wallet/payouts pages) can
      // proportionally deduct redeemed reward points too, not just the
      // coupon discount — this order's total was reduced by both.
      rewardValue: redeemPoints ? rewardValue : 0,
      createdAt: Timestamp.now(),
    };
  };

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

  // Re-checks a points redemption against the REAL current balance right
  // before the order total is locked in — availablePoints in state was
  // loaded on page mount and could be stale by the time the customer
  // actually submits (e.g. redeemed in another tab in the meantime).
  const validateRewardPoints = async () => {
    if (!redeemPoints || rewardValue <= 0) return true;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser) return true; // the login check elsewhere catches this

    try {
      const snap = await getDoc(doc(db, "users", firebaseUser.uid));
      const realBalance = snap.exists()
        ? Number(snap.data().rewardPoints || 0)
        : 0;

      if (rewardValue > realBalance) {
        alert("Your reward point balance has changed — please review your order again.");
        setAvailablePoints(realBalance);
        return false;
      }

      return true;
    } catch (error) {
      console.error("Failed to re-validate reward points:", error);
      return true;
    }
  };

  const placeCODOrder = async () => {
    if (!validateForm()) return;
     if (!(await validateStock())) return;
     if (!(await validateRewardPoints())) return;

    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      alert("Please login again.");
      router.push("/login");
      return;
    }

    setLoading(true);
    try {
      // COD hasn't captured any payment yet, so a failed reservation can
      // simply block the order — nothing to reconcile.
      const reservation = await reserveStock();
      if (!reservation.ok) {
        alert(reservation.message);
        return;
      }

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

    // Must check login BEFORE opening Razorpay, not after payment succeeds
    // — otherwise a session that expires mid-checkout lets Razorpay
    // capture real money with no order ever created and no way back to it.
    const payingUser = auth.currentUser;
    if (!payingUser) {
      alert("Please login again.");
      router.push("/login");
      return;
    }

      if (!(await validateStock())) return;
      if (!(await validateRewardPoints())) return;

    const res: any = await loadRazorpayScript();
    if (!res) {
      alert("Razorpay failed");
      return;
    }

    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY) {
      alert("Razorpay Key Missing");
      return;
    }

    const idToken = await payingUser.getIdToken();

    const response = await fetch("/api/create-order", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      // Send what's in the cart, not a pre-computed total — the amount
      // actually charged is calculated server-side from real product
      // prices, not trusted from the browser.
      body: JSON.stringify({
        items: items.map((item: any) => ({ id: item.id, qty: item.qty })),
        discountAmount: discount + rewardValue,
      }),
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      alert(data.error || "Couldn't start payment. Please try again.");
      return;
    }

    const options = {
      key: process.env.NEXT_PUBLIC_RAZORPAY_KEY,
      amount: data.amount,
      currency: data.currency,
      name: "YOMICO",
      description: "Marketplace Payment",
      order_id: data.id,
      handler: async function (rzp: any) {
        const verifyIdToken = await payingUser.getIdToken();

        const verifyResponse = await fetch("/api/verify-payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${verifyIdToken}`,
          },
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
          // Payment is already captured at this point, so stock issues
          // can no longer block the order — reserve what's available and
          // flag the rest for manual follow-up instead of losing track of
          // captured payment.
          const failedItems = await reserveStockBestEffort();

          const orderRef = await addDoc(
            collection(db, "orders"),
            buildOrderData(firebaseUser, "Paid", verifyData.amount)
          );
          await applyPostOrderEffects(
            firebaseUser,
            orderRef.id,
            "Paid",
            failedItems
          );

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
  // Cheap, read-only pre-flight check — good UX (fail fast before opening
  // Razorpay) but NOT the authoritative check, since a plain read-then-write
  // has a race window. reserveStock() below is what actually commits.
  const validateStock = async () => {

  for (const item of items) {

    const snap = await getDoc(
      doc(db, "products", item.id)
    );

    if (!snap.exists()) {
      alert(`${item.name} is no longer available.`);
      return false;
    }

    const product = snap.data();

    // The real moderation gate is `active` (see admin/products/page.tsx) —
    // `status`/`approved` are dead fields nothing in the app ever sets to
    // enable a product, so checking them here blocked every product.
    if (product.active === false) {
  alert(`${item.name} is currently unavailable.`);
  return false;
}

    if ((product.stock ?? 0) < item.qty) {
      alert(
        `${item.name} has only ${product.stock} item(s) left in stock.`
      );
      return false;
    }

  }

  return true;

};

  // Authoritative stock commit: reads and decrements every item's stock
  // (plus increments sales) in a single Firestore transaction, so two
  // customers racing for the last unit can't both succeed — one gets a
  // clean rejection here instead of the order silently going out with
  // stock never actually decremented.
  const reserveStock = async (): Promise<
    { ok: true } | { ok: false; failedItem?: any; message: string }
  > => {

    try {

      await runTransaction(db, async (transaction) => {

        const refs = items.map((item: any) => doc(db, "products", item.id));
        const snaps = await Promise.all(
          refs.map((ref: any) => transaction.get(ref))
        );

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const snap = snaps[i];

          if (!snap.exists()) {
            const err: any = new Error("unavailable");
            err.failedItem = item;
            err.message = `${item.name} is no longer available.`;
            throw err;
          }

          const product: any = snap.data();

          if (product.active === false) {
            const err: any = new Error("unavailable");
            err.failedItem = item;
            err.message = `${item.name} is currently unavailable.`;
            throw err;
          }

          if ((product.stock ?? 0) < item.qty) {
            const err: any = new Error("stock");
            err.failedItem = item;
            err.message = `${item.name} has only ${product.stock ?? 0} item(s) left in stock.`;
            throw err;
          }
        }

        refs.forEach((ref: any, i: number) => {
          transaction.update(ref, {
            stock: increment(-items[i].qty),
            sales: increment(items[i].qty),
          });
        });

      });

      return { ok: true };

    } catch (err: any) {

      if (err && err.failedItem) {
        return { ok: false, failedItem: err.failedItem, message: err.message };
      }

      console.error("Stock reservation failed:", err);
      return {
        ok: false,
        message: "Something went wrong checking stock. Please try again.",
      };

    }

  };

  // Used after payment has already been captured (Razorpay), where we can
  // no longer just reject the order — money changed hands. Reserves each
  // item independently so one oversold item doesn't block stock from being
  // correctly decremented for the others; failures are collected and
  // surfaced via an admin notification instead of silently dropped.
  const reserveStockBestEffort = async () => {

    const failedItems: any[] = [];

    for (const item of items) {

      try {

        await runTransaction(db, async (transaction) => {

          const ref = doc(db, "products", item.id);
          const snap = await transaction.get(ref);

          if (!snap.exists()) {
            throw new Error("missing");
          }

          const product: any = snap.data();

          if ((product.stock ?? 0) < item.qty) {
            throw new Error("stock");
          }

          transaction.update(ref, {
            stock: increment(-item.qty),
            sales: increment(item.qty),
          });

        });

      } catch (err) {
        console.error("Stock reservation failed for", item.name, err);
        failedItems.push(item);
      }

    }

    return failedItems;

  };

  return (
    <section className="py-8 px-4 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto">
  <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-8 mb-8">

  <h1 className="text-4xl font-bold">
    💳 Secure Checkout
  </h1>

  <p className="mt-2 text-lg opacity-90">
    Complete your purchase safely with YOMICO
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
              <div className="flex justify-between items-center mb-6">

  <h2 className="text-2xl font-bold flex items-center gap-3">
    📍 Delivery Address
  </h2>

  <Link
    href="/addresses"
    className="text-green-600 font-semibold hover:underline"
  >
    Change Address
  </Link>

</div>
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
  autoComplete="name"
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
  maxLength={10}
  inputMode="numeric"
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
  autoComplete="street-address"
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
                💡 Enter a valid coupon code to receive available discounts.
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
