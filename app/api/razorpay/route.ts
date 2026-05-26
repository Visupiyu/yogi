import Razorpay from "razorpay";

export async function POST(req:Request){

  try{

    const body =
      await req.json();

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
        body.amount * 100,

      currency:"INR",

      receipt:
        "receipt_" +
        Math.random()

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