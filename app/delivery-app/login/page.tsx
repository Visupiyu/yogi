"use client";

// Delivery Person App login (2B-6B-1). NEW delivery engine — NOT the legacy
// /delivery-login (which checks the old deliveryPartners model). Firebase
// email/password sign-in, then the server confirms role === "person" via
// /api/delivery/whoami. Role/provider/person identity is never trusted from the
// client. Sign-in / authorization logic is UNCHANGED; this page is presentation
// + the approved Show/Hide password and neutral Forgot-password reset only.
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { sendPasswordResetEmail, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DeliveryAppLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/delivery/whoami", { headers: { Authorization: `Bearer ${idToken}` } });
      const data = await res.json();
      if (!res.ok || data?.role !== "person") {
        await signOut(auth);
        setError("This account is not a YOMICO delivery person.");
        return;
      }
      router.replace("/delivery-app");
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      setError(code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
        ? "Invalid email or password."
        : "Could not sign in. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  // Neutral reset: after an attempt it ALWAYS shows the same message regardless
  // of success or failure, so it never reveals whether an account exists.
  const resetPassword = async () => {
    if (resetting) return;
    const target = email.trim().toLowerCase();
    setError(null);
    setResetMsg(null);
    if (!target) { setResetMsg("Enter your email above, then tap Forgot password."); return; }
    if (!/^\S+@\S+\.\S+$/.test(target)) { setResetMsg("Enter a valid email address."); return; }
    setResetting(true);
    try {
      await sendPasswordResetEmail(auth, target);
    } catch {
      // Deliberately swallowed — never disclose account existence.
    } finally {
      setResetting(false);
      setResetMsg("If an account exists for that email, a password reset link has been sent.");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-sky-50 to-blue-50 p-4 sm:p-6">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-blue-100 bg-white p-7 shadow-xl shadow-blue-200/40 sm:p-8">
          <div className="mb-6 text-center">
            <span className="inline-block rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-blue-700">
              Delivery Partner
            </span>
            <h1 className="mt-3 text-2xl font-bold text-slate-900">YOMICO Delivery Partner</h1>
            <p className="mt-1 text-sm text-slate-500">Sign in to your delivery account</p>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Email</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-4 py-3 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </label>

            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700">Password</span>
                <button
                  type="button"
                  onClick={resetPassword}
                  disabled={resetting}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
                >
                  {resetting ? "Sending…" : "Forgot password?"}
                </button>
              </div>
              <div className="relative mt-1.5">
                <input
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="Your password"
                  className="w-full rounded-lg border border-slate-300 bg-white px-4 py-3 pr-16 text-base outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-blue-600 hover:text-blue-800"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {resetMsg && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">{resetMsg}</p>}
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

            <button
              type="submit"
              disabled={busy || !email || !password}
              className="w-full rounded-lg bg-blue-600 px-4 py-3 text-base font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-slate-500">
            New delivery partner?{" "}
            <Link href="/delivery-register" className="font-semibold text-blue-600 hover:underline">Register</Link>
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-slate-400">
          <Link href="/" className="hover:text-slate-600">← Back to YOMICO</Link>
        </p>
      </div>
    </div>
  );
}
