import Razorpay from "razorpay";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

const ORDER_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ORDER_RATE_LIMIT_MAX = 15;

// Admin-SDK-only counter — never touched by any client, so the default-deny
// Firestore rule already covers it and no rules change is needed. Bounds
// how often one signed-in user can hit this route, the one server-side
// chokepoint order creation actually passes through.
async function isWithinOrderRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`create-order_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > ORDER_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= ORDER_RATE_LIMIT_MAX) {
      return false;
    }

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

type PricedItem = { id: string; qty: number };

// The one trusted price/stock/shipping computation, shared by both the
// Razorpay (ONLINE) path and the Pay on Delivery (UPI Only) path below —
// neither may trust a number the browser hands over. Reused, not
// duplicated, per both call sites.
async function computeVerifiedOrderAmount(
  items: PricedItem[],
  requestedDiscount: number
): Promise<
  | { ok: true; subtotal: number; shipping: number; discountAmount: number; finalAmount: number }
  | { ok: false; error: string; status: number }
> {
  let subtotal = 0;

  for (const item of items) {
    if (!item.id || !(Number(item.qty) > 0)) {
      return { ok: false, error: "Invalid item in cart", status: 400 };
    }

    const snap = await getAdminDb().collection("products").doc(item.id).get();

    if (!snap.exists) {
      return {
        ok: false,
        error: "One or more products are no longer available",
        status: 400,
      };
    }

    const product: any = snap.data();

    if (product.active === false) {
      return {
        ok: false,
        error: "One or more products are currently unavailable",
        status: 400,
      };
    }

    const qty = Number(item.qty);

    if ((product.stock ?? 0) < qty) {
      return {
        ok: false,
        error: `${product.title || "A product"} has insufficient stock`,
        status: 400,
      };
    }

    const price =
      typeof product.sellingPrice === "number"
        ? product.sellingPrice
        : Number(product.price || 0);

    subtotal += price * qty;
  }

  const settingsSnap = await getAdminDb()
    .collection("settings")
    .doc("global")
    .get();

  const settingsData = settingsSnap.exists ? settingsSnap.data() : null;

  const freeShippingThreshold =
    typeof settingsData?.freeShippingThreshold === "number"
      ? settingsData.freeShippingThreshold
      : 999;

  const standardShippingCharge =
    typeof settingsData?.standardShippingCharge === "number"
      ? settingsData.standardShippingCharge
      : 99;

  const shipping =
    subtotal > freeShippingThreshold ? 0 : standardShippingCharge;

  const rawTotal = subtotal + shipping;

  // Reward-point/coupon discount is still client-reported here — fully
  // replicating that validation server-side needs independent knowledge of
  // the customer's real reward-point balance, a separate, pre-existing gap
  // (not introduced or fixed here). Clamped to a sane range so it can only
  // ever reduce price, never invert or exceed it.
  const discountAmount = Math.min(Math.max(0, requestedDiscount), rawTotal);

  const finalAmount = Math.max(1, Math.round(rawTotal - discountAmount));

  return { ok: true, subtotal, shipping, discountAmount, finalAmount };
}

export async function POST(
  req:Request
){

  try{

    const requester = await verifyRequestUser(req);

    if (!requester) {
      return Response.json(
        { error: "Please sign in to place an order." },
        { status: 401 }
      );
    }

    if (!(await isWithinOrderRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many order attempts. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const body =
      await req.json();

    const items: PricedItem[] =
      Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return Response.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    const priced = await computeVerifiedOrderAmount(
      items,
      Number(body.discountAmount) || 0
    );

    if (!priced.ok) {
      return Response.json({ error: priced.error }, { status: priced.status });
    }

    const { finalAmount } = priced;

    // Pay on Delivery (UPI Only): no prepaid capture, no Razorpay order —
    // just the server-verified exact amount the customer must pay at
    // delivery. The browser never gets to declare this number itself.
    if (body.paymentMethod === "PAY_ON_DELIVERY_UPI") {
      return Response.json({ paymentAmount: finalAmount });
    }

    const razorpay =
      new Razorpay({

        key_id:
          process.env
            .RAZORPAY_KEY_ID!,

        key_secret:
          process.env
            .RAZORPAY_KEY_SECRET!

      });

    const options = {

      amount:
        finalAmount * 100,

      currency:"INR",

      receipt:
        "receipt_" +
        Math.random(),

      // Retrievable during verification so payment amount — and now the
      // customer who initiated it — can be cross-checked against what
      // was actually ordered.
      notes: {
        expectedAmount: String(finalAmount * 100),
        verifiedUid: requester.uid,
      },

    };

    const order =
      await razorpay.orders.create(
        options
      );

    return Response.json(order);

  }catch(err:any){

    return Response.json({

      error:err.message

    });

  }

}
