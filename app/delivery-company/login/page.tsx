"use client";

// Delivery Company Console login. Uses the EXISTING Firebase email/password auth
// (no second auth system). After sign-in the server confirms role === "company"
// via GET /api/delivery/whoami — company identity is never trusted from the
// client. An already-signed-in company owner is sent straight to the dashboard.
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const HOME = "/delivery-company";

export default function DeliveryCompanyLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // If a company session already exists, skip the form.
  useEffect(() => {
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { if (!cancelled) setChecking(false); return; }
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/delivery/whoami", { headers: { Authorization: `Bearer ${idToken}` } });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.role === "company") { router.replace(HOME); return; }
      } catch { /* fall through to the form */ }
      if (!cancelled) setChecking(false);
    });
    return () => { cancelled = true; unsub(); };
  }, [router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
      const idToken = await cred.user.getIdToken();
      const res = await fetch("/api/delivery/whoami", { headers: { Authorization: `Bearer ${idToken}` } });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.role !== "company") {
        await signOut(auth);
        setError("This account is not an active YOMICO delivery company operator.");
        return;
      }
      router.replace(HOME);
    } catch (err) {
      const code = (err as { code?: string })?.code || "";
      setError(
        code === "auth/invalid-credential" || code === "auth/wrong-password" || code === "auth/user-not-found"
          ? "Invalid email or password."
          : "Could not sign in. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  };

  if (checking) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        Checking access…
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-gray-50 p-6">
      <div className="mb-6 text-center">
        <span className="inline-block rounded bg-teal-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
          Delivery Company
        </span>
        <h1 className="mt-2 text-xl font-semibold">YOMICO Operator Console</h1>
        <p className="text-sm text-gray-500">Sign in to manage your delivery jobs and people</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-gray-600">Email</span>
          <input
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="mt-1 w-full rounded border px-3 py-3 text-base"
          />
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">Password</span>
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="mt-1 w-full rounded border px-3 py-3 text-base"
          />
        </label>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button
          type="submit"
          disabled={busy || !email || !password}
          className="w-full rounded bg-slate-900 px-4 py-3 text-base font-medium text-white disabled:opacity-50"
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
