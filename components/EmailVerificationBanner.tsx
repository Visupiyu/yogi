"use client";

import { useEffect, useState } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { sendVerificationEmail } from "@/lib/sendVerificationEmail";
import { toast } from "sonner";

// Non-blocking reminder for customers with an unverified email —
// verification is enforced for Admin/Seller, but customers keep full
// access; this is just a nudge, dismissible per-account so it doesn't
// nag every page load once seen.
export default function EmailVerificationBanner() {
  const [user, setUser] = useState<User | null>(null);
  const [dismissed, setDismissed] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setDismissed(
          localStorage.getItem(`emailVerifyDismissed_${firebaseUser.uid}`) === "1"
        );
      }
    });
    return () => unsub();
  }, []);

  if (!user || user.emailVerified || dismissed) return null;

  const dismiss = () => {
    localStorage.setItem(`emailVerifyDismissed_${user.uid}`, "1");
    setDismissed(true);
  };

  const resend = async () => {
    setSending(true);
    try {
      // Goes through the same server endpoint as signup, so the customer gets
      // the branded YOMICO email rather than Firebase's default — one system,
      // not two.
      await sendVerificationEmail(user);
      toast.success("Verification email sent — check your inbox.");
    } catch (error) {
      console.error(error);
      toast.error("Couldn't send the email right now. Please try again later.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="bg-amber-50 border-b border-amber-200 text-amber-800 text-sm">
      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-center gap-3 flex-wrap text-center">
        <span>📧 Please verify your email address to secure your account.</span>
        <button
          onClick={resend}
          disabled={sending}
          className="font-semibold underline hover:text-amber-900 disabled:opacity-60"
        >
          {sending ? "Sending…" : "Resend email"}
        </button>
        <button onClick={dismiss} className="text-amber-600 hover:text-amber-900" aria-label="Dismiss">
          ✕
        </button>
      </div>
    </div>
  );
}
