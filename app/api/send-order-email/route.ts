import { Resend } from "resend";

const resend = new Resend(
  process.env.RESEND_API_KEY
);

export async function POST(
  request: Request
) {

  try {

    const {
      customerName,
      customerEmail,
      orderId,
      total,
    } = await request.json();

   const result =
  await resend.emails.send({

      from:
        "Yogi Mart <onboarding@resend.dev>",

   to: "adminyogimart@gmail.com",

      subject:
        "Order Confirmation",

      html: `
        <h2>
          Thank you for your order,
          ${customerName}
        </h2>

        <p>
          Order ID:
          ${orderId}
        </p>

        <p>
          Total:
          ₹${total}
        </p>

        <p>
          Your order has been placed
          successfully.
        </p>
      `,
    });

    console.log(
  "Resend Result:",
  result
);



    return Response.json({
      success:true,
    });

  } catch(error){

  console.error(
    "Email Error:",
    error
  );

  return Response.json({
    success:false,
    error:String(error),
  });

}

}