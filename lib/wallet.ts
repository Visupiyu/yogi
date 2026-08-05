export type WalletType =
  | "CUSTOMER"
  | "SELLER"
  | "ADMIN";

export type TransactionType =
  | "CREDIT"
  | "DEBIT"
  | "REFUND"
  | "WITHDRAWAL"
  | "COMMISSION"
  | "REWARD"
  | "CASHBACK";

export interface Wallet {

  userId: string;

  walletType: WalletType;

  balance: number;

  totalCredited: number;

  totalDebited: number;

  lastUpdated: Date;

}

export interface WalletTransaction {

  transactionId: string;

  userId: string;

  type: TransactionType;

  amount: number;

  description: string;

  referenceId?: string;

  createdAt: Date;

}

export function createWallet(
  userId: string,
  walletType: WalletType
): Wallet {

  return {

    userId,

    walletType,

    balance: 0,

    totalCredited: 0,

    totalDebited: 0,

    lastUpdated: new Date(),

  };

}

export function creditWallet(
  wallet: Wallet,
  amount: number
): Wallet {

  if (amount <= 0) {
    throw new Error("Invalid amount.");
  }

  return {

    ...wallet,

    balance: wallet.balance + amount,

    totalCredited:
      wallet.totalCredited + amount,

    lastUpdated: new Date(),

  };

}

export function debitWallet(
  wallet: Wallet,
  amount: number
): Wallet {

  if (amount <= 0) {
    throw new Error("Invalid amount.");
  }

  if (wallet.balance < amount) {
    throw new Error("Insufficient wallet balance.");
  }

  return {

    ...wallet,

    balance: wallet.balance - amount,

    totalDebited:
      wallet.totalDebited + amount,

    lastUpdated: new Date(),

  };

}

export function hasSufficientBalance(
  wallet: Wallet,
  amount: number
): boolean {

  return wallet.balance >= amount;

}

export function createWalletTransaction(

  userId: string,

  type: TransactionType,

  amount: number,

  description: string,

  referenceId: string = ""

): WalletTransaction {

  return {

    transactionId:

      `TXN-${Date.now()}`,

    userId,

    type,

    amount,

    description,

    referenceId,

    createdAt: new Date(),

  };

}

export function getWalletSummary(
  wallet: Wallet
) {

  return {

    currentBalance:
      wallet.balance,

    totalCredited:
      wallet.totalCredited,

    totalDebited:
      wallet.totalDebited,

  };

}