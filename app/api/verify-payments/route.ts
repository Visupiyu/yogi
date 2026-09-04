import crypto from "crypto";
import Razorpay from "razorpay";
import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";

// A valid signature is required before Razorpay is contacted, so forged calls
// already cost nothing externally. This bounds the remaining case: an
// authenticated caller replaying a genuine signature to burn Razorpay API
// quota.
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(
  req:Request
){

  try{

    const requester = await verifyRequestUser(req);

    if (!requester) {
      return Response.json(
        { success: false, message: "Please sign in to verify a payment." },
        { status: 401 }
      );
    }

    // Keyed on the server-verified uid, before the signature check and the
    // external Razorpay fetches below.
    if (
      !(await isWithinRateLimit(
        "verify-payments",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        {
          success: false,
          message: "Too many requests. Please wait a few minutes and try again.",
        },
        { status: 429 }
      );
    }

    const body =
      await req.json();

    const {

      razorpay_order_id,

      razorpay_payment_id,

      razorpay_signature

    } = body;

    const sign =

      razorpay_order_id +

      "|" +

      razorpay_payment_id;

    const expectedSign =

      crypto

        .createHmac(

          "sha256",

          process.env
            .RAZORPAY_KEY_SECRET!

        )

        .update(sign.toString())

        .digest("hex");

    const isAuthentic =

      expectedSign ===
      razorpay_signature;

    if(!isAuthentic){

      return Response.json({

        success:false,

        message:
          "Invalid Signature"

      });

    }

    // The signature only proves order_id/payment_id weren't tampered
    // with in transit — it says nothing about whether the payment was
    // actually captured, or for how much. Ask Razorpay directly.
    const razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID!,
      key_secret: process.env.RAZORPAY_KEY_SECRET!,
    });

    const [payment, order] = await Promise.all([
      razorpay.payments.fetch(razorpay_payment_id),
      razorpay.orders.fetch(razorpay_order_id),
    ]);

    if (payment.order_id !== razorpay_order_id) {
      return Response.json({
        success: false,
        message: "Payment does not belong to this order",
      });
    }

    if (payment.status !== "captured") {
      return Response.json({
        success: false,
        message: "Payment was not captured",
      });
    }

    // create-order stamped the Razorpay order with the uid that started
    // checkout — refuse to confirm someone else's payment for this order.
    const verifiedUid = order.notes?.verifiedUid;

    if (verifiedUid && verifiedUid !== requester.uid) {
      return Response.json({
        success: false,
        message: "This payment does not belong to your account",
      });
    }

    const expectedAmount = order.notes?.expectedAmount;

    if (
      expectedAmount &&
      String(payment.amount) !== String(expectedAmount)
    ) {
      return Response.json({
        success: false,
        message: "Payment amount does not match the order",
      });
    }

    return Response.json({

      success:true,

      message:
        "Payment Verified",

      amount: Number(payment.amount) / 100,

    });

  }catch(err:any){

    return Response.json({

      success:false,

      error:err.message

    });

  }

}
