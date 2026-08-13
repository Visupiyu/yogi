import { Resend } from "resend";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

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

    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json(
        { success: false, error: "Please sign in to send this email." },
        { status: 401 }
      );
    }

    const {
      customerName,
      orderId,
      total,
    } = await request.json();

    if (!orderId) {
      return Response.json(
        { success: false, error: "orderId is required" },
        { status: 400 }
      );
    }

    // Confirm this order actually belongs to the caller, and send to the
    // order's own stored email rather than whatever the client claims —
    // otherwise anyone could POST an arbitrary orderId/customerEmail pair
    // and use this route to spam any inbox with a plausible-looking
    // "order confirmation".
    const orderSnap = await getAdminDb().collection("orders").doc(orderId).get();

    if (!orderSnap.exists) {
      return Response.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const orderData = orderSnap.data();

    if (orderData?.userId !== requester.uid) {
      return Response.json(
        { success: false, error: "Order not found" },
        { status: 404 }
      );
    }

    const customerEmail = orderData?.userEmail || requester.email;

    if (!customerEmail) {
      return Response.json(
        { success: false, error: "No email on file for this order" },
        { status: 400 }
      );
    }

    const result =
      await resend.emails.send({

        from:
          "YOMICO <onboarding@resend.dev>",

        to:
          customerEmail,

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