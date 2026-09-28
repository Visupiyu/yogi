"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
  ensureReferralCode,
  fetchAccountReferrals,
  formatDate,
  type AccountReferrals,
} from "@/lib/account/accountClient";

// Referral History. From app/api/account/referrals: the customer's own code,
// the bonus rules and this month's cap, and an ANONYMOUS history — "A friend",
// the date they joined and whether the bonus has been paid. Never another
// customer's name, email or uid. A customer without a code gets one from the
// server (app/api/signup-rewards); codes are never chosen in the browser.

export default function ReferralsPage() {
  const router = useRouter();
  const [data, setData] = useState<AccountReferrals | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const load = useCallback(async () => {
    let result = await fetchAccountReferrals();
    if (result.data && !result.data.code) {
      // Accounts made before codes were server-issued (e.g. in the Customer
      // App) get theirs now — issued and stored by the server.
      await ensureReferralCode();
      result = await fetchAccountReferrals();
    }
    setData(result.data);
    setError(result.error);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      load();
    });
    return () => unsub();
  }, [router, load]);

  const shareLink = data?.code && typeof window !== "undefined"
    ? `${window.location.origin}/signup?ref=${encodeURIComponent(data.code)}`
    : "";

  const copy = async (what: "code" | "link") => {
    const text = what === "code" ? data?.code || "" : shareLink;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert(text);
    }
  };

  const share = async () => {
    if (!shareLink) return;
    const nav = navigator as Navigator & { share?: (d: { title: string; text: string; url: string }) => Promise<void> };
    if (nav.share) {
      await nav.share({ title: "Join YOMICO", text: "Sign up on YOMICO with my referral code", url: shareLink }).catch(() => {});
    } else {
      copy("link");
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
          ← Back to Profile
        </Link>

        <div className="bg-gradient-to-r from-purple-600 to-pink-500 text-white p-6 sm:p-8 rounded-3xl">
          <h1 className="text-3xl sm:text-4xl font-bold">🎁 Refer & Earn</h1>
          {data && (
            <p className="mt-2 opacity-90">
              Your friend gets {data.bonuses.welcome} points when they join with your code and verify their email — you get{" "}
              {data.bonuses.referrer} points.
            </p>
          )}
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">Loading...</div>
        ) : error && !data ? (
          <div className="bg-red-50 rounded-3xl p-6 text-red-700">{error}</div>
        ) : data ? (
          <>
            <div className="bg-white rounded-3xl shadow p-6">
              <h2 className="text-xl font-bold mb-4">Your referral code</h2>
              {data.code ? (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-2xl border-2 border-dashed border-purple-400 px-5 py-3 text-2xl font-bold tracking-widest">
                      {data.code}
                    </span>
                    <button onClick={() => copy("code")} className="rounded-xl bg-purple-600 px-4 py-2.5 font-semibold text-white">
                      {copied === "code" ? "Copied!" : "Copy code"}
                    </button>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center gap-3">
                    <input readOnly value={shareLink} className="min-w-0 flex-1 rounded-xl border bg-gray-50 px-3 py-2.5 text-sm text-gray-600" />
                    <button onClick={() => copy("link")} className="rounded-xl border px-4 py-2.5 font-semibold text-gray-700">
                      {copied === "link" ? "Copied!" : "Copy link"}
                    </button>
                    <button onClick={share} className="rounded-xl bg-pink-500 px-4 py-2.5 font-semibold text-white">
                      Share
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-gray-500">Your referral code isn&apos;t ready yet. Please try again shortly.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-white rounded-2xl shadow p-5 text-center">
                <p className="text-sm text-gray-500">Paid referrals</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.paidReferrals}</p>
              </div>
              <div className="bg-white rounded-2xl shadow p-5 text-center">
                <p className="text-sm text-gray-500">Points from referrals</p>
                <p className="mt-1 text-3xl font-bold">{data.totals.pointsEarned}</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow p-6">
              <h2 className="text-xl font-bold mb-4">Referral history</h2>
              {data.history.length === 0 ? (
                <p className="text-gray-500">No one has joined with your code yet.</p>
              ) : (
                <div className="divide-y">
                  {data.history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between gap-3 py-3">
                      <p className="text-gray-800">
                        {h.friend}
                        {h.date ? ` · joined ${formatDate(h.date)}` : ""}
                      </p>
                      {h.status === "paid" ? (
                        <span className="shrink-0 rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-700">
                          +{h.points} paid
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
                          Pending
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              <p className="mt-4 text-xs text-gray-400">
                A referral is paid once your friend, a new YOMICO customer, verifies their email. There is no limit on how
                many friends you can refer.
              </p>
            </div>

            {data.yourSignup.referred && (
              <div className="bg-white rounded-3xl shadow p-6 text-sm text-gray-700">
                You joined with a referral code —{" "}
                {data.yourSignup.status === "paid"
                  ? `your ${data.bonuses.welcome}-point welcome bonus has been paid.`
                  : data.yourSignup.status === "pending"
                  ? `your ${data.bonuses.welcome}-point welcome bonus is paid once your email is verified.`
                  : "no welcome bonus applied to that code."}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  );
}
