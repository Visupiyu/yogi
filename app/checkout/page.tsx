"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  collection,
  addDoc,
  Timestamp,
  doc,
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
  calculateShippingCharge,
  getShippingSettings,
} from "@/lib/shipping";
import { getEffectiveCommissionRate } from "@/lib/commission";
import { PAY_ON_DELIVERY_UPI } from "@/lib/upiPayment";

// Business rule: pay-on-delivery orders are settled via UPI only at the
// moment of delivery — cash is never accepted. This is the stored
// paymentMethod value (not the display label below, which is a separate
// hardcoded string and unaffected by this); the seller-side "mark Paid on
// Delivered" check (app/seller/orders/[id]/page.tsx) tests `!== "ONLINE"`,
// not an exact match to this value, so it stays correct regardless.
const PAY_ON_DELIVERY_METHOD = PAY_ON_DELIVERY_UPI;

export default function CheckoutPage() {
  const router = useRouter();

  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  // Saved structured addresses (source of truth: the `addresses` collection).
  // `name`/`phone`/`address` above are derived from the SELECTED one and remain
  // the snapshot sent to the order — the existing order API contract is unchanged.
  type SavedAddress = {
    id: string;
    fullName?: string;
    phone?: string;
    addressLine1?: string;
    addressLine2?: string;
    landmark?: string;
    city?: string;
    state?: string;
    pincode?: string;
    type?: string;
    isDefault?: boolean;
  };
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [coupon, setCoupon] = useState("");
  const [shipping, setShipping] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState(PAY_ON_DELIVERY_METHOD);
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

  // One key per COD attempt, held across retries so a resubmit after a
  // network failure reaches /api/place-order with the SAME key and resolves
  // to the same order document instead of creating a second one. Cleared
  // only once an order actually exists.
  const codIdempotencyKey = useRef<string | null>(null);

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
    loadAddresses();

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
    // Shared with the cart and with lib/orderPricing.ts, so what is shown
    // here is what the server will actually charge. The base is the
    // pre-discount item subtotal, not finalAmount: a coupon must not claw
    // back the free delivery the cart already promised at that subtotal.
    setShipping(
      calculateShippingCharge(total, {
        freeShippingThreshold: FREE_SHIPPING_THRESHOLD,
        standardShippingCharge: SHIPPING_FEE,
      })
    );

    const d = new Date();
    d.setDate(d.getDate() + 5);
   setDeliveryDate(
  d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  })
);
  }, [total, finalAmount, FREE_SHIPPING_THRESHOLD, SHIPPING_FEE]);

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
  // Flatten a structured address into the single string the order API expects.
  function flattenAddress(a: SavedAddress) {
    return [
      a.addressLine1,
      a.addressLine2,
      a.landmark,
      a.city,
      a.state,
      a.pincode,
    ]
      .filter(Boolean)
      .join(", ");
  }

  // Apply a chosen address to the order snapshot fields (name/phone/address).
  function applyAddress(a: SavedAddress) {
    setName(a.fullName || "");
    setPhone(a.phone || "");
    setAddress(flattenAddress(a));
  }

  function selectAddress(id: string) {
    const a = savedAddresses.find((x) => x.id === id);
    if (!a) return;
    setSelectedAddressId(id);
    applyAddress(a);
  }

  // Loads ALL of the customer's saved addresses (single-field userEmail query —
  // no composite index) and preselects one: an address just added from checkout
  // (?newAddress=<id>), else the default, else the first.
  async function loadAddresses() {
    try {
      const user = JSON.parse(localStorage.getItem("user") || "{}");
      if (!user.email) return;

      const snapshot = await getDocs(
        query(collection(db, "addresses"), where("userEmail", "==", user.email))
      );
      const list: SavedAddress[] = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<SavedAddress, "id">),
      }));
      setSavedAddresses(list);
      if (list.length === 0) return;

      const paramId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("newAddress")
          : null;
      const chosen =
        (paramId && list.find((a) => a.id === paramId)) ||
        list.find((a) => a.isDefault) ||
        list[0];

      setSelectedAddressId(chosen.id);
      applyAddress(chosen);
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

  // Shared side-effects after an order document is created. Stock/sales are
  // NOT touched here — the server already committed them inside the same
  // transaction as the order: /api/place-order for Pay on Delivery,
  // lib/onlineOrder.ts for Razorpay. The coupon redemption record is claimed
  // the same way, so it is never written here; couponConflict just reports
  // whether that claim lost a race, for the admin notification below.
  const applyPostOrderEffects = async (
    firebaseUser: any,
    orderId: string,
    paymentStatus: string,
    // COD now goes through /api/place-order, which moves the reward balance
    // inside the same transaction as the order and writes the ledger rows
    // itself. Running the block below as well would credit twice.
    rewardsAlreadyApplied: boolean = false,
    // ONLINE orders are finalised server-side, and lib/onlineOrder.ts sends
    // the confirmation from there so the webhook path reaches the customer
    // too. Sending again from here would mean two emails per order.
    skipConfirmationEmail: boolean = false
  ) => {
    const earnedPoints = Math.floor(grandTotal / 100);

      // Notifications moved SERVER-SIDE.
      //
      // This browser used to write the admin, seller and customer notifications
      // for every order. Doing so required firestore.rules to let any signed-in
      // client create role:"admin" documents, and the admin feed is the one
      // audience not scoped by userId -- so a customer could put arbitrary text
      // straight into an admin’s notification bell.
      //
      // Pay-on-delivery now emits them in app/api/place-order and ONLINE in
      // lib/onlineOrder.ts (which previously only did so when the webhook won
      // the finalisation race, and now covers both orders of it). Exactly one
      // set is still written per order.
      //
      // The stock-oversold and coupon-conflict admin alerts that also stood here
      // are covered by lib/onlineOrder.ts’s "Paid order needs review"
      // notification; the COD route refuses both conditions outright (409), so
      // neither can arise there.

    // Confirmation email (best-effort)
    if (!skipConfirmationEmail) try {
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
    if (!rewardsAlreadyApplied) try {
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
    if (!rewardsAlreadyApplied) {
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
    }

    // couponRedemptions is claimed server-side, inside the order transaction
    // (/api/place-order for Pay on Delivery, lib/onlineOrder.ts for Razorpay),
    // before this function runs — writing it here too would create a second,
    // redundant record for the same order.

    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    window.dispatchEvent(new Event("cartUpdated"));
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

    const firebaseUser = auth.currentUser;
    if (!firebaseUser) {
      alert("Please login again.");
      router.push("/login");
      return;
    }

    // Held across retries — see codIdempotencyKey. crypto.randomUUID is
    // available in every browser this app already targets.
    if (!codIdempotencyKey.current) {
      codIdempotencyKey.current = crypto.randomUUID().replace(/-/g, "");
    }

    setLoading(true);
    try {
      // Server-authoritative COD creation. The browser no longer builds the
      // order document, reserves stock, claims the coupon or moves reward
      // points — /api/place-order does all four in one Admin transaction,
      // pricing everything from live product/coupon/settings data.
      //
      // Stock, blocked-account and reward-balance checks now happen inside
      // that transaction against current state, so the pre-flight
      // validateStock() / validateRewardPoints() / Blocked reads this
      // function used to perform are redundant round trips. The route
      // returns the same message strings those checks used to show.
      const idToken = await firebaseUser.getIdToken();
      const response = await fetch("/api/place-order", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        // Order INTENT only. No price, total, discount, reward value,
        // shipping, commission or vendor id is sent — a tampered request
        // cannot influence what the customer is charged.
        body: JSON.stringify({
          items: items.map((item: any) => ({
            id: item.id,
            qty: item.qty,
            size: item.size,
            color: item.color,
          })),
          couponCode: couponApplied && coupon ? coupon.trim().toUpperCase() : null,
          redeemPoints,
          paymentMethod: "PAY_ON_DELIVERY_UPI",
          customerName: name,
          phone,
          address,
          idempotencyKey: codIdempotencyKey.current,
        }),
      });

      const data = await response.json();

      if (!response.ok || data.error || !data.orderId) {
        alert(data.error || "Order Failed");
        return;
      }

      // The order exists now, so this attempt is finished — a later checkout
      // must start a fresh key.
      codIdempotencyKey.current = null;

      const paymentAmount = Number(data.paymentAmount || 0);

      // alreadyPlaced means the route matched this idempotency key to an
      // order that already exists — a double submit, or a retry after a lost
      // response. Re-running the post-order effects would send a second
      // confirmation email and duplicate the admin/seller/customer
      // notifications for one order, so they are skipped entirely.
      //
      // The cart is still cleared: it is local, idempotent, writes nothing to
      // Firestore, and leaving a placed order sitting in the cart is its own
      // bug.
      if (data.alreadyPlaced) {
        localStorage.removeItem("cart");
        localStorage.removeItem("checkoutItems");
        window.dispatchEvent(new Event("cartUpdated"));

        alert(
          "This order has already been placed.\n\n" +
            `Amount to Pay: ₹${paymentAmount.toLocaleString("en-IN")}`
        );
        window.location.href = "/orders";
        return;
      }

      // Notifications, the confirmation email and cart cleanup still run
      // here. Reward points are skipped: the route already moved the balance
      // and wrote the ledger rows atomically with the order.
      await applyPostOrderEffects(firebaseUser, data.orderId, "Pending", true);

      alert(
        "🎉 Your Order is Confirmed!\n\n" +
          "Payment: Pay on Delivery (UPI Only)\n" +
          `Amount to Pay: ₹${paymentAmount.toLocaleString("en-IN")}\n\n` +
          "Please pay the exact amount by UPI when your order arrives."
      );
      window.location.href = "/orders";
    } catch (error) {
      console.error("Checkout Error:", error);
      alert("Order Failed");
    } finally {
      setLoading(false);
    }
  };

  const payNow = async () => {
    // Set immediately, before any validation/network work, so a second
    // click can't re-enter this function while the first click is still
    // validating/creating the order — every exit path below must reset
    // this back to false, or the button gets stuck disabled.
    setLoading(true);

    if (!validateForm()) {
      setLoading(false);
      return;
    }

    // Must check login BEFORE opening Razorpay, not after payment succeeds
    // — otherwise a session that expires mid-checkout lets Razorpay
    // capture real money with no order ever created and no way back to it.
    const payingUser = auth.currentUser;
    if (!payingUser) {
      alert("Please login again.");
      router.push("/login");
      setLoading(false);
      return;
    }

    // Same reasoning as the login check above: a blocked customer can
    // still hold a live session, and Razorpay must never be opened for
    // one — Firestore rules would reject the order write after payment
    // already captured real money, with no order created to reconcile.
    const payingUserSnap = await getDoc(doc(db, "users", payingUser.uid));
    if (payingUserSnap.exists() && payingUserSnap.data().status === "Blocked") {
      alert("Your account has been blocked. Please contact support.");
      setLoading(false);
      return;
    }

      if (!(await validateStock())) { setLoading(false); return; }
      if (!(await validateRewardPoints())) { setLoading(false); return; }

    const res: any = await loadRazorpayScript();
    if (!res) {
      alert("Razorpay failed");
      setLoading(false);
      return;
    }

    if (!process.env.NEXT_PUBLIC_RAZORPAY_KEY) {
      alert("Razorpay Key Missing");
      setLoading(false);
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
      // prices, not trusted from the browser. Same for the discounts: the
      // coupon code and a redeem flag, never the rupee value of either.
      body: JSON.stringify({
      items: items.map((item: any) => ({
        id: item.id,
        qty: item.qty,
        size: item.size || "",
        color: item.color || "",
        variantId: item.variantId,
      })),
        couponCode: couponApplied && coupon ? coupon.trim().toUpperCase() : null,
        redeemPoints,
        // Delivery details are user input, not money. The server stores them
        // with the priced intent so finalisation — and the webhook, which has
        // no session at all — can build the order without the browser
        // supplying anything financial afterwards.
        customerName: name,
        phone,
        address,
      }),
    });
    const data = await response.json();

    if (!response.ok || data.error) {
      alert(data.error || "Couldn't start payment. Please try again.");
      setLoading(false);
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
        // Server-authoritative finalisation.
        //
        // This used to verify the payment, then reserve stock, then addDoc()
        // the whole order document straight from the browser — with prices,
        // totals, discounts, commission, sellerEarning and vendorIds all
        // taken from React state, a random document id, and four separate
        // writes that could half-complete after the card was charged.
        //
        // Now it sends the three Razorpay identifiers and nothing else. The
        // server re-verifies with Razorpay, loads the order intent it priced
        // and stored before this modal opened, and writes the order, stock,
        // coupon and reward changes in one transaction keyed on the payment
        // id — so a double callback, a refresh, or the webhook arriving first
        // all resolve to the same single order.
        setLoading(true);

        try {
          const finalizeIdToken = await payingUser.getIdToken();
          const finalizeResponse = await fetch("/api/finalize-online-order", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${finalizeIdToken}`,
            },
            // Payment identifiers ONLY. No amount, no totals, no discount,
            // no reward value, no commission, no vendor ids, no
            // paymentStatus — the server derives every one of those.
            body: JSON.stringify({
              razorpay_order_id: rzp.razorpay_order_id,
              razorpay_payment_id: rzp.razorpay_payment_id,
              razorpay_signature: rzp.razorpay_signature,
            }),
          });

          const finalizeData = await finalizeResponse.json();

          if (!finalizeResponse.ok || !finalizeData?.orderId) {
            // The payment may well have succeeded even though this call did
            // not — the webhook reconciles independently. Never tell the
            // customer to pay again.
            alert(
              finalizeData?.error ||
                "We're confirming your payment. Check My Orders in a moment — do not pay again."
            );
            window.location.href = "/orders";
            return;
          }

          const firebaseUser = auth.currentUser;

          // Notifications, the confirmation email and cart cleanup. Skipped
          // when the order already existed (webhook first, or a repeat
          // callback) so a retry cannot send a second confirmation email or
          // duplicate the notifications. Reward points are always skipped:
          // the server moved the balance inside the order transaction.
          if (firebaseUser && !finalizeData.alreadyPlaced) {
            await applyPostOrderEffects(
              firebaseUser,
              finalizeData.orderId,
              "Paid",
              true,
              // lib/onlineOrder.ts already sent the confirmation from the
              // server, so that the webhook path reaches the customer too.
              true
            );
          } else {
            localStorage.removeItem("cart");
            localStorage.removeItem("checkoutItems");
            window.dispatchEvent(new Event("cartUpdated"));
          }

          alert(
            finalizeData.alreadyPlaced
              ? "This order has already been placed."
              : "Order Placed Successfully"
          );
          window.location.href = "/orders";
        } catch (error) {
          console.error("Checkout Error:", error);
          alert(
            "We're confirming your payment. Check My Orders in a moment — do not pay again."
          );
          window.location.href = "/orders";
        } finally {
          setLoading(false);
        }
      },
      modal: {
        ondismiss: function () {
          setLoading(false);
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
  // has a race window. The real commit happens server-side, in the order
  // transaction: /api/place-order (rejects on shortfall) for Pay on Delivery,
  // lib/onlineOrder.ts (records and flags, never rejects) for Razorpay.
  const validateStock = async () => {

  // Stock is held per product, but lib/cart.ts keys cart lines on
  // id + size + color — so one product ordered in two sizes is two lines
  // sharing an id. Comparing each line's qty against the product's stock
  // separately passed 3 + 3 of a product with 4 in stock, because neither
  // line alone exceeded it, and the customer only found out after
  // /api/create-order (or, on the Razorpay path, after paying).
  //
  // Aggregate per product first, matching what /api/place-order and
  // lib/onlineOrder.ts already do for the authoritative check.
  const requestedByProduct = new Map<string, number>();
  const lineCountByProduct = new Map<string, number>();
  const displayNameByProduct = new Map<string, string>();

  for (const item of items) {
    requestedByProduct.set(
      item.id,
      (requestedByProduct.get(item.id) || 0) + Number(item.qty || 0)
    );
    lineCountByProduct.set(
      item.id,
      (lineCountByProduct.get(item.id) || 0) + 1
    );
    if (!displayNameByProduct.has(item.id)) {
      displayNameByProduct.set(item.id, item.name);
    }
  }

  // One read per product rather than one per cart line.
  for (const [productId, requested] of requestedByProduct) {

    const name = displayNameByProduct.get(productId) || "This product";

    const snap = await getDoc(
      doc(db, "products", productId)
    );

    if (!snap.exists()) {
      alert(`${name} is no longer available.`);
      return false;
    }

    const product = snap.data();

    // The real moderation gate is `active` (see admin/products/page.tsx) —
    // `status`/`approved` are dead fields nothing in the app ever sets to
    // enable a product, so checking them here blocked every product.
    if (product.active === false) {
      alert(`${name} is currently unavailable.`);
      return false;
    }

    const available = product.stock ?? 0;

    if (available < requested) {
      // When several lines share this product the bare "only N left" reads as
      // wrong to a customer looking at two rows that each seem fine, so the
      // combined figure is spelled out. A single-line cart keeps the original
      // message unchanged.
      alert(
        (lineCountByProduct.get(productId) || 1) > 1
          ? `${name} has only ${available} item(s) left in stock, but your cart has ${requested} across ${lineCountByProduct.get(
              productId
            )} options.`
          : `${name} has only ${available} item(s) left in stock.`
      );
      return false;
    }

  }

  return true;

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
Select a delivery address for this order.
</p>
              {savedAddresses.length === 0 ? (
                <div className="text-center border border-dashed border-gray-300 rounded-2xl py-8 px-4">
                  <p className="text-gray-500 mb-4">
                    You have no saved addresses yet.
                  </p>
                  <Link
                    href="/addresses/add?returnTo=checkout"
                    className="inline-block bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl font-semibold"
                  >
                    + Add New Address
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {savedAddresses.map((a) => {
                    const selected = a.id === selectedAddressId;
                    return (
                      <label
                        key={a.id}
                        className={`flex gap-3 p-4 rounded-2xl border cursor-pointer transition ${
                          selected
                            ? "border-green-600 bg-green-50"
                            : "border-gray-200 hover:border-gray-300"
                        }`}
                      >
                        <input
                          type="radio"
                          name="checkout-address"
                          value={a.id}
                          checked={selected}
                          onChange={() => selectAddress(a.id)}
                          className="mt-1 accent-green-600 w-4 h-4 shrink-0"
                        />
                        <div className="min-w-0 text-sm">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">
                              {a.type || "Address"}
                            </span>
                            {a.isDefault && (
                              <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-semibold">
                                DEFAULT
                              </span>
                            )}
                          </div>
                          <p className="font-medium text-gray-800 mt-1">
                            {a.fullName}
                          </p>
                          <p className="text-gray-600">{a.phone}</p>
                          <p className="text-gray-600 break-words">
                            {[a.addressLine1, a.addressLine2, a.landmark]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                          <p className="text-gray-600">
                            {[a.city, a.state].filter(Boolean).join(", ")}
                            {a.pincode ? ` - ${a.pincode}` : ""}
                          </p>
                        </div>
                      </label>
                    );
                  })}

                  <Link
                    href="/addresses/add?returnTo=checkout"
                    className="inline-block text-green-700 font-semibold hover:underline mt-1"
                  >
                    + Add New Address
                  </Link>
                </div>
              )}
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
                    paymentMethod === PAY_ON_DELIVERY_METHOD
                      ? "border-green-600 bg-green-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <input
                    type="radio"
                    value={PAY_ON_DELIVERY_METHOD}
                    checked={paymentMethod === PAY_ON_DELIVERY_METHOD}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                    className="w-4 h-4 accent-green-600"
                  />
                  <div>
                    <p className="font-semibold">Pay on Delivery (UPI Only)</p>
                    <p className="text-sm text-gray-500">
                      Pay securely via UPI when your order is delivered.
                      Cash is not accepted.
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
                    FREE_SHIPPING_THRESHOLD - total
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
