// LOCAL TEST ONLY — drop-in fake for the `razorpay` npm module. The ESM resolve
// hook (hooks.mjs) redirects `import Razorpay from "razorpay"` here so NO real
// Razorpay API call is ever made from the harness. Behaviour is steered by
// control.mjs, which the harness mutates per scenario.
import { control } from "./control.mjs";

export default class RazorpayFake {
  constructor(options) {
    this.options = options;
    this.orders = {
      create: async (options) => {
        control.calls.ordersCreate++;
        if (control.ordersCreate) return control.ordersCreate(options);
        return {
          id: "order_TEST_" + Math.random().toString(36).slice(2),
          amount: options?.amount,
          currency: options?.currency,
          notes: options?.notes,
          status: "created",
        };
      },
      fetch: async (id) => {
        control.calls.ordersFetch++;
        if (control.ordersFetch) return control.ordersFetch(id);
        return { id, notes: {} };
      },
    };
    this.payments = {
      fetch: async (id) => {
        control.calls.paymentsFetch++;
        if (control.paymentsFetch) return control.paymentsFetch(id);
        return { id };
      },
      // Refund API — never reaches Razorpay; each harness supplies behaviour.
      refund: async (paymentId, params) => {
        control.calls.paymentsRefund++;
        if (control.paymentsRefund) return control.paymentsRefund(paymentId, params);
        throw { statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "refund not stubbed" } };
      },
      fetchMultipleRefund: async (paymentId, params) => {
        control.calls.paymentsFetchMultipleRefund++;
        if (control.paymentsFetchMultipleRefund) return control.paymentsFetchMultipleRefund(paymentId, params);
        return { entity: "collection", count: 0, items: [] };
      },
      fetchRefund: async (paymentId, refundId) => {
        control.calls.paymentsFetchRefund++;
        if (control.paymentsFetchRefund) return control.paymentsFetchRefund(paymentId, refundId);
        throw { statusCode: 400, error: { code: "BAD_REQUEST_ERROR", description: "refund not found" } };
      },
    };
  }
}
