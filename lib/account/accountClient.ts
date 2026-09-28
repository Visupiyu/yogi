// Browser helpers for the customer account pages. Every read goes through
// app/api/account/* (the server picks the customer from the verified token and
// returns fixed fields); these pages no longer read orders, returns, ledger
// rows or other customers' profiles from Firestore themselves.
import { auth } from "@/lib/firebase";
import type { AccountReferrals, AccountSummary } from "@/lib/account/accountViews";
import type { AccountReturns, AccountWallet } from "@/lib/account/accountServer";

export type { AccountReferrals, AccountSummary, AccountReturns, AccountWallet };

type Result<T> = { data: T | null; error: string | null };

async function authed<T>(url: string, init: RequestInit = {}): Promise<Result<T>> {
  const user = auth.currentUser;
  if (!user) return { data: null, error: "Please sign in." };
  try {
    const res = await fetch(url, {
      ...init,
      headers: { ...(init.headers || {}), Authorization: `Bearer ${await user.getIdToken()}` },
    });
    const body = await res.json().catch(() => null);
    if (!res.ok) return { data: null, error: typeof body?.error === "string" ? body.error : "Something went wrong." };
    return { data: body as T, error: null };
  } catch {
    return { data: null, error: "Network error. Please try again." };
  }
}

export const fetchAccountSummary = () => authed<AccountSummary>("/api/account/summary");
export const fetchAccountReturns = () => authed<AccountReturns>("/api/account/returns");
export const fetchAccountReferrals = () => authed<AccountReferrals>("/api/account/referrals");
export const fetchAccountWallet = (cursor?: string | null) =>
  authed<AccountWallet>(`/api/account/wallet${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ""}`);

/**
 * Ask the server to issue this customer's referral code if they have none
 * (app/api/signup-rewards — codes are server-issued and never change). It also
 * settles a referral bonus that was waiting, idempotently.
 */
export function ensureReferralCode() {
  return authed<{ referralCode?: string | null }>("/api/signup-rewards", { method: "POST" });
}

/** Confirm YOMICO's proposed pickup slot, or ask for another time (app/api/item-request/respond). */
export function respondToPickup(requestId: string, action: "accept" | "counter", counterAt?: string) {
  return authed<{ success: boolean }>("/api/item-request/respond", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requestId, action, ...(action === "counter" ? { counterAt } : {}) }),
  });
}

export const formatDate = (isoValue: string | null, withTime = false) => {
  if (!isoValue) return "";
  const d = new Date(isoValue);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: true } : {}),
    timeZone: "Asia/Kolkata",
  });
};
