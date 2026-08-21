import crypto from "crypto";
import Razorpay from "razorpay";

// SERVER-ONLY. Never import from a "use client" component — this file reads
// RAZORPAY_KEY_SECRET.
//
// The single Razorpay payment verification. Extracted from
// app/api/verify-payments/route.ts unchanged, so the browser-callback path and
// the webhook path cannot drift into two different standards of proof. The
// checks and their order are exactly what that route already performed:
//
//   1. HMAC over "<order_id>|<payment_id>" with the key secret
//   2. the payment actually exists at Razorpay
//   3. the order actually exists at Razorpay
//   4. payment.order_id matches the order id being claimed
//   5. payment.status === "captured" (authorized-but-uncaptured is not paid)
//   6. notes.verifiedUid, stamped at create-order time, matches the caller
//   7. payment.amount matches notes.expectedAmount, also stamped at creation
//
// A browser saying "payment succeeded" is never accepted as proof: 2-5 are
// answered by Razorpay itself, and 6-7 compare against values the server
// wrote into the Razorpay order before the customer ever saw the modal.

export type RazorpayVerification =
  | {
      ok: true;
      /** Amount Razorpay actually captured, in paise. */
      amountPaise: number;
      /** uid stamped into the Razorpay order by app/api/create-order. */
      verifiedUid: string | null;
      expectedAmountPaise: number | null;
    }
  | { ok: false; message: string };

function razorpayClient(): Razorpay {
  return new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });
}

/**
 * `expectedUid` is optional so the webhook — which has no session — can reuse
 * this. When omitted, check 6 still reads notes.verifiedUid and returns it for
 * the caller to match against whatever identity it does have.
 */
export async function verifyRazorpayPayment(params: {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
  expectedUid?: string;
}): Promise<RazorpayVerification> {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = params;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return { ok: false, message: "Missing payment identifiers." };
  }

  // 1 — signature
  const expectedSign = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expectedSign !== razorpay_signature) {
    return { ok: false, message: "Invalid Signature" };
  }

  // 2, 3 — the signature only proves the two ids were not tampered with in
  // transit. It says nothing about whether money moved. Ask Razorpay.
  const razorpay = razorpayClient();
  const [payment, order] = await Promise.all([
    razorpay.payments.fetch(razorpay_payment_id),
    razorpay.orders.fetch(razorpay_order_id),
  ]);

  // 4
  if (payment.order_id !== razorpay_order_id) {
    return { ok: false, message: "Payment does not belong to this order" };
  }

  // 5
  if (payment.status !== "captured") {
    return { ok: false, message: "Payment was not captured" };
  }

  const verifiedUid =
    typeof order.notes?.verifiedUid === "string" ? order.notes.verifiedUid : null;

  // 6
  if (params.expectedUid && verifiedUid && verifiedUid !== params.expectedUid) {
    return { ok: false, message: "This payment does not belong to your account" };
  }

  const rawExpected = order.notes?.expectedAmount;
  const expectedAmountPaise =
    rawExpected != null && Number.isFinite(Number(rawExpected))
      ? Number(rawExpected)
      : null;

  // 7
  if (
    expectedAmountPaise != null &&
    String(payment.amount) !== String(expectedAmountPaise)
  ) {
    return { ok: false, message: "Payment amount does not match the order" };
  }

  return {
    ok: true,
    amountPaise: Number(payment.amount),
    verifiedUid,
    expectedAmountPaise,
  };
}

/**
 * Webhook signature is a different HMAC from the checkout one: it is computed
 * over the RAW request body with RAZORPAY_WEBHOOK_SECRET, not over
 * "<order_id>|<payment_id>" with the key secret. The raw text must be hashed
 * before any JSON.parse — re-serialising changes byte order and the digest.
 */
export function verifyRazorpayWebhookSignature(
  rawBody: string,
  signatureHeader: string | null
): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;

  if (!secret || !signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");

  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signatureHeader, "utf8");

  // Length check first: timingSafeEqual throws on a length mismatch.
  if (a.length !== b.length) return false;

  return crypto.timingSafeEqual(a, b);
}
