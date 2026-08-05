export type PaymentMethod =
  | "ONLINE"
  | "UPI_AT_DELIVERY"
  | "COD";

export type PaymentStatus =
  | "Pending"
  | "Paid"
  | "Failed"
  | "Cancelled"
  | "Refunded";

export interface PaymentRecord {

  orderId: string;

  customerId: string;

  amount: number;

  paymentMethod: PaymentMethod;

  paymentStatus: PaymentStatus;

  transactionId?: string;

  gateway?: string;

  paidAt?: Date | null;

  remarks?: string;

}

export function createPayment(

  orderId: string,

  customerId: string,

  amount: number,

  paymentMethod: PaymentMethod

): PaymentRecord {

  return {

    orderId,

    customerId,

    amount,

    paymentMethod,

    paymentStatus: "Pending",

    transactionId: "",

    gateway: "",

    paidAt: null,

    remarks: "",

  };

}

export function markPaymentSuccess(

  payment: PaymentRecord,

  transactionId: string,

  gateway: string

): PaymentRecord {

  return {

    ...payment,

    paymentStatus: "Paid",

    transactionId,

    gateway,

    paidAt: new Date(),

  };

}

export function markPaymentFailed(

  payment: PaymentRecord,

  reason: string

): PaymentRecord {

  return {

    ...payment,

    paymentStatus: "Failed",

    remarks: reason,

  };

}

export function cancelPayment(

  payment: PaymentRecord

): PaymentRecord {

  return {

    ...payment,

    paymentStatus: "Cancelled",

  };

}

export function refundPayment(

  payment: PaymentRecord

): PaymentRecord {

  return {

    ...payment,

    paymentStatus: "Refunded",

  };

}

export function isPaymentCompleted(

  payment: PaymentRecord

): boolean {

  return payment.paymentStatus === "Paid";

}

export function isOnlinePayment(

  payment: PaymentRecord

): boolean {

  return payment.paymentMethod === "ONLINE";

}

export function isPayAtDelivery(

  payment: PaymentRecord

): boolean {

  return payment.paymentMethod === "UPI_AT_DELIVERY";

}

export function isCashOnDelivery(

  payment: PaymentRecord

): boolean {

  return payment.paymentMethod === "COD";

}