// LOCAL TEST ONLY — shared, mutable control for the faked `razorpay` module.
// Backed by a globalThis singleton so it is the SAME object no matter how many
// times this module is resolved (the fake resolves it relative to itself; the
// harness resolves it relative to run.mts — tsx can load those as two module
// instances, so the state must live on globalThis to be shared).
const g = /** @type {any} */ (globalThis);
if (!g.__RZP_TEST_CONTROL__) {
  g.__RZP_TEST_CONTROL__ = {
    ordersCreate: null,
    paymentsFetch: null,
    ordersFetch: null,
    calls: { ordersCreate: 0, paymentsFetch: 0, ordersFetch: 0 },
    reset() {
      this.ordersCreate = null;
      this.paymentsFetch = null;
      this.ordersFetch = null;
      this.calls = { ordersCreate: 0, paymentsFetch: 0, ordersFetch: 0 };
    },
  };
}
export const control = g.__RZP_TEST_CONTROL__;
