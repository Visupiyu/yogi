import Razorpay from "razorpay";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
// The one trusted pricing computation, shared with every other server path
// that needs to know what an order really costs. Not duplicated here.
import {
  computeOrderPricing,
  type PricedItemInput,
} from "@/lib/orderPricing";
import { Timestamp } from "firebase-admin/firestore";

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


// Same "+5 days, en-IN" string the checkout page and /api/place-order
// produce, so order pages, invoices and emails render what they always have.
function deliveryDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
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

    // ---- ONLINE only, from here down ----
    //
    // Delivery details are user input, not financial data, so they are read
    // from the request — but they are stored SERVER-SIDE now rather than
    // being carried back through the browser at finalisation time. Everything
    // monetary comes from `priced.pricing`, which the browser never touched.
    const customerName =
      typeof body.customerName === "string" ? body.customerName.trim() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const address = typeof body.address === "string" ? body.address.trim() : "";

    if (!customerName || !address) {
      return Response.json({ error: "Fill all checkout fields" }, { status: 400 });
    }

    if (!/^\d{10}$/.test(phone)) {
      return Response.json(
        { error: "Enter valid 10 digit phone number" },
        { status: 400 }
      );
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

    // The authoritative order intent, keyed by the Razorpay order id.
    //
    // This is what makes a server-authoritative ONLINE order possible at all:
    // at finalisation the browser sends only payment identifiers, and both
    // the callback route and the webhook read the priced order from here. The
    // webhook in particular has no session and no cart — without this record
    // it could verify a payment but would have nothing to build an order
    // from, so a customer whose browser died after capture could not be
    // reconciled.
    //
    // The pricing snapshot is stored rather than re-derived at finalisation
    // on purpose: it is exactly what the Razorpay charge amount was computed
    // from, so a product price edited in between cannot produce an order
    // whose total disagrees with what the card was debited.
    //
    // Written with the Admin SDK into a collection no client rule matches, so
    // firestore.rules' default-deny already covers it.
    try {
      await getAdminDb()
        .collection("paymentIntents")
        .doc(order.id)
        .set({
          uid: requester.uid,
          email: requester.email,
          pricing: priced.pricing,
          customerName,
          phone,
          address,
          couponCode,
          redeemPoints: body.redeemPoints === true,
          deliveryDate: deliveryDateString(),
          expectedAmountPaise: finalAmount * 100,
          razorpayOrderId: order.id,
          status: "created",
          createdAt: Timestamp.now(),
        });
    } catch (error) {
      // Without the intent, finalisation has nothing to build an order from,
      // so this must fail BEFORE the customer is shown the payment modal
      // rather than after their money is taken.
      console.error("create-order: failed to persist payment intent:", error);
      return Response.json(
        { error: "Couldn't start payment. Please try again." },
        { status: 500 }
      );
    }

    return Response.json(order);

  }catch(err:any){

    return Response.json({

      error:err.message

    });

  }

}
