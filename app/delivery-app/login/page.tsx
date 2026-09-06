"use client";

// Delivery Person App login (2B-6B-1). NEW delivery engine — NOT the legacy
// /delivery-login (which checks the old deliveryPartners model). Firebase
// email/password sign-in, then the server confirms role === "person" via
// /api/delivery/whoami. Role/provider/person identity is never trusted from the
// client.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export default function DeliveryAppLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center bg-gray-50 p-6">
      <div className="mb-6 text-center">
        <h1 className="text-xl font-semibold">YOMICO Delivery</h1>
        <p className="text-sm text-gray-500">Delivery partner sign in</p>
      </div>
      <form onSubmit={submit} className="space-y-4">
        <label className="block">
          <span className="text-sm text-gray-600">Email</span>
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required
            className="mt-1 w-full rounded border px-3 py-3 text-base" />
        </label>
        <label className="block">
          <span className="text-sm text-gray-600">Password</span>
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required
            className="mt-1 w-full rounded border px-3 py-3 text-base" />
        </label>
        {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        <button type="submit" disabled={busy || !email || !password}
          className="w-full rounded bg-black px-4 py-3 text-base font-medium text-white disabled:opacity-50">
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
