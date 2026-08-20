import Razorpay from "razorpay";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
// The one trusted pricing computation, shared with every other server path
// that needs to know what an order really costs. Not duplicated here.
import {
  computeOrderPricing,
  type PricedItemInput,
} from "@/lib/orderPricing";

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

    const items: PricedItemInput[] =
      Array.isArray(body.items) ? body.items : [];

    if (items.length === 0) {
      return Response.json(
        { error: "No items provided" },
        { status: 400 }
      );
    }

    // body.discountAmount is deliberately NOT read. Any client that still
    // sends it is ignored — the only discount inputs accepted are which
    // coupon to look up and whether to spend points, both resolved against
    // Firestore below.
    const rawCode = typeof body.couponCode === "string" ? body.couponCode.trim() : "";
    const couponCode =
      rawCode && rawCode.length <= 50 ? rawCode.toUpperCase() : null;

    const priced = await computeOrderPricing(
      items,
      requester.uid,
      couponCode,
      body.redeemPoints === true
    );

    if (!priced.ok) {
      return Response.json({ error: priced.error }, { status: priced.status });
    }

    // This route only needs the amount to charge; the rest of the breakdown
    // (priced items, vendorIds, commission, earned points) is what the
    // server-authoritative order writer will consume in a later step.
    const finalAmount = priced.pricing.finalTotal;

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
