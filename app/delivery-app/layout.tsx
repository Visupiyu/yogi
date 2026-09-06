"use client";

// Delivery Person App shell + auth guard (2B-6B-1).
//
// A NEW delivery-engine app, separate from the legacy /delivery pages. Identity
// is never trusted from client state: after a Firebase session exists, we call
// GET /api/delivery/whoami and require role === "person" (the backend resolves
// the person from the verified uid). Anyone else is redirected to login.
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

const LOGIN_PATH = "/delivery-app/login";

export default function DeliveryAppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const isLoginRoute = pathname === LOGIN_PATH;
  const [state, setState] = useState<"checking" | "authorized" | "unauthorized">("checking");
  const [personName, setPersonName] = useState<string>("");

  useEffect(() => {
    if (isLoginRoute) return; // the login page renders without the guard
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { if (!cancelled) router.replace(LOGIN_PATH); return; }
      try {
        const idToken = await user.getIdToken();
        const res = await fetch("/api/delivery/whoami", { headers: { Authorization: `Bearer ${idToken}` } });
        const data = await res.json();
        if (cancelled) return;
        if (res.ok && data?.role === "person") {
          setPersonName(typeof data?.person?.name === "string" ? data.person.name : "");
          setState("authorized");
        } else {
          setState("unauthorized");
          router.replace(LOGIN_PATH);
        }
      } catch {
        if (!cancelled) { setState("unauthorized"); router.replace(LOGIN_PATH); }
      }
    });
    return () => { cancelled = true; unsub(); };
  }, [router, isLoginRoute]);

  if (isLoginRoute) return <>{children}</>;

  if (state !== "authorized") {
    return <div className="flex min-h-screen items-center justify-center bg-gray-50 text-gray-500">Checking access…</div>;
  }

  const logout = async () => { await signOut(auth); window.location.href = LOGIN_PATH; };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-gray-50">
      <header className="sticky top-0 z-20 flex items-center justify-between bg-black px-4 py-3 text-white">
        <div>
          <p className="text-sm font-semibold leading-tight">YOMICO Delivery</p>
          {personName ? <p className="text-[11px] text-white/70 leading-tight">{personName}</p> : null}
        </div>
        <button onClick={logout} className="rounded bg-white/15 px-3 py-1.5 text-xs">Log out</button>
      </header>
      <main className="flex-1 p-4">{children}</main>
    </div>
  );
}
