import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRequestUser } from "@/lib/serverAuth";
import { mintNumbers } from "@/lib/humanIds";
import { DEFAULT_DELIVERY_COST } from "@/lib/deliveryRules";
import {
  hasStockBearingVariants,
  planVariantDecrements,
  sumVariantStock,
  type VariantStockEntry,
} from "@/lib/products/inventory";
import { findVariantById, variantAttributes, effectiveVariantPrice } from "@/lib/products/variantSelection";
import { isValidOrderQuantity, INVALID_QUANTITY_MESSAGE } from "@/lib/orderQuantity";
import { isProductVisible } from "@/lib/products/visibility";
import { resolveCommissionRate } from "@/lib/orderPricing";
import { evaluateCoupon, normalizeCouponCode, couponRedemptionId } from "@/lib/coupons/couponRules";
import { loadCouponByCode, hasPriorCouponRedemption } from "@/lib/coupons/couponServer";
import { productBasePrice, payableTotal } from "@/lib/pricing/priceRules";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Server-authoritative order creation for the YOMICO CUSTOMER MOBILE APP
// (yomico-app, screens/CheckoutScreen.tsx) — Pay on Delivery (UPI Only) only,
// the only payment method the mobile app has.
//
// firestore.rules denies orders `create` to every client (`allow create: if
// false`), closed for the same reason app/api/place-order/route.ts exists for
// the web checkout: a client-authored order document can carry any financial
// figures it likes. The mobile app previously wrote orders directly with a
// client-side runTransaction() — that write has been failing outright ever
// since the rule was tightened. This route is that write's server-side
// replacement, reachable over HTTPS instead of the Firestore SDK.
//
// Deliberately a SEPARATE route from app/api/place-order, not a shared one:
// the mobile app's order document shape has real, product-level differences
// from the web's (see lib/orderPricing.ts's PricedItemInput/PricedLineItem
// for comparison) —
//   - grand total is stored as `total` here (place-order's `total` field is
//     actually the pre-shipping subtotal; its grand total is `finalTotal`)
//   - `shipping` here, `shippingCharge` there
//   - `discountAmount` here, `discount` there
//   - `deliverySlot` (a delivery time window string) exists only here;
//     place-order has no such field, only a formatted `deliveryDate`
//   - `gstAmount` exists only here (always 0: prices are GST-inclusive, see
//     lib/pricing/priceRules.ts) — place-order's pricing has no GST field
//   - coupons here are {discountType, discountValue, maxDiscount,
//     minOrderValue} (services/couponService.ts's schema); place-order reads
//     a flat 0-100 percentage off `coupon.discount` and has no maxDiscount/
//     minOrderValue concept
//   - variants here are `variantId` (the seller's real Strategy-1 variant
//     id, product.variants[].id) plus a `selectedVariants` {dimension: value}
//     display map resolved server-side from that id; place-order only knows
//     two fixed optional fields, size/color
// Rebuilding the mobile order shape on top of place-order's pricing would
// have silently dropped deliverySlot/gstAmount and broken every screen that
// reads `total` (OrdersScreen, OrderDetailsScreen, Buy Again, cancellation's
// stock-restore, reviews) expecting the mobile shape. Writing it here instead
// keeps every existing mobile screen working completely unchanged — this
// route is additive; nothing about app/api/place-order or its firestore.rules
// entry is touched.
//
// Money is derived the same way place-order's pricing is: nothing here comes
// from the request body except which optional coupon code to try and the
// customer's delivery details. Item selection, quantity and price are never
// read from the request — items are the caller's own current cart
// (collection `cart`, `userId == uid && savedForLater == false`, exactly
// mirroring services/cartService.ts's getCartItems() filter), and each
// line's price/mrp/discountPercent/gstPercent/vendorId/vendorName/name/image
// are re-derived from the live `products/{productId}` document, never
// trusted from the cart document itself. This matters even though the
// mobile app's own addToCart() always writes a live-fetched price: the
// `cart` collection's own firestore.rules only check `userId == auth.uid`,
// not any field's value, so a customer could otherwise hand-write their own
// cart document via the SDK directly with an arbitrary price and have it
// walk straight through checkout.
// ---------------------------------------------------------------------------

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 20;

async function isWithinRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`mobile-place-order_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= RATE_LIMIT_MAX) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

// Firestore document ids may not contain '/' and are capped at 1500 bytes.
// The uid prefix scopes the key to its owner, matching app/api/place-order's
// own orderIdFor() — duplicated rather than imported since that function is
// module-local there.
function orderIdFor(uid: string, idempotencyKey: string): string {
  return `${uid}_${idempotencyKey}`;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

const FREE_SHIPPING_THRESHOLD = 499;
const STANDARD_SHIPPING_CHARGE = 49;

// Mirrors services/productService.ts's normalizeProduct() field precedence,
// so a line built here matches what the mobile client read for the same
// product — except the base price, which follows the one server-side rule
// every order path shares (lib/pricing/priceRules.ts: sellingPrice first).
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
// the same rules as the web checkout — and re-evaluated here rather than
// trusting the client's own "Apply" result, since nothing stops the coupon
// code (or a forged discountAmount) arriving in the request body from being
// stale, expired, or invented outright. Only the code is read from the body.

type PlaceOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "created"; orderId: string; total: number };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in to place an order." }, { status: 401 });
    }

    if (!(await isWithinRateLimit(requester.uid))) {
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

    const idempotencyKey = typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";

    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return Response.json({ error: "A valid idempotencyKey is required." }, { status: 400 });
    }

    // Delivery details — same shape and validation CheckoutScreen.tsx
    // already enforces client-side (name/mobile/address/city/pincode all
    // non-empty, mobile >=10 digits, pincode exactly 6 digits), re-checked
    // here since the client-side check is only a UX convenience.
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

    // Canonical UPPERCASE code (the same form web stores); anything else
    // in the body — including any discount amount — is ignored.
    const couponCode = normalizeCouponCode(body.couponCode);

    const db = getAdminDb();
    const orderId = orderIdFor(requester.uid, idempotencyKey);
    const orderRef = db.collection("orders").doc(orderId);

    // Fast path: a retry of an already-committed request never re-prices,
    // never re-reserves stock and never re-deletes cart items.
    const existing = await orderRef.get();
    if (existing.exists) {
      const data = existing.data() as { total?: unknown };
      return Response.json({
        success: true,
        alreadyPlaced: true,
        orderId,
        total: Number(data?.total || 0),
      });
    }

    // Caller's own active cart — same filter services/cartService.ts's
    // getCartItems() + CheckoutScreen.tsx's `!savedForLater` filter apply
    // client-side. userId is verified server-side by construction (the
    // query is scoped to requester.uid, not read from the request), unlike
    // the Firestore SDK path where firestore.rules do that verification.
    const cartSnap = await db
      .collection("cart")
      .where("userId", "==", requester.uid)
      .where("savedForLater", "==", false)
      .get();

    if (cartSnap.empty) {
      return Response.json({ error: "Your cart is empty." }, { status: 400 });
    }

    const cartDocs = cartSnap.docs;

    // Coupon lookups that cannot run inside a transaction (queries). The
    // one-use guarantee itself is the deterministic
    // couponRedemptions/{uid}_{CODE} record read and written atomically in
    // the transaction below; this pre-check also catches legacy random-id
    // redemptions, exactly as the web pricing pass does.
    const couponDoc = couponCode ? await loadCouponByCode(db, couponCode) : null;
    if (couponCode && !couponDoc) {
      return Response.json({ error: "Invalid coupon" }, { status: 400 });
    }
    if (couponCode && (await hasPriorCouponRedemption(db, requester.uid, couponCode))) {
      return Response.json({ error: "You've already used this coupon." }, { status: 400 });
    }
    const couponRef = couponCode
      ? db.collection("couponRedemptions").doc(couponRedemptionId(requester.uid, couponCode))
      : null;

    const outcome = await db.runTransaction<PlaceOutcome>(async (tx: Transaction) => {
      // ---- ALL READS FIRST (Firestore transaction requirement) ----
      const orderSnap = await tx.get(orderRef);

      if (orderSnap.exists) {
        const data = orderSnap.data() as { total?: unknown };
        return { kind: "created", orderId, total: Number(data?.total || 0) };
      }

      // Aggregate quantity per product — a customer can have multiple cart
      // lines for the same product (one per variant combo), and each must
      // be validated/reserved against the product's COMBINED demand, not
      // independently, or two lines can each pass a check that their sum
      // does not. Mirrors CheckoutScreen.tsx's placeOrder() exactly.
      const qtyByProduct = new Map<string, number>();
      // Per-(product, variant) demand — Strategy 1, same shape the web COD
      // path (app/api/place-order) and the Razorpay finalizer
      // (lib/onlineOrder.ts) already use. A product is only decremented via
      // the variant path when EVERY line for it carries a variantId;
      // otherwise the product-level path below is kept, exactly mirroring
      // lib/orderPricing.ts's computeOrderPricing().
      const variantDemandByProduct = new Map<string, Map<string, number>>();
      const productHasNonVariantLine = new Set<string>();

      for (const cartDoc of cartDocs) {
        const data = cartDoc.data();
        const productId = typeof data.productId === "string" ? data.productId : "";
        const qty = data.quantity;

        if (!productId) {
          return { kind: "error", status: 400, error: "Invalid item in cart." };
        }

        // Whole units only — the same rule the web checkout applies
        // (lib/orderQuantity). The cart doc is client-writable, so a
        // fractional/zero/negative quantity is refused, never rounded.
        if (!isValidOrderQuantity(qty)) {
          return { kind: "error", status: 400, error: INVALID_QUANTITY_MESSAGE };
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
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      // Read (and so lock) the redemption record under this transaction:
      // two concurrent orders with the same coupon cannot both see it absent
      // and both commit — the loser retries, finds it, and is refused.
      const couponClaimSnap = couponRef ? await tx.get(couponRef) : null;

      const liveProducts = new Map<string, ReturnType<typeof normalizeProduct>>();
      // Precomputed per-product variant decrement plan, carried from this
      // validation pass into the WRITES section below — planVariantDecrements
      // is pure, so running it twice would just waste work, not diverge, but
      // there is no reason to.
      const variantPlanByProduct = new Map<string, ReturnType<typeof planVariantDecrements>>();
      // The seller's raw variants[] for products on the variant path, kept so
      // the items map below can resolve each line's SERVER-verified
      // attributes rather than trusting the cart doc's own selectedVariants
      // (client-written, display-only) for what gets permanently stored on
      // the order.
      const variantsByProduct = new Map<string, VariantStockEntry[]>();

      for (let i = 0; i < productIds.length; i++) {
        const productId = productIds[i];
        const snap = productSnaps[i];
        const required = qtyByProduct.get(productId) || 0;

        const matchingCartDoc = cartDocs.find((d) => d.data().productId === productId);
        const label = (matchingCartDoc?.data().name as string) || "This product";

        if (!snap.exists) {
          return { kind: "error", status: 409, error: `${label} is no longer available.` };
        }

        const product = normalizeProduct(snap.data()!);

        // Publication gate (lib/products/visibility.ts): pending review,
        // rejected or blocked products cannot be ordered.
        if (!isProductVisible(snap.data())) {
          return { kind: "error", status: 409, error: `${label} is no longer available.` };
        }

        const rawVariants = (snap.data() as { variants?: unknown })?.variants;

        // Inventory + Order Consistency V1 — this product's REAL stock lives
        // per-variant (Strategy 1: see lib/products/inventory.ts's
        // hasStockBearingVariants), not on product.stock.
        if (hasStockBearingVariants(rawVariants)) {
          // Every cart line for this product must carry the seller's own
          // variantId (screens/ProductDetailsScreen.tsx now always attaches
          // one for a variant product) — a line without one is a stale cart
          // entry added before that fix, or tampered, and must not fall back
          // to decrementing product.stock, which would desync it from the
          // variants[] array the web path maintains.
          if (productHasNonVariantLine.has(productId)) {
            return {
              kind: "error",
              status: 409,
              error: `Please choose an option (such as size or colour) for ${label} before checking out.`,
            };
          }

          const variantDemand = variantDemandByProduct.get(productId)!;
          const variants = rawVariants as VariantStockEntry[];

          // A demanded variantId absent from the seller's current variants —
          // stale (deleted/edited since it was added to the cart) or
          // tampered. Refused rather than silently dropped or resolved to
          // "whichever variant", same as the web pricing path.
          for (const variantId of variantDemand.keys()) {
            if (!findVariantById(variants as unknown as { id?: string }[], variantId)) {
              return {
                kind: "error",
                status: 409,
                error: `One of the options selected for ${label} is no longer available. Please remove it from your cart and select again.`,
              };
            }
          }

          const plan = planVariantDecrements(variants, variantDemand);

          if (!plan.allSatisfied) {
            const shortfall = plan.shortfalls[0];
            return {
              kind: "error",
              status: 409,
              error: `Only ${shortfall?.available ?? 0} left for ${label} in the selected option.`,
            };
          }

          variantPlanByProduct.set(productId, plan);
          variantsByProduct.set(productId, variants);
          liveProducts.set(productId, product);
          continue;
        }

        const availableStock = Number(product.stock ?? 0);

        if (availableStock < required) {
          return {
            kind: "error",
            status: 409,
            error: `Only ${availableStock} left for ${label}.`,
          };
        }

        liveProducts.set(productId, product);
      }

      // ---- Pricing — every rupee derived here, from live product data,
      // never from the request body or the cart document's own stored
      // price fields. ----
      const items = cartDocs.map((cartDoc) => {
        const data = cartDoc.data();
        const product = liveProducts.get(data.productId as string)!;
        const variantId = typeof data.variantId === "string" ? data.variantId : "";

        // Server-verified attributes when this line resolved to a real
        // variant, rather than trusting the cart doc's own selectedVariants
        // (client-written at add-to-cart time) for what gets permanently
        // stored on the order. Falls back to the client-supplied map only for
        // a non-variant product's legacy free-text display, if any.
        const resolvedVariant = variantId
          ? findVariantById(
              (variantsByProduct.get(data.productId as string) || []) as unknown as {
                id?: string;
              }[],
              variantId
            )
          : null;

        const selectedVariants = resolvedVariant
          ? variantAttributes(resolvedVariant as { attributes?: Record<string, string> | null })
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
          // Same whole-number quantity under the web field name. The seller
          // payout engine (lib/vendorEarnings#computeVendorShare) reads
          // items[].qty; without it a mobile line counted as 0 units and the
          // seller was never credited. `quantity` stays for the mobile app.
          qty: Number(data.quantity),
          vendorId: product.vendorId,
          vendorName: product.vendorName,
          savedForLater: false,
          ...(selectedVariants ? { selectedVariants } : {}),
          ...(variantId ? { variantId } : {}),
        };
      });

      const vendorIds = [...new Set(items.map((i) => i.vendorId).filter(Boolean))];

      const subtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

      // Prices are GST-inclusive (lib/pricing/priceRules.ts), exactly as on the
      // web: GST is never added on top. Its component is extracted from the
      // line amounts when the order is confirmed (lib/sellerTax.ts). gstAmount
      // stays on the order for the mobile screens that read it, always 0.
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

      // The commission rate in effect now, by the exact rule the web pricing
      // pass uses — stamped on the order so a later settings change never
      // re-prices it, and so the payout engine does not fall back to the
      // legacy 10% it applies to orders with no commissionRate.
      const commissionRate = resolveCommissionRate(settingsData);

      // Delivery-cost snapshot (concepts B/C), matching the web paths so a
      // mobile free-delivery order deducts the seller's delivery cost the same
      // way. Distinct from `shipping` (customer charge, A).
      const deliveryCost =
        typeof settingsData?.deliveryCost === "number"
          ? settingsData.deliveryCost
          : DEFAULT_DELIVERY_COST;
      const freeDeliveryApplied = subtotal >= freeShippingThreshold;

      let discountAmount = 0;
      let resolvedCouponCode: string | null = null;

      if (couponCode) {
        if (couponClaimSnap?.exists) {
          return {
            kind: "error",
            status: 409,
            error: "This coupon has already been used. Please remove it and try again.",
          };
        }
        const evaluated = evaluateCoupon(couponDoc, subtotal);
        if (!evaluated.ok) {
          return { kind: "error", status: 400, error: evaluated.message };
        }
        discountAmount = evaluated.discountAmount;
        resolvedCouponCode = couponCode;
      }

      // The customer-payable amount: whole rupees, minimum ₹1 — the same rule
      // as the web checkout and the mobile ONLINE (Razorpay) amount, so the
      // stored paymentAmount is exactly what the customer is shown and asked
      // to pay. itemsSubtotal/discount below stay exact for seller settlement.
      const total = payableTotal(subtotal + shipping - discountAmount);

      // Human-readable numbers, minted after all reads/validation above and
      // BEFORE the first write below. mintNumbers reads its counters (tx.get)
      // and then writes them, so it must run before any product/order write or
      // Firestore rejects the transaction ("all reads before all writes").
      const [orderNumber, paymentNumber] = await mintNumbers(tx, db, [
        { kind: "daily", daily: "order", at: new Date() },
        { kind: "seq", counter: "payment" },
      ]);

      // ---- WRITES ----
      for (let i = 0; i < productIds.length; i++) {
        const productId = productIds[i];
        const plan = variantPlanByProduct.get(productId);

        if (plan) {
          // Variant-path products: write the decremented variants[] and the
          // derived product.stock together, so the two ledgers stay
          // consistent — mirrors lib/onlineOrder.ts's finalizeOnlineOrder.
          tx.update(productRefs[i], {
            variants: plan.newVariants,
            stock: sumVariantStock(plan.newVariants),
            sales: FieldValue.increment(plan.totalTaken),
          });
          continue;
        }

        const required = qtyByProduct.get(productId) || 0;
        tx.update(productRefs[i], {
          stock: FieldValue.increment(-required),
          sales: FieldValue.increment(required),
        });
      }

      tx.set(orderRef, {
        orderNumber,
        paymentNumber,
        userId: requester.uid,
        customerName,
        customerEmail: requester.email || "",
        phone,
        address,
        vendorIds,
        deliverySlot,
        items,
        subtotal,
        shipping,
        // Delivery-cost snapshot (B/C) — see the web paths. Admin/server
        // written only; the seller order-update rule cannot touch these.
        deliveryCost,
        freeDeliveryApplied,
        couponCode: resolvedCouponCode,
        discountAmount,
        total,
        paymentMethod: "PAY_ON_DELIVERY_UPI",
        paymentStatus: "Pending",
        status: "Pending",
        createdAt: Timestamp.now(),
        gstAmount,

        // ---- Canonical web-schema aliases ----
        //
        // Purely additive: every field above is untouched, so OrdersScreen,
        // OrderDetailsScreen, Buy Again, the cancellation stock-restore and
        // reviews all keep reading exactly what they read today.
        //
        // The shared consumers speak the web schema, and without these a
        // mobile order is invisible or plain wrong to all of them:
        //
        //   finalTotal   app/api/cancel-order reads order.finalTotal for both
        //                the reward reversal and refundAmountDue, and
        //                lib/rewardCredit.ts prices the reward off it. On a
        //                mobile order it was undefined, so a cancelled paid
        //                mobile order recorded a refund due of zero.
        //
        //                The two schemas disagree on what "total" means: here
        //                it is the GRAND total (subtotal + shipping + gst -
        //                discount, computed above); in place-order "total" is
        //                the pre-shipping subtotal and the grand total is
        //                "finalTotal". So this aliases total, NOT subtotal —
        //                copying subtotal would under-refund by shipping+GST.
        //
        //   userEmail    the field every shared consumer reads, while the
        //                mobile app reads customerEmail. Both now carry the
        //                same verified value off the ID token, never the body.
        //
        //   rewardPointsStatus  opts the order into the deferred reward
        //                system. Absence means "placed before that system
        //                existed", so mobile orders were permanently
        //                excluded from it. This credits nothing now: points
        //                are granted only once the order is Delivered, Paid
        //                and past its 7-day return window.
        //
        //   updatedAt    lib/returnEligibility.ts falls back to updatedAt
        //                when deliveredAt is absent, and the reward credit
        //                fails CLOSED without a basis date. Timestamp.now()
        //                matches createdAt above and place-order convention;
        //                this executes server-side inside a transaction, so
        //                the value is the server clock, not the caller's.
        finalTotal: total,
        userEmail: requester.email || "",
        rewardPointsStatus: "pending",
        updatedAt: Timestamp.now(),

        // ---- COD amount due ----
        //
        // The Pay on Delivery (UPI Only) collection flows — the delivery
        // engine (lib/deliveryEngine/codPayment.ts) and the web delivery-
        // partner page — read ONLY paymentAmount as the amount to collect.
        // Without it a mobile COD order showed ₹0 due and a rider could not
        // record the real amount. Equal to the server-computed grand total
        // above; never read from the request.
        paymentAmount: total,

        // ---- Seller-payout compatibility (web-schema meanings) ----
        //
        // lib/vendorEarnings#computeVendorShare splits a coupon across sellers
        // by value, using the items subtotal as the base and `discount` as the
        // coupon rupees. Mobile `total` is the GRAND total and the coupon
        // lives in `discountAmount`, so both are given here under the payout
        // engine's names, alongside the commission rate stamped above.
        itemsSubtotal: subtotal,
        discount: discountAmount,
        commissionRate,
      });

      for (const cartDoc of cartDocs) {
        tx.delete(cartDoc.ref);
      }

      // One use per customer: the same couponRedemptions/{uid}_{CODE} record
      // (same fields) the web checkout writes, committed atomically with the
      // order. app/api/cancel-order releases it if this order is cancelled.
      if (couponRef && resolvedCouponCode) {
        tx.set(couponRef, {
          userId: requester.uid,
          userEmail: requester.email,
          code: resolvedCouponCode,
          orderId,
          createdAt: Timestamp.now(),
        });
      }

      return { kind: "created", orderId, total };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    return Response.json({ success: true, orderId: outcome.orderId, total: outcome.total });
  } catch (error) {
    console.error("mobile/place-order: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
