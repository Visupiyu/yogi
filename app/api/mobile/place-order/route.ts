import { getAdminDb } from "@/lib/firebaseAdmin";
import { verifyRequestUser } from "@/lib/serverAuth";
import { mintNumbers } from "@/lib/humanIds";
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
//   - `gstAmount` exists only here — place-order's pricing has no GST concept
//     at all
//   - coupons here are {discountType, discountValue, maxDiscount,
//     minOrderValue} (services/couponService.ts's schema); place-order reads
//     a flat 0-100 percentage off `coupon.discount` and has no maxDiscount/
//     minOrderValue concept
//   - variants here are an arbitrary {label: value} map
//     (selectedVariants, matching product.variants' {label, options[]}
//     shape); place-order only knows two fixed optional fields, size/color
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

// Mirrors services/productService.ts's normalizeProduct() field precedence
// exactly, so a line built here is indistinguishable from what the mobile
// client itself would have read for the same product.
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

// Mirrors services/couponService.ts's validateCoupon() exactly — same
// schema, same discount computation, same error conditions. Re-run
// server-side rather than trusting the client's own "Apply" result, since
// nothing stops the coupon code (or a forged discountAmount) arriving in
// the request body from being stale, expired, or invented outright.
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

    const rawCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    const couponCode = rawCode.length > 0 && rawCode.length <= 50 ? rawCode : null;

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
      for (const cartDoc of cartDocs) {
        const data = cartDoc.data();
        const productId = typeof data.productId === "string" ? data.productId : "";
        const qty = Number(data.quantity);

        if (!productId || !(qty > 0)) {
          return { kind: "error", status: 400, error: "Invalid item in cart." };
        }

        qtyByProduct.set(productId, (qtyByProduct.get(productId) || 0) + qty);
      }

      const productIds = [...qtyByProduct.keys()];
      const productRefs = productIds.map((id) => db.collection("products").doc(id));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      const liveProducts = new Map<string, ReturnType<typeof normalizeProduct>>();

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

        if (product.active === false) {
          return { kind: "error", status: 409, error: `${label} is no longer available.` };
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

      let discountAmount = 0;
      let resolvedCouponCode: string | null = null;

      if (couponCode) {
        try {
          const priced = await priceCoupon(couponCode, subtotal);
          discountAmount = priced.discountAmount;
          resolvedCouponCode = priced.code;
        } catch (couponError: any) {
          return {
            kind: "error",
            status: 400,
            error: couponError?.message || "Unable to apply coupon.",
          };
        }
      }

      const total = subtotal + shipping + gstAmount - discountAmount;

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
        const required = qtyByProduct.get(productIds[i]) || 0;
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
      });

      for (const cartDoc of cartDocs) {
        tx.delete(cartDoc.ref);
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
