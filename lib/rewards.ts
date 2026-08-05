export interface RewardAccount {

  userId: string;

  availablePoints: number;

  lifetimeEarned: number;

  lifetimeRedeemed: number;

}

export interface RewardTransaction {

  userId: string;

  type: "Earned" | "Redeemed" | "Expired" | "Bonus";

  points: number;

  description: string;

  createdAt: Date;

}

export const REWARD_RULES = {

  POINTS_PER_100: 1,

  MAX_REDEEM_PERCENTAGE: 100,

};

export function calculateEarnedPoints(
  orderAmount: number
): number {

  return Math.floor(
    orderAmount / 100
  ) * REWARD_RULES.POINTS_PER_100;

}

export function calculateRedeemValue(
  availablePoints: number,
  orderAmount: number
): number {

  return Math.min(
    availablePoints,
    Math.floor(orderAmount)
  );

}

export function addRewardPoints(
  account: RewardAccount,
  points: number
): RewardAccount {

  return {

    ...account,

    availablePoints:
      account.availablePoints + points,

    lifetimeEarned:
      account.lifetimeEarned + points,

  };

}

export function redeemRewardPoints(
  account: RewardAccount,
  points: number
): RewardAccount {

  if (points > account.availablePoints) {

    throw new Error(
      "Insufficient reward points."
    );

  }

  return {

    ...account,

    availablePoints:
      account.availablePoints - points,

    lifetimeRedeemed:
      account.lifetimeRedeemed + points,

  };

}

export function createRewardTransaction(

  userId: string,

  type: RewardTransaction["type"],

  points: number,

  description: string

): RewardTransaction {

  return {

    userId,

    type,

    points,

    description,

    createdAt: new Date(),

  };

}

export function hasEnoughPoints(
  account: RewardAccount,
  requiredPoints: number
): boolean {

  return account.availablePoints >= requiredPoints;

}

export function getRewardSummary(
  account: RewardAccount
) {

  return {

    available: account.availablePoints,

    earned: account.lifetimeEarned,

    redeemed: account.lifetimeRedeemed,

  };

}