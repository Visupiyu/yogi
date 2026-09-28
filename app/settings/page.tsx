"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { sendVerificationEmail } from "@/lib/sendVerificationEmail";
import {
  cancelAccountDeletion,
  fetchAccountSummary,
  fetchDeletionRequest,
  formatDate,
  requestAccountDeletion,
  type AccountSummary,
  type DeletionRequestView,
} from "@/lib/account/accountClient";

// Account & Security. Everything shown comes from the server
// (app/api/account/summary, app/api/account/deletion-request) — this page no
// longer reads orders, addresses or reviews from Firestore.
//
//   - Email verification status, with a resend (the branded verification
//     email, app/api/auth/send-verification-email).
//   - Change password: Firebase emails a reset link to the signed-in address;
//     YOMICO never sees or handles the password.
//   - Notifications: no preference toggles. The old ones were never read by
//     any sender, so they changed nothing; order, delivery, return and refund
//     updates are always sent in-app and YOMICO sends no promotions.
//   - Account deletion is a REQUEST that an admin processes by hand. Nothing
//     is deleted or blocked automatically.

const DELETION_RETAINED = [
  "Orders, invoices and GST records",
  "Payments, refunds and settlement records",
  "Reward points and referral records",
];

export default function SettingsPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [deletion, setDeletion] = useState<{ request: DeletionRequestView | null; canRequest: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [showDeletionForm, setShowDeletionForm] = useState(false);
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);

  const load = useCallback(async () => {
    const [s, d] = await Promise.all([fetchAccountSummary(), fetchDeletionRequest()]);
    if (s.data) setSummary(s.data);
    if (d.data) setDeletion(d.data);
    try {
      setWishlistCount(JSON.parse(localStorage.getItem("wishlist") || "[]").length || 0);
    } catch {
      setWishlistCount(0);
    }
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

  const email = summary?.profile.email || auth.currentUser?.email || "";
  const verified = summary?.profile.emailVerified ?? auth.currentUser?.emailVerified ?? false;

  const resendVerification = async () => {
    const user = auth.currentUser;
    if (!user) return;
    setBusy("verify");
    setNotice(null);
    try {
      await sendVerificationEmail(user);
      setNotice({ kind: "ok", text: `Verification email sent to ${user.email}. Check your inbox.` });
    } catch {
      setNotice({ kind: "error", text: "Couldn't send the verification email right now. Please try again later." });
    } finally {
      setBusy(null);
    }
  };

  const sendPasswordReset = async () => {
    const user = auth.currentUser;
    if (!user?.email) return;
    setBusy("password");
    setNotice(null);
    try {
      // Firebase sends the reset link to the SIGNED-IN account's own address;
      // the new password is set on Firebase's page, never through YOMICO.
      await sendPasswordResetEmail(auth, user.email);
      setNotice({ kind: "ok", text: `We've emailed a password reset link to ${user.email}.` });
    } catch {
      setNotice({ kind: "error", text: "Couldn't send the reset email right now. Please try again later." });
    } finally {
      setBusy(null);
    }
  };

  const submitDeletion = async () => {
    if (!confirmed) return;
    setBusy("delete");
    setNotice(null);
    const result = await requestAccountDeletion(reason.trim());
    setBusy(null);
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setShowDeletionForm(false);
    setReason("");
    setConfirmed(false);
    setNotice({ kind: "ok", text: "Your account deletion request has been sent. YOMICO will review it." });
    load();
  };

  const cancelDeletion = async () => {
    if (!confirm("Withdraw your account deletion request?")) return;
    setBusy("cancel");
    setNotice(null);
    const result = await cancelAccountDeletion();
    setBusy(null);
    if (result.error) {
      setNotice({ kind: "error", text: result.error });
      return;
    }
    setNotice({ kind: "ok", text: "Your account deletion request has been withdrawn." });
    load();
  };

  const logout = async () => {
    if (!confirm("Logout from your account?")) return;
    await signOut(auth);
    localStorage.removeItem("user");
    localStorage.removeItem("vendor");
    localStorage.removeItem("admin");
    // Both are plain device-wide localStorage keys with no account
    // scoping — left uncleared, the next person to log in on a shared
    // device would inherit this account's cart and saved products.
    localStorage.removeItem("cart");
    localStorage.removeItem("checkoutItems");
    localStorage.removeItem("wishlist");
    window.dispatchEvent(new Event("cartUpdated"));
    window.dispatchEvent(new Event("wishlistUpdated"));
    router.push("/login");
  };

  const req = deletion?.request || null;

  const row = (href: string, icon: string, title: string, desc: string) => (
    <Link
      key={href + title}
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border p-4 hover:bg-gray-50 transition"
    >
      <span className="flex items-center gap-3 min-w-0">
        <span className="text-2xl">{icon}</span>
        <span className="min-w-0">
          <span className="block font-semibold">{title}</span>
          <span className="block text-sm text-gray-500">{desc}</span>
        </span>
      </span>
      <span className="text-gray-400">›</span>
    </Link>
  );

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <Link href="/profile" className="inline-flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900">
          ← Back to Profile
        </Link>

        <div className="bg-gradient-to-r from-gray-800 to-gray-600 text-white rounded-3xl p-8">
          <h1 className="text-4xl font-bold">Account & Security</h1>
          <p className="mt-2 opacity-90">Manage your sign-in, security and account.</p>
        </div>

        {notice && (
          <div className={`rounded-2xl p-4 ${notice.kind === "ok" ? "bg-green-50 text-green-800" : "bg-red-50 text-red-700"}`}>
            {notice.text}
          </div>
        )}

        {/* ACCOUNT OVERVIEW */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: "Orders", value: summary?.orders.total ?? 0, href: "/orders" },
            { label: "Wishlist", value: wishlistCount, href: "/wishlist" },
            { label: "Addresses", value: summary?.addresses.saved ?? 0, href: "/addresses" },
            { label: "Unread", value: summary?.notifications.unread ?? 0, href: "/notifications" },
          ].map((s) => (
            <Link key={s.label} href={s.href} className="bg-white rounded-2xl shadow p-5 text-center">
              <p className="text-sm text-gray-500">{s.label}</p>
              <p className="mt-1 text-3xl font-bold">{s.value}</p>
            </Link>
          ))}
        </div>

        {/* SIGN-IN & SECURITY */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-4">
          <h2 className="text-xl font-bold">🔐 Sign-in & security</h2>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4">
            <div className="min-w-0">
              <p className="font-semibold">Email</p>
              <p className="text-sm text-gray-600 break-all">{email || "—"}</p>
              <span
                className={`mt-1 inline-block rounded-full px-3 py-0.5 text-xs font-semibold ${
                  verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-800"
                }`}
              >
                {verified ? "✓ Verified" : "Not verified"}
              </span>
            </div>
            {!verified && (
              <button
                onClick={resendVerification}
                disabled={busy === "verify"}
                className="shrink-0 rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy === "verify" ? "Sending…" : "Resend verification email"}
              </button>
            )}
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4">
            <div>
              <p className="font-semibold">Password</p>
              <p className="text-sm text-gray-600">We&apos;ll email a secure link to change your password.</p>
            </div>
            <button
              onClick={sendPasswordReset}
              disabled={busy === "password"}
              className="shrink-0 rounded-xl border px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
            >
              {busy === "password" ? "Sending…" : "Email me a reset link"}
            </button>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl border p-4">
            <div>
              <p className="font-semibold">Sign out</p>
              <p className="text-sm text-gray-600">Sign out of YOMICO on this device.</p>
            </div>
            <button onClick={logout} className="shrink-0 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white">
              🚪 Logout
            </button>
          </div>
        </div>

        {/* NOTIFICATIONS — no toggles: none were ever honoured */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-3">
          <h2 className="text-xl font-bold">🔔 Notifications</h2>
          <p className="text-sm text-gray-600">
            Order, delivery, return and refund updates are always sent in-app. YOMICO doesn&apos;t send promotional
            notifications.
          </p>
          {row("/notifications", "🔔", "Notification centre", "See and manage your notifications")}
        </div>

        {/* SHOPPING */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-3">
          <h2 className="text-xl font-bold">🛍 Shopping</h2>
          {row("/profile", "👤", "My Profile", "Name, mobile number and account overview")}
          {row("/orders", "📦", "My Orders", "Track all your purchases")}
          {row("/profile/refunds", "↩️", "Returns & Refunds", "Track returns, pickups and refunds")}
          {row("/addresses", "📍", "Saved Addresses", "Manage delivery addresses")}
          {row("/profile/tickets", "🎫", "Support Tickets", "View your requests and replies")}
        </div>

        {/* PREFERENCES (informational) */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-2">
          <h2 className="text-xl font-bold">⚙️ Preferences</h2>
          <div className="flex justify-between border-b py-2 text-sm">
            <span>Language</span>
            <span className="text-gray-600">English</span>
          </div>
          <div className="flex justify-between border-b py-2 text-sm">
            <span>Currency</span>
            <span className="text-gray-600">₹ INR</span>
          </div>
          <div className="flex justify-between py-2 text-sm">
            <span>Dark mode</span>
            <span className="text-gray-600">Coming soon</span>
          </div>
        </div>

        {/* PRIVACY & LEGAL */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-3">
          <h2 className="text-xl font-bold">📄 Privacy & legal</h2>
          {row("/privacy-policy", "🔐", "Privacy Policy", "Learn how your information is protected")}
          {row("/terms", "📄", "Terms & Conditions", "Read our marketplace terms")}
          {row("/contact", "📞", "Contact Support", "Get help from YOMICO")}
          {row("/about", "ℹ️", "About YOMICO", "Learn about us")}
        </div>

        {/* ACCOUNT DELETION */}
        <div className="bg-white rounded-3xl shadow p-6 space-y-4">
          <h2 className="text-xl font-bold">🗑 Delete account</h2>

          {req && (
            <div className="rounded-2xl border p-4 space-y-1">
              <p className="font-semibold">
                Your request: <span className="text-gray-800">{req.statusLabel}</span>
              </p>
              {req.requestedAt && <p className="text-sm text-gray-500">Requested {formatDate(req.requestedAt)}</p>}
              {req.reason && <p className="text-sm text-gray-600">Reason: {req.reason}</p>}
              {req.messageFromYomico && (
                <p className="text-sm text-gray-800">Message from YOMICO: {req.messageFromYomico}</p>
              )}
              {req.canCancel && (
                <button
                  onClick={cancelDeletion}
                  disabled={busy === "cancel"}
                  className="mt-2 rounded-xl border px-4 py-2 text-sm font-semibold text-gray-800 disabled:opacity-60"
                >
                  {busy === "cancel" ? "Withdrawing…" : "Withdraw request"}
                </button>
              )}
            </div>
          )}

          {deletion?.canRequest && !showDeletionForm && (
            <div className="space-y-2">
              <p className="text-sm text-gray-600">
                You can ask YOMICO to delete your account. Your request is reviewed by our team — nothing is deleted
                automatically.
              </p>
              <button
                onClick={() => setShowDeletionForm(true)}
                className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white"
              >
                Request account deletion
              </button>
            </div>
          )}

          {showDeletionForm && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 space-y-3">
              <p className="text-sm text-gray-800">
                After review, YOMICO will close your account. By law we keep some records even after an account is
                deleted:
              </p>
              <ul className="list-disc pl-5 text-sm text-gray-700">
                {DELETION_RETAINED.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <textarea
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why are you leaving? (optional)"
                className="w-full rounded-xl border p-3 text-sm"
                rows={3}
              />
              <label className="flex items-start gap-2 text-sm text-gray-800">
                <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="mt-1" />
                I understand and want to request deletion of my YOMICO account.
              </label>
              <div className="flex gap-2">
                <button
                  onClick={submitDeletion}
                  disabled={!confirmed || busy === "delete"}
                  className="rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {busy === "delete" ? "Sending…" : "Send deletion request"}
                </button>
                <button
                  onClick={() => setShowDeletionForm(false)}
                  className="rounded-xl border px-4 py-2 text-sm font-semibold text-gray-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
