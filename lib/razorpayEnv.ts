// SERVER-ONLY preview / local-dev fail-safe. A Vercel PREVIEW deployment, and
// local development (`next dev`, NODE_ENV === "development"), must never
// create, verify or refund a payment against the LIVE Razorpay account: there
// RAZORPAY_KEY_ID must be a TEST key (rzp_test_...), otherwise this throws
// BEFORE any Razorpay client is used. Local development may opt out only with
// ALLOW_LIVE_RAZORPAY_IN_DEV=true. Production (VERCEL_ENV === "production", any
// `next build`) is unaffected. Reads only the key-id PREFIX — it never logs or
// returns a secret value.

export function assertRazorpayTestKeyInPreview(
  env: Record<string, string | undefined> = process.env
): void {
  const isPreview = env.VERCEL_ENV === "preview";
  const isLocalDev =
    env.NODE_ENV === "development" && env.ALLOW_LIVE_RAZORPAY_IN_DEV !== "true";
  if (!isPreview && !isLocalDev) return;

  const keyId = env.RAZORPAY_KEY_ID || "";
  if (!keyId.startsWith("rzp_test_")) {
    throw new Error(
      (isPreview ? "Preview" : "Local development") +
        " refuses to use a non-test Razorpay account: RAZORPAY_KEY_ID " +
        "must begin with 'rzp_test_' outside production."
    );
  }
}
