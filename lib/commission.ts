export const DEFAULT_COMMISSION_RATE = 10; // %

export interface CommissionDetails {
  orderAmount: number;
  commissionRate: number;
  commissionAmount: number;
  sellerEarning: number;
  gstOnCommission: number;
  totalPlatformIncome: number;
}

export function calculateCommission(
  orderAmount: number,
  commissionRate: number = DEFAULT_COMMISSION_RATE,
  gstRate: number = 18
): CommissionDetails {

  const commissionAmount =
    (orderAmount * commissionRate) / 100;

  const gstOnCommission =
    (commissionAmount * gstRate) / 100;

  const sellerEarning =
    orderAmount - commissionAmount;

  const totalPlatformIncome =
    commissionAmount + gstOnCommission;

  return {

    orderAmount,

    commissionRate,

    commissionAmount,

    sellerEarning,

    gstOnCommission,

    totalPlatformIncome,

  };

}

export function sellerReceivable(
  orderAmount: number,
  commissionRate: number = DEFAULT_COMMISSION_RATE
): number {

  return orderAmount -
    (orderAmount * commissionRate) / 100;

}

export function adminCommission(
  orderAmount: number,
  commissionRate: number = DEFAULT_COMMISSION_RATE
): number {

  return (orderAmount * commissionRate) / 100;

}

export function updateCommissionRate(
  newRate: number
): number {

  if (newRate < 0 || newRate > 100) {

    throw new Error(
      "Commission rate must be between 0 and 100."
    );

  }

  return newRate;

}