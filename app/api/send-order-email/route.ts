import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

const resend = apiKey
  ? new Resend(apiKey)
  : null;

export async function POST(
  request: Request
) {
  try {

    if (!resend) {
      return Response.json(
        {
          success: false,
          error: "RESEND_API_KEY is missing",
        },
        {
          status: 500,
        }
      );
    }

    const {
      customerName,
      customerEmail,
      orderId,
      total,
    } = await request.json();

    const result =
      await resend.emails.send({

        from:
          "YOMICO <onboarding@resend.dev>",

        to:
          "adminyogimart@gmail.com",

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
            Customer Email:
            ${customerEmail}
          </p>

          <p>
            Total:
            ₹${total}
          </p>

          <p>
            Your order has been placed successfully.
          </p>
        `,
      });

    console.log(
      "Resend Result:",
      result
    );

    return Response.json({
      success: true,
    });

  } catch (error) {

    console.error(
      "Email Error:",
      error
    );

    return Response.json(
      {
        success: false,
        error: String(error),
      },
      {
        status: 500,
      }
    );
  }
}