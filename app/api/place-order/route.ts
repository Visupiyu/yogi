import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { emitOrderPlacedNotifications } from "@/lib/orderNotifications";
import { computeOrderPricing, type PricedItemInput } from "@/lib/orderPricing";
import { PAY_ON_DELIVERY_UPI } from "@/lib/upiPayment";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// Server-authoritative order creation — Pay on Delivery (UPI Only) only.
//
// Replaces the client-side COD path in app/checkout/page.tsx, where the order
// document was assembled in the browser by buildOrderData() and written by
// reserveStock(). Every financial field on that document — items[].price,
// total, discount, rewardValue, shippingCharge, commission, sellerEarning,
// vendorIds, and the earned-points credit — came from browser state. Only
// finalTotal was server-verified.
//
// The request now carries order INTENT only: which products, how many, which
// coupon code, whether to spend points, and where to deliver. Every rupee is
// derived here from Firestore by lib/orderPricing.ts.
//
// Razorpay is deliberately NOT migrated yet: payNow() still builds and writes
// its own order. Firestore rules still permit client order creation, so both
// paths work side by side. Tightening them comes after ONLINE moves too.
// ---------------------------------------------------------------------------

// Same rateLimits collection / window-count shape as create-order and
// cancel-order. That helper is module-local and unexported in each, so it is
// duplicated by convention under its own key namespace. The ceiling is a
// little higher than create-order's 15 because a failed COD submit is
// expected to be retried, and an idempotent retry must not be punished.
const PLACE_ORDER_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const PLACE_ORDER_RATE_LIMIT_MAX = 20;

async function isWithinPlaceOrderRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`place-order_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > PLACE_ORDER_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= PLACE_ORDER_RATE_LIMIT_MAX) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

// Firestore document ids may not contain '/' and are capped at 1500 bytes.
// The uid prefix scopes the key to its owner, so one customer's key can never
// collide with — or overwrite — another's order.
function orderIdFor(uid: string, idempotencyKey: string): string {
  return `${uid}_${idempotencyKey}`;
}

const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

// Matches the client's `new Date(+5d).toLocaleDateString("en-IN", …)` output
// so existing order pages, invoices and emails render the same string they
// always have.
function deliveryDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

type PlaceOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "existing"; orderId: string; paymentAmount: number }
  | { kind: "created"; orderId: string; paymentAmount: number };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in to place an order." }, { status: 401 });
    }

    if (!(await isWithinPlaceOrderRateLimit(requester.uid))) {
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

    // ---- Order intent only. No price, subtotal, discount, rewardValue,
    // shipping, total, commission, sellerEarning, vendorId, stock, sales or
    // earned-points field is read from the request, here or anywhere below.
    const paymentMethod = body.paymentMethod;

    if (paymentMethod !== PAY_ON_DELIVERY_UPI) {
      return Response.json(
        { error: "This endpoint currently handles Pay on Delivery orders only." },
        { status: 400 }
      );
    }

    const idempotencyKey =
      typeof body.idempotencyKey === "string" ? body.idempotencyKey : "";

    if (!IDEMPOTENCY_KEY_PATTERN.test(idempotencyKey)) {
      return Response.json({ error: "A valid idempotencyKey is required." }, { status: 400 });
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];

    if (rawItems.length === 0) {
      return Response.json({ error: "No items provided" }, { status: 400 });
    }

    if (rawItems.length > 100) {
      return Response.json({ error: "Too many items in cart" }, { status: 400 });
    }

    const items: PricedItemInput[] = rawItems.map((i: any) => ({
      id: typeof i?.id === "string" ? i.id : "",
      qty: Number(i?.qty),
      size: typeof i?.size === "string" ? i.size : undefined,
      color: typeof i?.color === "string" ? i.color : undefined,
      // A lookup key only — computeOrderPricing resolves it against the
      // product document and takes the attributes from there.
      variantId: typeof i?.variantId === "string" ? i.variantId : undefined,
    }));

    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (!customerName || !address) {
      return Response.json({ error: "Fill all checkout fields" }, { status: 400 });
    }

    if (!/^\d{10}$/.test(phone)) {
      return Response.json({ error: "Enter valid 10 digit phone number" }, { status: 400 });
    }

    const rawCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    const couponCode = rawCode && rawCode.length <= 50 ? rawCode.toUpperCase() : null;

    const redeemPoints = body.redeemPoints === true;

    const db = getAdminDb();
    const orderId = orderIdFor(requester.uid, idempotencyKey);
    const orderRef = db.collection("orders").doc(orderId);

    // Fast path: a retry of an already-committed request never re-prices,
    // never re-reserves stock and never re-spends points.
    const existing = await orderRef.get();
    if (existing.exists) {
      const data = existing.data() as { finalTotal?: unknown };
      return Response.json({
        success: true,
        alreadyPlaced: true,
        orderId,
        paymentAmount: Number(data?.finalTotal || 0),
      });
    }

    // A blocked customer can still hold a live session from before they were
    // blocked. Checked before pricing so nothing is computed for them.
    const userSnap = await db.collection("users").doc(requester.uid).get();
    if (userSnap.exists && userSnap.data()?.status === "Blocked") {
      return Response.json(
        { error: "Your account has been blocked. Please contact support." },
        { status: 403 }
      );
    }

    // ---- The one trusted pricing pass (products, shipping, coupon, points).
    const priced = await computeOrderPricing(
      items,
      requester.uid,
      couponCode,
      redeemPoints
    );

    if (!priced.ok) {
      return Response.json({ error: priced.error }, { status: priced.status });
    }

    const pricing = priced.pricing;

    const normalizedCode = couponCode;
    const couponRef = normalizedCode
      ? db.collection("couponRedemptions").doc(`${requester.uid}_${normalizedCode}`)
      : null;

    // ---- Stock reservation, order creation, coupon claim and the reward
    // balance change, all in ONE transaction. The old COD path already had
    // this property via reserveStock(); the points update was the exception,
    // applied afterwards in a separate client transaction where a failure
    // left an order priced with a discount the customer never paid for.
    const outcome = await db.runTransaction<PlaceOutcome>(async (tx: Transaction) => {
      // ---- ALL READS FIRST (Firestore transaction requirement) ----
      const orderSnap = await tx.get(orderRef);

      // Re-checked inside the transaction: two concurrent submits with the
      // same key must not both proceed to reserve stock.
      if (orderSnap.exists) {
        const data = orderSnap.data() as { finalTotal?: unknown };
        return {
          kind: "existing",
          orderId,
          paymentAmount: Number(data?.finalTotal || 0),
        };
      }

      // Inventory is per PRODUCT, not per order line. lib/cart.ts keys cart
      // lines on id + size + color, so one product in two sizes arrives as
      // two lines sharing an id. Checking and writing per line would test
      // each quantity separately against the same stock (2 x 6 both pass
      // against 10) and issue two updates to one document in a single
      // transaction. Aggregate first; the order document still carries the
      // individual lines untouched.
      const qtyByProduct = new Map<string, number>();
      const nameByProduct = new Map<string, string>();
      for (const line of pricing.items) {
        qtyByProduct.set(line.id, (qtyByProduct.get(line.id) || 0) + line.qty);
        if (!nameByProduct.has(line.id)) nameByProduct.set(line.id, line.name);
      }

      const productIds = [...qtyByProduct.keys()];
      const productRefs = productIds.map((id) => db.collection("products").doc(id));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      const txUserSnap = await tx.get(db.collection("users").doc(requester.uid));

      // Deterministic id, so the claim can be read inside the transaction —
      // transactions cannot run the legacy random-id query. That query
      // already ran during pricing, outside.
      const couponSnap = couponRef ? await tx.get(couponRef) : null;

      // ---- Validation against the state just read ----
      for (let i = 0; i < productIds.length; i++) {
        const id = productIds[i];
        const snap = productSnaps[i];
        const label = nameByProduct.get(id) || "A product";
        const wanted = qtyByProduct.get(id) || 0;

        if (!snap.exists) {
          return {
            kind: "error",
            status: 409,
            error: `${label} is no longer available.`,
          };
        }

        const product = snap.data() as { active?: unknown; stock?: unknown };

        if (product.active === false) {
          return {
            kind: "error",
            status: 409,
            error: `${label} is currently unavailable.`,
          };
        }

        const stock = Number(product.stock ?? 0);

        // Compared against the SUM across every line for this product.
        if (stock < wanted) {
          return {
            kind: "error",
            status: 409,
            error: `${label} has only ${stock} item(s) left in stock.`,
          };
        }
      }

      if (couponSnap?.exists) {
        return {
          kind: "error",
          status: 409,
          error: "This coupon has already been used. Please remove it and try again.",
        };
      }

      const currentPoints = Number(txUserSnap.data()?.rewardPoints || 0);
      const balance = Number.isFinite(currentPoints) && currentPoints > 0 ? currentPoints : 0;

      // finalTotal was computed assuming pricing.rewardValue is spendable. If
      // the balance moved since (another tab, a concurrent order), committing
      // anyway would hand out a discount the customer cannot pay for. No
      // money has been captured on a COD order, so refusing is free.
      if (pricing.rewardValue > balance) {
        return {
          kind: "error",
          status: 409,
          error: "Your reward point balance has changed — please review your order again.",
        };
      }

      // ---- WRITES ----
      // Exactly one update per product document, carrying the aggregated
      // quantity. stock and sales move in equal and opposite directions,
      // conserving stock + sales exactly as firestore.rules'
      // isStockTransfer() requires of the client path.
      for (let i = 0; i < productIds.length; i++) {
        const wanted = qtyByProduct.get(productIds[i]) || 0;
        tx.update(productRefs[i], {
          stock: FieldValue.increment(-wanted),
          sales: FieldValue.increment(wanted),
        });
      }

      // Field-for-field the document buildOrderData() produced, with every
      // monetary value replaced by its server-computed equivalent. Seller
      // orders, analytics, invoices, wallet, payouts and computeVendorShare()
      // all read this exact shape.
      tx.set(orderRef, {
        customerName,
        phone,
        address,
        userEmail: requester.email,
        userId: requester.uid,
        vendorIds: pricing.vendorIds,
        items: pricing.items,
        total: pricing.subtotal,
        status: "Pending",
        paymentMethod,
        paymentStatus: "Pending",
        shippingCharge: pricing.shipping,
        finalTotal: pricing.finalTotal,
        deliveryDate: deliveryDateString(),
        commission: pricing.commission,
        sellerEarning: pricing.sellerEarning,
        commissionRate: pricing.commissionRate,
        couponCode: normalizedCode || "",
        discount: pricing.couponDiscount,
        rewardValue: pricing.rewardValue,
        createdAt: Timestamp.now(),
        paymentAmount: pricing.finalTotal,

        // Opts this order into deferred reward crediting. Points are NOT
        // granted here; app/api/credit-reward-points moves them once the
        // order is delivered, paid and past its return window. The absence
        // of this field means an order predates the rule and was already
        // credited at creation — see lib/rewardCredit.ts.
        rewardPointsStatus: "pending",
      });

      if (couponRef && normalizedCode) {
        tx.set(couponRef, {
          userId: requester.uid,
          userEmail: requester.email,
          code: normalizedCode,
          orderId,
          createdAt: Timestamp.now(),
        });
      }

      // Redemption only. What the customer SPENDS still leaves the balance
      // here, atomically with the order — they are using those points right
      // now. What the order EARNS is no longer added: an order that has only
      // just been placed has not been delivered, paid for, or survived its
      // return window, so its points are not earned yet.
      const newBalance = Math.max(0, balance - pricing.rewardValue);
      if (newBalance !== balance) {
        tx.set(
          db.collection("users").doc(requester.uid),
          { rewardPoints: newBalance },
          { merge: true }
        );
      }

      return { kind: "created", orderId, paymentAmount: pricing.finalTotal };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    if (outcome.kind === "existing") {
      return Response.json({
        success: true,
        alreadyPlaced: true,
        orderId: outcome.orderId,
        paymentAmount: outcome.paymentAmount,
      });
    }

    // ---- Best-effort, outside the transaction. None of these may fail an
    // order that has already committed. The reward LEDGER lives here because
    // addDoc-style generated ids cannot be created inside a transaction; the
    // balance itself moved atomically above. The caller still owns the
    // notifications and the confirmation email.
    // No "Earned" row at creation any more — nothing has been earned yet, and
    // writing one would show the customer points they cannot spend.
    // app/api/credit-reward-points writes it when the credit actually happens.
    const ledger: { type: string; points: number }[] = [];
    if (pricing.rewardValue > 0) {
      ledger.push({ type: "Redeemed", points: pricing.rewardValue });
    }

    for (const entry of ledger) {
      try {
        await db.collection("rewardTransactions").add({
          userId: requester.uid,
          userEmail: requester.email,
          type: entry.type,
          points: entry.points,
          ...(entry.type === "Earned" ? { orderTotal: pricing.finalTotal } : {}),
          orderId,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("place-order: reward ledger write failed:", error);
      }
    }

    // Pay-on-delivery notifications, previously written by the browser in
    // app/checkout's applyPostOrderEffects. They moved here because writing
    // them client-side required firestore.rules to let ANY signed-in client
    // create role:"admin" notifications, and the admin feed is the one
    // audience not scoped by userId — so a customer could put arbitrary text
    // in front of an admin.
    //
    // Best-effort, like the reward ledger above: the order has already
    // committed and must not fail over a notification. Values come from the
    // server-priced order, never from the request body.
    try {
      await emitOrderPlacedNotifications(db, {
        customerName,
        customerUid: requester.uid,
        orderTotal: pricing.finalTotal,
      });
    } catch (error) {
      console.error("place-order: notification failed:", error);
    }

    return Response.json({
      success: true,
      orderId: outcome.orderId,
      paymentAmount: outcome.paymentAmount,
    });
  } catch (error) {
    console.error("place-order: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
