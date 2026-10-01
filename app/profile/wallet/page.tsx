"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { fetchAccountWallet, formatDate, type AccountWallet } from "@/lib/account/accountClient";
import { useRouter } from "next/navigation";
import { customerLoginUrl } from "@/lib/authRedirect";

// Reward Wallet. From app/api/account/wallet:
//   - the BALANCE is the stored users.rewardPoints. This page used to add up the
//     history in the browser, which got cancellations backwards and missed some
//     rows, so it could show a different number from the stored balance. Points
//     are NOT spendable at checkout (/api/place-order and /api/create-order
//     refuse redeemPoints), so this page must not imply a rupee value or a
//     checkout discount;
//   - PENDING points and why each is held, from the same rule the credit job
//     applies (lib/rewardCredit);
//   - the signed history, 50 entries at a time. No lifetime totals.

type LedgerEntry = AccountWallet["ledger"][number];
type PendingOrder = AccountWallet["pending"]["orders"][number];

const HELD_BY: Record<PendingOrder["heldBy"], string> = {
  "not-delivered": "Credited after delivery and the 7-day return window",
  "awaiting-payment": "Waiting for payment confirmation",
  "return-window": "Credited when the 7-day return window closes",
  "open-return": "On hold while a return on this order is open",
  processing: "Being credited now",
};

export default function RewardWalletPage() {
  const router = useRouter();
  const [wallet, setWallet] = useState<AccountWallet | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchAccountWallet();
    setError(result.error);
    if (result.data) {
      setWallet(result.data);
      setLedger(result.data.ledger);
      setNextCursor(result.data.nextCursor);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        // Signed out: send to the customer login (back here afterwards) and stay
        // in the loading state meanwhile — never render a signed-out wallet/
        // refunds page as if it were an empty account.
        router.push(customerLoginUrl());
        return;
      }
      load();
    });
    return () => unsub();
  }, [load, router]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    const result = await fetchAccountWallet(nextCursor);
    setLoadingMore(false);
    if (result.data) {
      setLedger((prev) => [...prev, ...result.data!.ledger]);
      setNextCursor(result.data.nextCursor);
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
          ← Back to Profile
        </Link>

        <div className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white p-6 sm:p-8 rounded-3xl">
          <p className="opacity-90">🏆 Reward Wallet</p>
          <h1 className="text-4xl sm:text-5xl font-bold mt-2">{wallet?.balance ?? 0} points</h1>
          <p className="mt-1 opacity-90">Points balance — kept safe in your wallet (not usable at checkout)</p>
          {wallet && wallet.pending.points > 0 && (
            <p className="mt-2 text-sm opacity-90">+ {wallet.pending.points} points pending</p>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">Loading...</div>
        ) : error && !wallet ? (
          <div className="bg-red-50 rounded-3xl p-6 text-red-700">{error}</div>
        ) : (
          <>
            {wallet && wallet.pending.orders.length > 0 && (
              <div className="bg-white rounded-3xl shadow p-6">
                <h2 className="text-xl font-bold mb-4">⏳ Pending points</h2>
                <div className="space-y-3">
                  {wallet.pending.orders.map((p, i) => (
                    <div key={`${p.orderNumber}-${i}`} className="flex flex-wrap items-center justify-between gap-2 border rounded-2xl p-4">
                      <div className="min-w-0">
                        <p className="font-semibold">{p.orderNumber ? `Order ${p.orderNumber}` : "Order"}</p>
                        <p className="text-xs text-gray-500">
                          {HELD_BY[p.heldBy]}
                          {p.heldBy === "return-window" && p.creditsAfter ? ` (after ${formatDate(p.creditsAfter)})` : ""}
                        </p>
                      </div>
                      <p className="font-bold text-orange-600">+{p.points}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-3xl shadow p-6">
              <h2 className="text-xl font-bold mb-4">📜 History</h2>
              {ledger.length === 0 ? (
                <p className="text-gray-500">No reward activity yet.</p>
              ) : (
                <div className="divide-y">
                  {ledger.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 py-3">
                      <div className="min-w-0">
                        <p className="font-semibold">{entry.label}</p>
                        <p className="text-xs text-gray-500">
                          {formatDate(entry.createdAt)}
                          {entry.orderNumber ? ` · Order ${entry.orderNumber}` : ""}
                        </p>
                      </div>
                      <p
                        className={`shrink-0 font-bold ${
                          entry.kind === "other" ? "text-gray-700" : entry.points < 0 ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {entry.kind === "other" ? entry.points : entry.points > 0 ? `+${entry.points}` : entry.points}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {nextCursor && (
                <button
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="mt-4 w-full rounded-2xl border py-3 font-semibold text-gray-700 disabled:opacity-60"
                >
                  {loadingMore ? "Loading…" : "Show more"}
                </button>
              )}
            </div>

            {wallet && (
              <div className="bg-white rounded-3xl shadow p-6 text-sm text-gray-600 space-y-2">
                <h2 className="text-lg font-bold text-gray-900">How points work</h2>
                <p>{wallet.rules.earn}</p>
                <p>{wallet.rules.redeem}</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
