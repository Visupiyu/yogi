import Razorpay from "razorpay";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { hasStockBearingVariants } from "@/lib/products/inventory";
import { DEFAULT_DELIVERY_COST } from "@/lib/deliveryRules";
import { Timestamp } from "firebase-admin/firestore";
import type { MobilePaymentIntent, MobilePricedItem } from "@/lib/mobileOnlineOrder";

// ---------------------------------------------------------------------------
// Server-authoritative Razorpay order creation for the YOMICO CUSTOMER MOBILE
// APP's "Pay Online" checkout option (screens/CheckoutScreen.tsx).
//
// Mirrors app/api/create-order's ONLINE branch, but reads the caller's own
// live Firestore `cart` collection (the mobile cart) rather than an items
// array in the request body (the web cart lives client-side), and prices
// using the SAME formula app/api/mobile/place-order already established for
// the mobile catalogue — subtotal + shipping + gstAmount - discountAmount —
// since that is what CheckoutScreen.tsx's Bill Details actually shows the
// customer before they tap Pay Online. computeOrderPricing (lib/orderPricing)
// is deliberately NOT reused here: its OrderPricing type has no GST concept
// at all (see app/api/mobile/place-order's own top comment on why the two
// pricing shapes diverge), so charging its finalTotal would silently undercut
// what CheckoutScreen displayed.
//
// normalizeProduct/priceCoupon/the shipping constants below are DUPLICATED
// from app/api/mobile/place-order/route.ts on purpose, not imported — that
// route already deliberately keeps its own module-local copies rather than
// sharing with app/api/place-order, for the same reason: two pricing paths
// that must not silently drift into each other when one is edited without
// the other in mind. This route follows the same precedent.
//
// Nothing here creates the final YOMICO order or touches stock — this only
// prices the cart and opens a Razorpay order for it. The order is created
// only after payment is verified, by app/api/mobile/finalize-payment (or the
// webhook), via lib/mobileOnlineOrder.ts#finalizeMobileOnlineOrder.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

const FREE_SHIPPING_THRESHOLD = 499;
const STANDARD_SHIPPING_CHARGE = 49;

// Mirrors services/productService.ts's normalizeProduct() field precedence —
// see app/api/mobile/place-order/route.ts's identical copy.
function normalizeProduct(data: FirebaseFirestore.DocumentData) {
  return {
    name: data.name || data.title || "",
    price: typeof data.price === "number" ? data.price : Number(data.sellingPrice ?? 0),
    image:
      data.image ||
      data.thumbnail ||
      (Array.isArray(data.images) ? data.images[0] : "") ||
      "",
    mrp: typeof data.mrp === "number" ? data.mrp : 0,
    discountPercent:
      typeof data.discountPercent === "number"
        ? data.discountPercent
        : Number(data.discount ?? 0),
    gstPercent: typeof data.gstPercent === "number" ? data.gstPercent : 0,
    vendorId: typeof data.vendorId === "string" ? data.vendorId : "",
    vendorName: typeof data.vendorName === "string" ? data.vendorName : "",
    stock: data.stock,
    active: data.active,
  };
}

// Mirrors services/couponService.ts's validateCoupon() — see
// app/api/mobile/place-order/route.ts's identical copy.
async function priceCoupon(
  rawCode: string,
  subtotal: number
): Promise<{ code: string; discountAmount: number }> {
  const code = rawCode.trim().toUpperCase();

  const snap = await getAdminDb()
    .collection("coupons")
    .where("code", "==", code)
    .limit(1)
    .get();

  if (snap.empty) {
    throw new Error("This coupon code is invalid.");
  }

  const coupon = snap.docs[0].data();

  if (coupon.active === false) {
    throw new Error("This coupon is no longer active.");
  }

  if (coupon.expiresAt?.toDate && coupon.expiresAt.toDate() < new Date()) {
    throw new Error("This coupon has expired.");
  }

  if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
    throw new Error(`This coupon needs a minimum order of ₹${coupon.minOrderValue}.`);
  }

  let discountAmount = 0;

  if (coupon.discountType === "percent") {
    discountAmount = (subtotal * (coupon.discountValue || 0)) / 100;

    if (coupon.maxDiscount) {
      discountAmount = Math.min(discountAmount, coupon.maxDiscount);
    }
  } else {
    discountAmount = coupon.discountValue || 0;
  }

  discountAmount = Math.min(discountAmount, subtotal);

  return { code, discountAmount };
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in to place an order." }, { status: 401 });
    }

    if (!(await isWithinRateLimit("mobile-create-payment-order", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json(
        { error: "Too many order attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let body: any;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";
    const deliverySlot = typeof body.deliverySlot === "string" ? body.deliverySlot.trim() : "";

    if (!customerName || !phone || !address) {
      return Response.json({ error: "Please fill all delivery details." }, { status: 400 });
    }

    if (phone.length < 10) {
      return Response.json({ error: "Please enter a valid mobile number." }, { status: 400 });
    }

    const rawCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    const couponCode = rawCode.length > 0 && rawCode.length <= 50 ? rawCode : null;

    const db = getAdminDb();

    // Caller's own active cart — same filter as app/api/mobile/place-order.
    const cartSnap = await db
      .collection("cart")
      .where("userId", "==", requester.uid)
      .where("savedForLater", "==", false)
      .get();

    if (cartSnap.empty) {
      return Response.json({ error: "Your cart is empty." }, { status: 400 });
    }

    const cartDocs = cartSnap.docs;

    const qtyByProduct = new Map<string, number>();
    for (const cartDoc of cartDocs) {
      const data = cartDoc.data();
      const productId = typeof data.productId === "string" ? data.productId : "";
      const qty = Number(data.quantity);

      if (!productId || !(qty > 0)) {
        return Response.json({ error: "Invalid item in cart." }, { status: 400 });
      }

      qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + qty);
    }

    const productIds = [...qtyByProduct.keys()];
    const productRefs = productIds.map((id) => db.collection("products").doc(id));
    const productSnaps = await Promise.all(productRefs.map((ref) => ref.get()));

    const liveProducts = new Map<string, ReturnType<typeof normalizeProduct>>();

    for (let i = 0; i < productIds.length; i++) {
      const productId = productIds[i];
      const snap = productSnaps[i];
      const required = qtyByProduct.get(productId) || 0;

      const matchingCartDoc = cartDocs.find((d) => d.data().productId === productId);
      const label = (matchingCartDoc?.data().name as string) || "This product";

      if (!snap.exists) {
        return Response.json({ error: `${label} is no longer available.` }, { status: 409 });
      }

      const product = normalizeProduct(snap.data()!);

      if (product.active === false) {
        return Response.json({ error: `${label} is no longer available.` }, { status: 409 });
      }

      // Same Strategy-1 restriction app/api/mobile/place-order enforces — the
      // mobile catalogue's selectedVariants is display-only, never a real
      // variant id, so a stock-bearing variant product cannot be safely
      // decremented from this route either.
      if (hasStockBearingVariants((snap.data() as { variants?: unknown })?.variants)) {
        return Response.json(
          {
            error: `${label} has options that must be selected on the YOMICO website — please order it from yomico.in.`,
          },
          { status: 409 }
        );
      }

      const availableStock = Number(product.stock ?? 0);

      if (availableStock < required) {
        return Response.json({ error: `Only ${availableStock} left for ${label}.` }, { status: 409 });
      }

      liveProducts.set(productId, product);
    }

    const items: MobilePricedItem[] = cartDocs.map((cartDoc) => {
      const data = cartDoc.data();
      const product = liveProducts.get(data.productId as string)!;

      return {
        id: cartDoc.id,
        userId: requester.uid,
        productId: data.productId,
        name: product.name,
        image: product.image,
        price: product.price,
        mrp: product.mrp,
        discountPercent: product.discountPercent,
        gstPercent: product.gstPercent,
        quantity: Number(data.quantity),
        vendorId: product.vendorId,
        vendorName: product.vendorName,
        savedForLater: false,
        ...(data.selectedVariants ? { selectedVariants: data.selectedVariants } : {}),
      };
    });

    const vendorIds = [...new Set(items.map((i) => i.vendorId).filter(Boolean))];

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const gstAmount = items.reduce(
      (sum, i) => sum + (i.price * i.quantity * (i.gstPercent || 0)) / 100,
      0
    );

    const settingsSnap = await db.collection("settings").doc("global").get();
    const settingsData = settingsSnap.exists ? settingsSnap.data() : null;

    const freeShippingThreshold =
      typeof settingsData?.freeShippingThreshold === "number"
        ? settingsData.freeShippingThreshold
        : FREE_SHIPPING_THRESHOLD;

    const standardShippingCharge =
      typeof settingsData?.standardShippingCharge === "number"
        ? settingsData.standardShippingCharge
        : STANDARD_SHIPPING_CHARGE;

    const shipping = subtotal >= freeShippingThreshold ? 0 : standardShippingCharge;

    const deliveryCost =
      typeof settingsData?.deliveryCost === "number" ? settingsData.deliveryCost : DEFAULT_DELIVERY_COST;
    const freeDeliveryApplied = subtotal >= freeShippingThreshold;

    let discountAmount = 0;
    let resolvedCouponCode: string | null = null;

    if (couponCode) {
      try {
        const priced = await priceCoupon(couponCode, subtotal);
        discountAmount = priced.discountAmount;
        resolvedCouponCode = priced.code;
      } catch (couponError: any) {
        return Response.json(
          { error: couponError?.message || "Unable to apply coupon." },
          { status: 400 }
        );
      }
    }

    // Math.max(1, ...) guards against a ₹0 Razorpay order (which Razorpay
    // itself rejects) — app/api/mobile/place-order has no such guard because
    // Pay on Delivery never touches Razorpay.
    const finalTotal = Math.max(1, Math.round(subtotal + shipping + gstAmount - discountAmount));

    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const options = {
      amount: finalTotal * 100,
      currency: "INR",
      receipt: "mobile_receipt_" + Math.random().toString(36).slice(2),
      // Retrievable during verification, exactly like app/api/create-order —
      // lib/razorpayVerify.ts's verifyRazorpayPayment reads both back.
      notes: {
        expectedAmount: String(finalTotal * 100),
        verifiedUid: requester.uid,
      },
    };

    let order;
    try {
      order = await razorpay.orders.create(options);
    } catch (err) {
      console.error("mobile/create-payment-order: Razorpay order creation failed:", err);
      return Response.json(
        { error: "Couldn't start payment. Please try again." },
        { status: 500 }
      );
    }

    const intent: MobilePaymentIntent = {
      platform: "mobile",
      uid: requester.uid,
      email: requester.email,
      customerName,
      phone,
      address,
      deliverySlot,
      couponCode: resolvedCouponCode,
      cartItemIds: cartDocs.map((d) => d.id),
      items,
      vendorIds,
      subtotal,
      gstAmount,
      shipping,
      deliveryCost,
      freeDeliveryApplied,
      discountAmount,
      finalTotal,
      expectedAmountPaise: finalTotal * 100,
      razorpayOrderId: order.id,
      status: "created",
      createdAt: Timestamp.now(),
    };

    try {
      await db.collection("paymentIntents").doc(order.id).set(intent);
    } catch (error) {
      // Without the intent, finalisation has nothing to build an order from,
      // so this must fail BEFORE the customer sees the payment sheet.
      console.error("mobile/create-payment-order: failed to persist payment intent:", error);
      return Response.json(
        { error: "Couldn't start payment. Please try again." },
        { status: 500 }
      );
    }

    // Only what the mobile client needs to open the Razorpay sheet. Never the
    // key secret or any other server credential.
    return Response.json({
      razorpayOrderId: order.id,
      amount: finalTotal * 100,
      currency: "INR",
      keyId: process.env.RAZORPAY_KEY_ID,
    });
  } catch (error) {
    console.error("mobile/create-payment-order: unexpected failure:", error);
    return Response.json(
      { error: "Something went wrong while starting payment. Please try again." },
      { status: 500 }
    );
  }
}
