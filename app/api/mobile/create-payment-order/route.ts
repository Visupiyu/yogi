import Razorpay from "razorpay";
import { assertRazorpayTestKeyInPreview } from "@/lib/razorpayEnv";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import {
  hasStockBearingVariants,
  planVariantDecrements,
  type VariantStockEntry,
} from "@/lib/products/inventory";
import { findVariantById, variantAttributes, effectiveVariantPrice } from "@/lib/products/variantSelection";
import { isValidOrderQuantity, INVALID_QUANTITY_MESSAGE } from "@/lib/orderQuantity";
import { isProductVisible } from "@/lib/products/visibility";
import { resolveCommissionRate } from "@/lib/orderPricing";
import { evaluateCoupon, normalizeCouponCode } from "@/lib/coupons/couponRules";
import { loadCouponByCode, hasPriorCouponRedemption } from "@/lib/coupons/couponServer";
import { productBasePrice, payableTotal } from "@/lib/pricing/priceRules";
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
// the mobile catalogue — subtotal + shipping - discountAmount (prices are
// GST-inclusive; gstAmount is always 0) —
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

// Mirrors services/productService.ts's normalizeProduct() field precedence,
// except the base price (lib/pricing/priceRules.ts: sellingPrice first) — see
// app/api/mobile/place-order/route.ts's identical copy.
function normalizeProduct(data: FirebaseFirestore.DocumentData) {
  return {
    name: data.name || data.title || "",
    price: productBasePrice(data),
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

// Coupons are priced by the shared evaluator (lib/coupons/couponRules.ts) —
// the same rules as the web checkout and mobile COD. Only the code is read
// from the request; any client discount amount is ignored.

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

    // Canonical UPPERCASE code; any discount amount in the body is ignored.
    const couponCode = normalizeCouponCode(body.couponCode);

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
    // Per-(product, variant) demand — Strategy 1, the SAME shape and rule
    // app/api/mobile/place-order uses for COD: a product is validated on the
    // variant path only when EVERY cart line for it carries a variantId.
    const variantDemandByProduct = new Map<string, Map<string, number>>();
    const productHasNonVariantLine = new Set<string>();

    for (const cartDoc of cartDocs) {
      const data = cartDoc.data();
      const productId = typeof data.productId === "string" ? data.productId : "";
      const qty = data.quantity;

      if (!productId) {
        return Response.json({ error: "Invalid item in cart." }, { status: 400 });
      }

      // Whole units only — refused before any Razorpay order exists
      // (lib/orderQuantity, the same rule every checkout path applies).
      if (!isValidOrderQuantity(qty)) {
        return Response.json({ error: INVALID_QUANTITY_MESSAGE }, { status: 400 });
      }

      qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + qty);

      const variantId = typeof data.variantId === "string" ? data.variantId : "";
      if (variantId) {
        let m = variantDemandByProduct.get(productId);
        if (!m) {
          m = new Map();
          variantDemandByProduct.set(productId, m);
        }
        m.set(variantId, (m.get(variantId) || 0) + qty);
      } else {
        productHasNonVariantLine.add(productId);
      }
    }

    const productIds = [...qtyByProduct.keys()];
    const productRefs = productIds.map((id) => db.collection("products").doc(id));
    const productSnaps = await Promise.all(productRefs.map((ref) => ref.get()));

    const liveProducts = new Map<string, ReturnType<typeof normalizeProduct>>();
    // Seller's raw variants[] for products on the variant path, kept so the
    // items map below stores SERVER-verified attributes rather than trusting
    // the cart's client-written selectedVariants — mirrors place-order.
    const variantsByProduct = new Map<string, VariantStockEntry[]>();

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

      // Publication gate — refused before any Razorpay order is created.
      if (!isProductVisible(snap.data())) {
        return Response.json({ error: `${label} is no longer available.` }, { status: 409 });
      }

      const rawVariants = (snap.data() as { variants?: unknown })?.variants;

      // Stock-bearing (Strategy 1) variant product — validate the SAME way
      // app/api/mobile/place-order does for COD, so ONLINE and COD enforce one
      // identical variant contract. This route only VALIDATES (and prices);
      // inventory is decremented later, at finalize-payment time.
      if (hasStockBearingVariants(rawVariants)) {
        // Every line for this product must carry the seller's own variantId. A
        // line without one is a stale cart entry (added before variant support)
        // or tampered — reject rather than fall back to product.stock.
        if (productHasNonVariantLine.has(productId)) {
          return Response.json(
            {
              error: `Please choose an option (such as size or colour) for ${label} before checking out.`,
            },
            { status: 409 }
          );
        }

        const variantDemand = variantDemandByProduct.get(productId)!;
        const variants = rawVariants as VariantStockEntry[];

        // A demanded variantId absent from the seller's current variants —
        // stale (deleted/edited since add-to-cart) or tampered. Refuse.
        for (const variantId of variantDemand.keys()) {
          if (!findVariantById(variants as unknown as { id?: string }[], variantId)) {
            return Response.json(
              {
                error: `One of the options selected for ${label} is no longer available. Please remove it from your cart and select again.`,
              },
              { status: 409 }
            );
          }
        }

        // Per-variant stock check. Unlike place-order the plan is discarded —
        // nothing is decremented on this route — but the availability rule is
        // identical, so an out-of-stock variant is refused BEFORE any Razorpay
        // order is created.
        const plan = planVariantDecrements(variants, variantDemand);
        if (!plan.allSatisfied) {
          const shortfall = plan.shortfalls[0];
          return Response.json(
            { error: `Only ${shortfall?.available ?? 0} left for ${label} in the selected option.` },
            { status: 409 }
          );
        }

        variantsByProduct.set(productId, variants);
        liveProducts.set(productId, product);
        continue;
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
      const variantId = typeof data.variantId === "string" ? data.variantId : "";

      // Server-verified attributes when this line resolved to a real variant,
      // rather than trusting the cart's client-written selectedVariants for
      // what gets stored on the payment intent (and later the order). Mirrors
      // app/api/mobile/place-order exactly.
      const resolvedVariant = variantId
        ? findVariantById(
            (variantsByProduct.get(data.productId as string) || []) as unknown as {
              id?: string;
            }[],
            variantId
          )
        : null;

      const selectedVariants = resolvedVariant
        ? variantAttributes(
            resolvedVariant as { attributes?: Record<string, string> | null }
          )
        : data.selectedVariants;

      return {
        id: cartDoc.id,
        userId: requester.uid,
        productId: data.productId,
        name: product.name,
        image: product.image,
        // Per-variant price when the seller set one (> 0), else the product's
        // base price — the same rule the web path uses (effectiveVariantPrice).
        price: effectiveVariantPrice(product.price, resolvedVariant),
        mrp: product.mrp,
        discountPercent: product.discountPercent,
        gstPercent: product.gstPercent,
        quantity: Number(data.quantity),
        vendorId: product.vendorId,
        vendorName: product.vendorName,
        savedForLater: false,
        ...(selectedVariants ? { selectedVariants } : {}),
        ...(variantId ? { variantId } : {}),
      };
    });

    const vendorIds = [...new Set(items.map((i) => i.vendorId).filter(Boolean))];

    const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    // GST-inclusive prices: never added on top (see mobile place-order).
    const gstAmount = 0;

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

    // Captured with the priced intent so the finalizer stamps the rate that
    // was in effect when the customer was charged (see mobile place-order).
    const commissionRate = resolveCommissionRate(settingsData);

    const deliveryCost =
      typeof settingsData?.deliveryCost === "number" ? settingsData.deliveryCost : DEFAULT_DELIVERY_COST;
    const freeDeliveryApplied = subtotal >= freeShippingThreshold;

    let discountAmount = 0;
    let resolvedCouponCode: string | null = null;

    if (couponCode) {
      const evaluated = evaluateCoupon(await loadCouponByCode(db, couponCode), subtotal);
      if (!evaluated.ok) {
        return Response.json({ error: evaluated.message }, { status: 400 });
      }
      // Refused BEFORE any Razorpay order exists. The redemption itself is
      // claimed at finalisation (lib/mobileOnlineOrder.ts), exactly like the
      // web ONLINE flow; a payment that races past this check is flagged
      // couponConflict + needsReview there rather than silently discounted twice.
      if (await hasPriorCouponRedemption(db, requester.uid, couponCode)) {
        return Response.json({ error: "You've already used this coupon." }, { status: 400 });
      }
      discountAmount = evaluated.discountAmount;
      resolvedCouponCode = couponCode;
    }

    // payableTotal(): whole rupees, minimum ₹1 (Razorpay rejects a ₹0 order) —
    // the same rule mobile Pay on Delivery and the web checkout apply.
    const finalTotal = payableTotal(subtotal + shipping - discountAmount);

    // Preview must never touch the LIVE Razorpay account — fail closed before
    // creating the order if a Preview deployment was given a non-test key.
    assertRazorpayTestKeyInPreview();

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
      commissionRate,
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
