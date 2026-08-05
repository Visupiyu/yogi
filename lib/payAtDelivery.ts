export type PayAtDeliveryStatus =
  | "Pending"
  | "WaitingForDelivery"
  | "WaitingForPayment"
  | "Paid"
  | "Cancelled";

export interface PayAtDeliveryOrder {

  orderId: string;

  customerName: string;

  customerPhone: string;

  amount: number;

  paymentMethod: "UPI_AT_DELIVERY";

  paymentStatus: PayAtDeliveryStatus;

  upiTransactionId?: string;

  paidAt?: Date | null;

  deliveryPartnerId?: string;

}

export function createPayAtDeliveryOrder(
  orderId: string,
  customerName: string,
  customerPhone: string,
  amount: number
): PayAtDeliveryOrder {

  return {

    orderId,

    customerName,

    customerPhone,

    amount,

    paymentMethod: "UPI_AT_DELIVERY",

    paymentStatus: "Pending",

    upiTransactionId: "",

    paidAt: null,

    deliveryPartnerId: "",

  };

}

export function markOutForDelivery(
  order: PayAtDeliveryOrder
): PayAtDeliveryOrder {

  return {

    ...order,

    paymentStatus: "WaitingForDelivery",

  };

}

export function readyForPayment(
  order: PayAtDeliveryOrder
): PayAtDeliveryOrder {

  return {

    ...order,

    paymentStatus: "WaitingForPayment",

  };

}

export function confirmPayment(
  order: PayAtDeliveryOrder,
  transactionId: string
): PayAtDeliveryOrder {

  return {

    ...order,

    paymentStatus: "Paid",

    upiTransactionId: transactionId,

    paidAt: new Date(),

  };

}

export function cancelPayment(
  order: PayAtDeliveryOrder
): PayAtDeliveryOrder {

  return {

    ...order,

    paymentStatus: "Cancelled",

  };

}

export function isPaymentCompleted(
  order: PayAtDeliveryOrder
): boolean {

  return order.paymentStatus === "Paid";

}

export function canDeliverOrder(
  order: PayAtDeliveryOrder
): boolean {

  return order.paymentStatus === "Paid";

}