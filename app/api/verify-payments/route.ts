import crypto from "crypto";

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

    return Response.json({

      success:true,

      message:
        "Payment Verified"

    });

  }catch(err:any){

    return Response.json({

      success:false,

      error:err.message

    });

  }

}