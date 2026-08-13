"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// This page used to duplicate app/profile/wallet/page.tsx's reward-points
// history with its own, buggier implementation (stale localStorage
// balance, and "Refund"/"Referral Bonus" credits mislabeled as red
// deductions). Rather than maintain two copies of the same feature that
// can drift apart, redirect here to the correct one.
export default function RewardsRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/profile/wallet");
  }, [router]);

  return null;
}
