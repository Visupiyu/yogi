// LOCAL TEST ONLY — shared, mutable control for the faked `razorpay` module.
// Backed by a globalThis singleton so it is the SAME object no matter how many
// times this module is resolved (the fake resolves it relative to itself; the
// harness resolves it relative to run.mts — tsx can load those as two module
// instances, so the state must live on globalThis to be shared).
const g = /** @type {any} */ (globalThis);
const zeroCalls = () => ({
  ordersCreate: 0,
  paymentsFetch: 0,
  ordersFetch: 0,
  // Refund API (scripts/test/order-refund).
  paymentsRefund: 0,
  paymentsFetchMultipleRefund: 0,
  paymentsFetchRefund: 0,
});
if (!g.__RZP_TEST_CONTROL__) {
  g.__RZP_TEST_CONTROL__ = {
    ordersCreate: null,
    paymentsFetch: null,
    ordersFetch: null,
    paymentsRefund: null,
    paymentsFetchMultipleRefund: null,
    paymentsFetchRefund: null,
    calls: zeroCalls(),
    reset() {
      this.ordersCreate = null;
      this.paymentsFetch = null;
      this.ordersFetch = null;
      this.paymentsRefund = null;
      this.paymentsFetchMultipleRefund = null;
      this.paymentsFetchRefund = null;
      this.calls = zeroCalls();
    },
  };
}
export const control = g.__RZP_TEST_CONTROL__;
