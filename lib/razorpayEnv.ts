// SERVER-ONLY preview fail-safe. A Vercel PREVIEW deployment must never create
// or verify a payment against the LIVE Razorpay account. When
// VERCEL_ENV === "preview", RAZORPAY_KEY_ID must be a TEST key
// (rzp_test_...); otherwise this throws BEFORE any Razorpay client is used.
// Production (VERCEL_ENV === "production") and local development are unaffected.
// Reads only the key-id PREFIX — it never logs or returns a secret value.

export function assertRazorpayTestKeyInPreview(
  env: Record<string, string | undefined> = process.env
): void {
  if (env.VERCEL_ENV !== "preview") return;

  const keyId = env.RAZORPAY_KEY_ID || "";
  if (!keyId.startsWith("rzp_test_")) {
    throw new Error(
      "Preview refuses to use a non-test Razorpay account: RAZORPAY_KEY_ID " +
        "must begin with 'rzp_test_' on a Vercel Preview deployment."
    );
  }
}
