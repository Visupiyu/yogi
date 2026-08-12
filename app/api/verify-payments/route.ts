import crypto from "crypto";
import Razorpay from "razorpay";

export async function POST(
  req:Request
){

  try{

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
