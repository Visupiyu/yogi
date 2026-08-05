export type DeliveryStatus =
  | "Pending"
  | "Assigned"
  | "Picked Up"
  | "Out For Delivery"
  | "Delivered"
  | "Failed"
  | "Cancelled";

export interface DeliveryOrder {

  orderId: string;

  deliveryId: string;

  deliveryPartnerId: string;

  deliveryPartnerName: string;

  customerName: string;

  customerPhone: string;

  customerAddress: string;

  amount: number;

  paymentMethod:
    | "ONLINE"
    | "UPI_AT_DELIVERY"
    | "COD";

  paymentStatus:
    | "Pending"
    | "Paid";

  deliveryStatus: DeliveryStatus;

  assignedAt?: Date;

  pickedUpAt?: Date;

  deliveredAt?: Date;

}

export function assignDeliveryPartner(

  order: DeliveryOrder,

  partnerId: string,

  partnerName: string

): DeliveryOrder {

  return {

    ...order,

    deliveryPartnerId: partnerId,

    deliveryPartnerName: partnerName,

    deliveryStatus: "Assigned",

    assignedAt: new Date(),

  };

}

export function markPickedUp(
  order: DeliveryOrder
): DeliveryOrder {

  return {

    ...order,

    deliveryStatus: "Picked Up",

    pickedUpAt: new Date(),

  };

}

export function markOutForDelivery(
  order: DeliveryOrder
): DeliveryOrder {

  return {

    ...order,

    deliveryStatus: "Out For Delivery",

  };

}

export function markDelivered(
  order: DeliveryOrder
): DeliveryOrder {

  return {

    ...order,

    deliveryStatus: "Delivered",

    deliveredAt: new Date(),

  };

}

export function markDeliveryFailed(
  order: DeliveryOrder
): DeliveryOrder {

  return {

    ...order,

    deliveryStatus: "Failed",

  };

}

export function cancelDelivery(
  order: DeliveryOrder
): DeliveryOrder {

  return {

    ...order,

    deliveryStatus: "Cancelled",

  };

}

export function canCollectPayment(
  order: DeliveryOrder
): boolean {

  return (
    order.paymentMethod ===
      "UPI_AT_DELIVERY" &&
    order.paymentStatus ===
      "Pending" &&
    order.deliveryStatus ===
      "Out For Delivery"
  );

}

export function isDeliveryCompleted(
  order: DeliveryOrder
): boolean {

  return (
    order.deliveryStatus ===
    "Delivered"
  );

}