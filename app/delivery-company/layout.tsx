"use client";

// Delivery Company Web Console — shell + auth guard.
//
// A NEW operator area, separate from Admin (/admin/*), Seller and the Delivery
// Person App (/delivery-app/*). Identity is NEVER trusted from client state:
// after a Firebase session exists we call GET /api/delivery/whoami and require
// role === "company" (the backend resolves the company from the verified uid and
// only an Active company owner resolves to that role). Anyone else is redirected
// to the console login. companyId is never read from the URL/query/localStorage.
import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { sendVerificationEmail } from "@/lib/sendVerificationEmail";
import { CompanyProvider, type CompanyIdentity } from "@/app/delivery-company/_lib/console";

const LOGIN_PATH = "/delivery-company/login";

const NAV: { href: string; label: string; exact?: boolean }[] = [
  { href: "/delivery-company", label: "Dashboard", exact: true },
  { href: "/delivery-company/jobs", label: "Jobs" },
  { href: "/delivery-company/persons", label: "Delivery People" },
];

export default function DeliveryCompanyLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname() || "";
  const isLoginRoute = pathname === LOGIN_PATH;

  const [state, setState] = useState<"checking" | "authorized" | "unauthorized" | "unverified">("checking");
  const [company, setCompany] = useState<CompanyIdentity | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string>("");

  useEffect(() => {
    if (isLoginRoute) return; // login renders without the guard
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { if (!cancelled) router.replace(LOGIN_PATH); return; }
      try {
        // Refresh the auth state/token first so a just-verified email is
        // reflected immediately (mirrors the Admin layout). Best-effort — a
        // refresh failure falls through to the cached state, still fail-closed
        // below on the emailVerified check.
        try { await user.getIdToken(true); await user.reload(); } catch { /* use cached */ }

        const idToken = await user.getIdToken();
        const res = await fetch("/api/delivery/whoami", { headers: { Authorization: `Bearer ${idToken}` } });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok && data?.role === "company" && data?.companyId) {
          // A delivery-company owner is a privileged business actor: require a
          // verified login email before entering the console (matches the
          // seller/admin bar). This is a console-access gate only — it does not
          // touch resolveDeliveryActor or any API.
          if (!user.emailVerified) {
            setPendingEmail(user.email || "");
            setState("unverified");
            return;
          }
          setCompany({
            companyId: String(data.companyId),
            companyName: typeof data?.company?.name === "string" && data.company.name ? data.company.name : "Delivery Company",
          });
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

  // Company owner signed in but their login email is not verified — hold them
  // at a console-branded verification screen instead of the customer banner.
  if (state === "unverified") {
    return <CompanyVerificationScreen email={pendingEmail} />;
  }

  if (state !== "authorized" || !company) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 text-sm text-gray-500">
        Checking access…
      </div>
    );
  }

  const logout = async () => {
    try { await signOut(auth); } finally { window.location.href = LOGIN_PATH; }
  };

  const isActive = (item: { href: string; exact?: boolean }) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(item.href + "/");

  return (
    <CompanyProvider value={company}>
      <div className="min-h-screen bg-gray-50">
        {/* Brand header — teal accent clearly distinguishes the operator console
            from the black Admin / Delivery App headers. */}
        <header className="sticky top-0 z-20 border-b border-teal-900 bg-slate-900 text-white">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3">
              <span className="rounded bg-teal-500/20 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-300">
                Delivery Company
              </span>
              <div className="leading-tight">
                <p className="text-sm font-semibold">YOMICO Operator Console</p>
                <p className="text-[11px] text-white/60">{company.companyName}</p>
              </div>
            </div>
            <button
              onClick={logout}
              className="rounded bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
            >
              Log out
            </button>
          </div>
          {/* Nav */}
          <nav className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-2">
            {NAV.map((item) => {
              const active = isActive(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "border-teal-400 text-white"
                      : "border-transparent text-white/60 hover:text-white"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto max-w-6xl p-4 md:p-6">{children}</main>
      </div>
    </CompanyProvider>
  );
}

// Console-branded email-verification gate for a company owner whose login email
// is not yet verified. Renders INSTEAD of the console (no customer chrome, no
// customer banner). Resend uses the same branded email endpoint as the rest of
// the app; "I've verified" re-checks and, on success, reloads so the guard
// re-runs and admits them.
function CompanyVerificationScreen({ email }: { email: string }) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resend = async () => {
    const user = auth.currentUser;
    if (!user || sending) return;
    setSending(true);
    setError(null);
    try {
      await sendVerificationEmail(user);
      setSent(true);
    } catch {
      setError("Couldn't send the email right now. Please try again shortly.");
    } finally {
      setSending(false);
    }
  };

  const recheck = async () => {
    const user = auth.currentUser;
    if (!user || checking) return;
    setChecking(true);
    setError(null);
    try {
      await user.reload();
      if (user.emailVerified) {
        window.location.reload(); // re-run the guard → console
        return;
      }
      setError("Your email still looks unverified. Open the link in the email, then try again.");
    } catch {
      setError("Couldn't check your status right now. Please try again.");
    } finally {
      setChecking(false);
    }
  };

  const logout = async () => {
    try { await signOut(auth); } finally { window.location.href = LOGIN_PATH; }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span className="rounded bg-teal-500/15 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-700">
            Delivery Company
          </span>
          <span className="text-sm font-semibold text-slate-800">YOMICO Operator Console</span>
        </div>

        <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-2xl">📧</div>
        <h1 className="text-xl font-bold text-slate-900">Verify your email to continue</h1>
        <p className="mt-2 text-sm text-slate-600">
          For your company&apos;s security, the authorised person&apos;s login email must be verified before you can
          access the Delivery Company Console.
        </p>
        {email ? (
          <p className="mt-2 text-sm text-slate-700">
            We sent a verification link to <span className="font-semibold">{email}</span>. Open it, then choose
            &ldquo;I&apos;ve verified&rdquo; below.
          </p>
        ) : null}

        {sent ? (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-800">
            Verification email sent — check your inbox (and spam).
          </p>
        ) : null}
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        <div className="mt-6 space-y-2">
          <button
            onClick={recheck}
            disabled={checking}
            className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {checking ? "Checking…" : "I've verified — continue"}
          </button>
          <button
            onClick={resend}
            disabled={sending}
            className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Resend verification email"}
          </button>
          <button
            onClick={logout}
            className="w-full rounded-xl px-4 py-3 text-sm font-medium text-slate-500 hover:text-slate-800"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
