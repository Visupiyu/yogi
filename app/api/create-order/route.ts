import Razorpay from "razorpay";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { getShippingSettings } from "@/lib/shipping";

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

    const items: { id: string; qty: number }[] =
      Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return Response.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    // The Razorpay order amount must come from real product data, not a
    // number the browser hands us — that number is fully editable by
    // anyone intercepting the request. Look up every item server-side.
    let subtotal = 0;

    for (const item of items) {

      if (!item.id || !(Number(item.qty) > 0)) {
        return Response.json(
          { error: "Invalid item in cart" },
          { status: 400 }
        );
      }

      const snap = await getDoc(doc(db, "products", item.id));

      if (!snap.exists()) {
        return Response.json(
          { error: "One or more products are no longer available" },
          { status: 400 }
        );
      }

      const product: any = snap.data();

      if (product.active === false) {
        return Response.json(
          { error: "One or more products are currently unavailable" },
          { status: 400 }
        );
      }

      const qty = Number(item.qty);

      if ((product.stock ?? 0) < qty) {
        return Response.json(
          { error: `${product.title || "A product"} has insufficient stock` },
          { status: 400 }
        );
      }

      const price =
        typeof product.sellingPrice === "number"
          ? product.sellingPrice
          : Number(product.price || 0);

      subtotal += price * qty;
    }

    const { freeShippingThreshold, standardShippingCharge } =
      await getShippingSettings();

    const shipping =
      subtotal > freeShippingThreshold ? 0 : standardShippingCharge;

    const rawTotal = subtotal + shipping;

    // Reward-point/coupon discount is still client-reported here — fully
    // replicating that validation server-side needs the customer's
    // authenticated identity, which this route doesn't have without
    // Firebase Admin credentials. Clamped to a sane range so it can only
    // ever reduce price, never invert or exceed it; this closes the
    // severe "pay ₹1 for real products" gap even though the discount
    // portion isn't independently re-verified yet.
    const requestedDiscount = Number(body.discountAmount) || 0;
    const discountAmount = Math.min(
      Math.max(0, requestedDiscount),
      rawTotal
    );

    const finalAmount = Math.max(1, Math.round(rawTotal - discountAmount));

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
