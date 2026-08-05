export type OrderStatus =
  | "Pending"
  | "Accepted"
  | "Packed"
  | "Shipped"
  | "Out For Delivery"
  | "Waiting For UPI Payment"
  | "Delivered"
  | "Cancelled"
  | "Returned"
  | "Refunded";

export const ORDER_STATUS = {

  PENDING: "Pending",

  ACCEPTED: "Accepted",

  PACKED: "Packed",

  SHIPPED: "Shipped",

  OUT_FOR_DELIVERY: "Out For Delivery",

  WAITING_FOR_UPI_PAYMENT:
    "Waiting For UPI Payment",

  DELIVERED: "Delivered",

  CANCELLED: "Cancelled",

  RETURNED: "Returned",

  REFUNDED: "Refunded",

} as const;

export function canCancelOrder(
  status: OrderStatus
): boolean {

  return (
  status === ORDER_STATUS.PENDING ||
  status === ORDER_STATUS.ACCEPTED
);
}
export function canReturnOrder(
  status: OrderStatus
): boolean {

  return status ===
    ORDER_STATUS.DELIVERED;

}

export function canRefundOrder(
  status: OrderStatus
): boolean {

  return (
    status === ORDER_STATUS.PENDING ||
    status === ORDER_STATUS.ACCEPTED
  );

}

export function isCompleted(
  status: OrderStatus
): boolean {

  return status ===
    ORDER_STATUS.DELIVERED;

}

export function isActive(
  status: OrderStatus
): boolean {

   return (
    status === ORDER_STATUS.PENDING ||
    status === ORDER_STATUS.ACCEPTED ||
    status === ORDER_STATUS.PACKED ||
    status === ORDER_STATUS.SHIPPED ||
    status === ORDER_STATUS.OUT_FOR_DELIVERY ||
    status === ORDER_STATUS.WAITING_FOR_UPI_PAYMENT
  );

}

export function getNextStatus(
  status: OrderStatus
): OrderStatus {

  switch (status) {

    case ORDER_STATUS.PENDING:
      return ORDER_STATUS.ACCEPTED;

    case ORDER_STATUS.ACCEPTED:
      return ORDER_STATUS.PACKED;

    case ORDER_STATUS.PACKED:
      return ORDER_STATUS.SHIPPED;

    case ORDER_STATUS.SHIPPED:
      return ORDER_STATUS.OUT_FOR_DELIVERY;

    case ORDER_STATUS.OUT_FOR_DELIVERY:
      return ORDER_STATUS.WAITING_FOR_UPI_PAYMENT;

    case ORDER_STATUS.WAITING_FOR_UPI_PAYMENT:
      return ORDER_STATUS.DELIVERED;

    default:
      return status;

  }

}

export function getStatusColor(
  status: OrderStatus
): string {

  switch (status) {

    case ORDER_STATUS.PENDING:
      return "yellow";

    case ORDER_STATUS.ACCEPTED:
      return "blue";

    case ORDER_STATUS.PACKED:
      return "indigo";

    case ORDER_STATUS.SHIPPED:
      return "purple";

    case ORDER_STATUS.OUT_FOR_DELIVERY:
      return "orange";

    case ORDER_STATUS.WAITING_FOR_UPI_PAYMENT:
      return "pink";

    case ORDER_STATUS.DELIVERED:
      return "green";

    case ORDER_STATUS.CANCELLED:
      return "red";

    case ORDER_STATUS.RETURNED:
      return "gray";

    case ORDER_STATUS.REFUNDED:
      return "teal";

    default:
      return "gray";

  }

}
