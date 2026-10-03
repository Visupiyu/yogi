/*
 * The list of automated test suites run by `npm test` and CI.
 *
 * Each entry:
 *   name       unique id, used with `npm test -- <name>`
 *   file       the suite entry point
 *   emulators  Firebase emulators it needs ("" = plain Node, no emulator)
 *   project    demo-* project id (demo-* ids never reach a real Firebase project)
 *   harness    true = run with the Razorpay-fake tsconfig (scripts/test/mobile-variant)
 *   knownBaselineFailure
 *              true = already failing on the clean baseline e88d1aa, before
 *              the Phase 6 medium batch (see KNOWN_BASELINE_FAILURES below).
 *              Not run by `npm test` / CI; `npm test -- --known` runs them.
 *
 * `excluded` lists suites that are NOT run, each with the reason. Nothing is
 * skipped silently: the runner prints every exclusion on every run.
 */

const fs = (emulators, project = "demo-yomico-test") => ({ emulators, project });

export const suites = [
  { name: "config", file: "scripts/test/config/preview-isolation.test.mts", emulators: "" },
  { name: "observability", file: "scripts/test/observability/run.test.mts", emulators: "" },
  { name: "product-approval-surfaces", file: "scripts/test/product-approval/surfaces.test.mts", ...fs("firestore") },
  { name: "phase6-storefront", file: "scripts/test/phase6/storefront.test.mts", emulators: "" },

  { name: "admin-access-rules", file: "scripts/test/admin-access/rules.test.mts", ...fs("firestore,storage") },
  { name: "admin-access", file: "scripts/test/admin-access/run.mts", ...fs("firestore"), harness: true },
  { name: "cod-duplicate", file: "scripts/test/cod-duplicate/run.mts", ...fs("firestore"), harness: true },
  { name: "contact-form", file: "scripts/test/contact-form/run.mts", ...fs("firestore") },
  { name: "coupons-rules", file: "scripts/test/coupons/rules.test.mts", ...fs("firestore", "demo-yomico-coupon-rules") },
  { name: "coupons", file: "scripts/test/coupons/run.mts", ...fs("firestore"), harness: true },
  { name: "customer-account-p3", file: "scripts/test/customer-account-p3/run.mts", ...fs("firestore"), harness: true },
  { name: "customer-account-views", file: "scripts/test/customer-account-views/run.mts", ...fs("firestore"), harness: true },
  { name: "customer-account-rules", file: "scripts/test/customer-account/rules.test.mts", ...fs("firestore") },
  { name: "customer-account", file: "scripts/test/customer-account/run.mts", ...fs("firestore"), harness: true },
  { name: "delivery-otp", file: "scripts/test/delivery-otp/run.mts", ...fs("firestore"), harness: true },
  { name: "delivery-proof-rules", file: "scripts/test/delivery-proof/rules.test.mts", ...fs("firestore", "demo-yomico-delivery") },
  { name: "kyc-rules", file: "scripts/test/kyc/rules.test.mts", ...fs("firestore,storage", "demo-yomico-kyc") },
  { name: "kyc-flow", file: "scripts/test/kyc/flow.mts", ...fs("firestore,storage"), harness: true },
  { name: "mobile-blocked-orders", file: "scripts/test/mobile-blocked-orders/run.mts", ...fs("firestore"), harness: true },
  { name: "mobile-variant", file: "scripts/test/mobile-variant/run.mts", ...fs("firestore"), harness: true },
  { name: "money-integrity-rules", file: "scripts/test/money-integrity/rules.test.mts", ...fs("firestore") },
  { name: "money-integrity", file: "scripts/test/money-integrity/run.mts", ...fs("firestore"), harness: true },
  { name: "order-containment-rules", file: "scripts/test/order-containment/rules.test.mts", ...fs("firestore") },
  { name: "order-containment", file: "scripts/test/order-containment/run.mts", ...fs("firestore"), harness: true },
  { name: "order-emails", file: "scripts/test/order-emails/run.mts", ...fs("firestore"), harness: true },
  { name: "order-refund", file: "scripts/test/order-refund/run.mts", ...fs("firestore"), harness: true },
  { name: "payment-intent", file: "scripts/test/payment-intent/run.mts", ...fs("firestore"), harness: true },
  { name: "points-ledger-rules", file: "scripts/test/points-ledger/rules.test.mts", ...fs("firestore") },
  { name: "points-ledger", file: "scripts/test/points-ledger/run.mts", ...fs("firestore"), harness: true },
  { name: "pricing", file: "scripts/test/pricing/run.mts", ...fs("firestore"), harness: true },
  { name: "product-approval-rules", file: "scripts/test/product-approval/rules.test.mts", ...fs("firestore") },
  { name: "product-approval", file: "scripts/test/product-approval/run.mts", ...fs("firestore"), harness: true },
  { name: "reconciliation", file: "scripts/test/reconciliation/run.mts", ...fs("firestore") },
  { name: "return-window", file: "scripts/test/return-window/run.mts", ...fs("firestore"), harness: true },
  { name: "reward-redemption", file: "scripts/test/reward-redemption/run.mts", ...fs("firestore"), harness: true },
  { name: "rewards-eligibility", file: "scripts/test/rewards-eligibility/run.mts", ...fs("firestore"), harness: true },
  { name: "seller-analytics", file: "scripts/test/seller-analytics/run.mts", ...fs("firestore"), harness: true },
  { name: "seller-business-rules", file: "scripts/test/seller-business/rules.test.mts", ...fs("firestore") },
  { name: "seller-business", file: "scripts/test/seller-business/run.mts", ...fs("firestore,storage"), harness: true },
  { name: "seller-order-view-rules", file: "scripts/test/seller-order-view/rules.test.mts", ...fs("firestore") },
  { name: "seller-order-view", file: "scripts/test/seller-order-view/run.mts", ...fs("firestore"), harness: true },
  { name: "seller-orders-rules", file: "scripts/test/seller-orders/rules.test.mts", ...fs("firestore") },
  { name: "seller-orders", file: "scripts/test/seller-orders/run.mts", ...fs("firestore"), harness: true },
  { name: "seller-products-rules", file: "scripts/test/seller-products/rules.test.mts", ...fs("firestore") },
  { name: "seller-products", file: "scripts/test/seller-products/run.mts", ...fs("firestore"), harness: true },
  { name: "seller-settlement-rules", file: "scripts/test/seller-settlement/rules.test.mts", ...fs("firestore") },
  { name: "seller-settlement", file: "scripts/test/seller-settlement/run.mts", ...fs("firestore"), harness: true },
  { name: "seller-statement", file: "scripts/test/seller-statement/run.mts", ...fs("firestore"), harness: true },
  { name: "storage-rules", file: "scripts/test/storage/rules.test.mts", ...fs("firestore,storage", "demo-yomico-storage") },
  { name: "storefront", file: "scripts/test/storefront/run.mts", ...fs("firestore"), harness: true },
  { name: "vendor-payout-rules", file: "scripts/test/vendor-payout/rules.test.mts", ...fs("firestore") },
  { name: "vendor-payout", file: "scripts/test/vendor-payout/run.mts", ...fs("firestore"), harness: true },
  { name: "withdrawals-rules", file: "scripts/test/withdrawals/rules.test.mts", ...fs("firestore") },
];

/** Suites deliberately not run. Each must say why. */
export const excluded = [
  {
    name: "reconciliation/orphan-orders-report",
    file: "scripts/test/reconciliation/orphan-orders-report.ts",
    reason: "Operator tool, not a test: a read-only report against a real project (ALLOW_PRODUCTION=yes). Never run in CI.",
  },
];

/**
 * Suites known to fail on the clean baseline and therefore not run by default
 * (`npm test -- --known` runs them). EMPTY: the four legacy failures from
 * e88d1aa (product-approval-surfaces, money-integrity, pricing,
 * product-approval) were stale tests and have been fixed. Only add a suite
 * here with a baseline run showing the same failure, and fix it soon.
 */
export const KNOWN_BASELINE_FAILURES = {};
