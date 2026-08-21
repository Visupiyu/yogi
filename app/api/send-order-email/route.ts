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

    // Only orderId is taken from the request. customerName and total used
    // to arrive in the body and were rendered straight into the email, so
    // the confirmation could state a name and an amount that never matched
    // the order — and after the P1 pricing work the browser's figure can
    // legitimately differ from what the server charged. Both now come from
    // the order document that is loaded below for the ownership check
    // anyway, so this costs no extra read.
    const { orderId } = await request.json();

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

    // finalTotal is what checkout and /api/place-order commit as the
    // charged amount; total is the pre-discount fallback for orders
    // written before finalTotal existed. Never the browser's number.
    const finalTotal = Number(orderData?.finalTotal);
    const legacyTotal = Number(orderData?.total);
    const total = Number.isFinite(finalTotal)
      ? finalTotal
      : Number.isFinite(legacyTotal)
      ? legacyTotal
      : 0;

    const customerName =
      typeof orderData?.customerName === "string" && orderData.customerName
        ? orderData.customerName
        : "there";

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
          "YOMICO <onboarding@yomico.in>",

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
            ₹${total.toLocaleString("en-IN")}
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