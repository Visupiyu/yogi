"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The wallet analytics charts summed the reward history in the browser (the
// same calculation that showed a wrong balance). The Reward Wallet
// (/profile/wallet) now shows the authoritative balance, pending points and
// the signed history, so this page redirects there — the same way
// /profile/rewards already does.
export default function WalletAnalyticsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile/wallet");
  }, [router]);

  return null;
}
