"use client";

// Admin — Onboard & manage YOMICO delivery persons (2B-6B-1.5).
//
// A NEW delivery-engine admin screen (namespace /admin/delivery/*). It provisions
// a delivery person so they can sign in at /delivery-app/login:
//   1. create the Firebase Auth account on a SEPARATE "Secondary" app instance
//      (getSecondaryAuth) so the admin's own primary session is never touched,
//   2. sign the secondary app out immediately,
//   3. register the person through the existing POST /api/delivery/admin/persons
//      (which SERVER-OWNS providerType:"YOMICO" and companyId:null — the client
//      cannot forge those),
//   4. either send a password-reset email (default; the person sets their own
//      secret) or use an admin-set temporary password shown once.
//
// SECURITY: the password is created only in the browser, is NEVER sent to any API
// route, NEVER written to Firestore, NEVER logged, and NEVER placed in
// URL/localStorage/sessionStorage. The generated throwaway password (reset mode)
// is never displayed. Auth UIDs are never rendered. Legacy deliveryPartners is
// untouched. This page performs no direct Firestore writes.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
} from "firebase/auth";
import { auth, getSecondaryAuth } from "@/lib/firebase";

// ---- Bearer-auth fetch (same convention as the Control Tower) ----
async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const idToken = await user.getIdToken();
  return fetch(path, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      Authorization: `Bearer ${idToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
  });
}

// Strong throwaway password for reset-email mode. Never displayed, never stored.
// Guarantees one of each character class so Firebase always accepts it.
function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%^&*-_";
  const all = upper + lower + digit + sym;
  const pick = (set: string) =>
    set[crypto.getRandomValues(new Uint8Array(1))[0] % set.length];
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < bytes.length; i++) body += all[bytes[i] % all.length];
  return (pick(upper) + pick(lower) + pick(digit) + pick(sym) + body).slice(0, 24);
}

// The admin list is an explicit allow-list from buildAdminPersonRow. `uid` is
// present in the payload but is intentionally NOT rendered anywhere below.
type PersonRow = {
  personId: string;
  name?: string;
  phone?: string;
  email?: string;
  vehicleType?: string;
  vehicleNumber?: string;
  serviceArea?: string;
  city?: string;
  accountStatus?: string;
  availability?: string;
};

type CredMode = "reset" | "temp";

type Outcome =
  | { kind: "success-reset"; name: string; email: string; resetEmailSent: boolean }
  | { kind: "success-temp"; name: string; email: string; tempPassword: string }
  | { kind: "partial"; email: string }
  | null;

const LOGIN_URL = "/delivery-app/login";

export default function AdminDeliveryPersonsPage() {
  // ---- Add form ----
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [vehicleType, setVehicleType] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [serviceArea, setServiceArea] = useState("");
  const [city, setCity] = useState("");
  const [credMode, setCredMode] = useState<CredMode>("reset");
  const [tempPassword, setTempPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false); // synchronous double-submit guard
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);

  const [resending, setResending] = useState(false);
  const [resendError, setResendError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ---- List ----
  const [persons, setPersons] = useState<PersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadPersons = useCallback(async () => {
    setListError(null);
    try {
      const res = await authedFetch("/api/delivery/admin/persons");
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setListError("You are not authorized. Please sign in as an admin again.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Could not load delivery persons.");
      setPersons(Array.isArray(data.persons) ? data.persons : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load delivery persons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadPersons(); }, [loadPersons]);

  const resetFormFields = () => {
    setName(""); setPhone(""); setEmail("");
    setVehicleType(""); setVehicleNumber(""); setServiceArea(""); setCity("");
    setTempPassword("");
  };

  const dismissOutcome = () => {
    // Drop any once-shown temporary password from state as soon as we leave the
    // success view.
    setOutcome(null);
    setResendError(null);
    setCopied(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setFormError(null);

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanPhone || !cleanEmail) {
      setFormError("Name, phone and email are required.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) {
      setFormError("Enter a valid email address.");
      return;
    }
    if (credMode === "temp" && tempPassword.length < 8) {
      setFormError("Temporary password must be at least 8 characters.");
      return;
    }

    inFlightRef.current = true;
    setSubmitting(true);
    const secondaryAuth = getSecondaryAuth();
    // Local only — never logged, never sent to any API, never persisted.
    const password = credMode === "temp" ? tempPassword : generateStrongPassword();

    try {
      // 1. Create the Auth account on the SECONDARY app (primary admin session
      //    is never disturbed).
      let uid = "";
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
        uid = cred.user.uid;
      } catch (err) {
        const code = (err as { code?: string })?.code || "";
        if (code === "auth/email-already-in-use") {
          setFormError(
            "An account with this email already exists. Provisioning was not started — an existing account is never overwritten. Use a different email, or reconcile the existing account manually.",
          );
        } else if (code === "auth/invalid-email") {
          setFormError("Enter a valid email address.");
        } else if (code === "auth/weak-password") {
          setFormError("The temporary password is too weak. Use at least 8 characters.");
        } else {
          setFormError("Could not create the login account. Please try again.");
        }
        return; // no person record is created; finally cleans up
      }

      // 2. Sign the secondary app out immediately.
      try { await signOut(secondaryAuth); } catch { /* non-fatal */ }

      // 3. Register the delivery person through the existing admin API. The body
      //    carries NO password and NO providerType/companyId — those are
      //    server-owned (POST forces providerType:"YOMICO", companyId:null).
      try {
        const res = await authedFetch("/api/delivery/admin/persons", {
          method: "POST",
          body: JSON.stringify({
            uid,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            vehicleType: vehicleType.trim(),
            vehicleNumber: vehicleNumber.trim(),
            serviceArea: serviceArea.trim(),
            city: city.trim(),
          }),
        });
        if (!res.ok) {
          // Auth account exists but the person record did not persist. Do not
          // retry Auth creation, do not overwrite, do not claim success.
          setOutcome({ kind: "partial", email: cleanEmail });
          return;
        }
      } catch {
        setOutcome({ kind: "partial", email: cleanEmail });
        return;
      }

      // 4. Success. Establish the credential per the chosen mode.
      if (credMode === "temp") {
        setOutcome({ kind: "success-temp", name: cleanName, email: cleanEmail, tempPassword: password });
      } else {
        let sent = false;
        try {
          await sendPasswordResetEmail(secondaryAuth, cleanEmail);
          sent = true;
        } catch {
          sent = false; // person exists; reset email is retryable below
        }
        setOutcome({ kind: "success-reset", name: cleanName, email: cleanEmail, resetEmailSent: sent });
      }
      resetFormFields();
      void loadPersons();
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const resendReset = async (toEmail: string) => {
    if (resending) return;
    setResending(true);
    setResendError(null);
    try {
      await sendPasswordResetEmail(getSecondaryAuth(), toEmail);
      setOutcome((o) => (o && o.kind === "success-reset" ? { ...o, resetEmailSent: true } : o));
    } catch {
      setResendError("Could not send the reset email. Please try again.");
    } finally {
      setResending(false);
    }
  };

  const copyTempPassword = async (pw: string) => {
    try {
      await navigator.clipboard.writeText(pw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const patchPerson = async (personId: string, body: Record<string, string>) => {
    if (rowBusy) return;
    setRowBusy(personId);
    setListError(null);
    try {
      const res = await authedFetch(`/api/delivery/admin/persons/${encodeURIComponent(personId)}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setListError(d?.error || "Could not update this delivery person.");
      } else {
        await loadPersons();
      }
    } catch {
      setListError("Could not update this delivery person.");
    } finally {
      setRowBusy(null);
    }
  };

  const inputCls = "mt-1 w-full rounded border px-3 py-2 text-sm";

  return (
    <div className="mx-auto max-w-5xl p-4 md:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold">🛵 Delivery Persons</h1>
        <p className="mt-1 text-sm text-gray-500">
          Onboard and manage YOMICO delivery persons. They sign in at{" "}
          <code className="rounded bg-gray-100 px-1">{LOGIN_URL}</code>.
        </p>
      </header>

      {/* ================= SECTION 1 — Add delivery person ================= */}
      <section className="mb-8 rounded-xl border bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold">Add delivery person</h2>

        {outcome ? (
          <OutcomeView
            outcome={outcome}
            resending={resending}
            resendError={resendError}
            copied={copied}
            onResend={resendReset}
            onCopy={copyTempPassword}
            onDismiss={dismissOutcome}
          />
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm text-gray-600">Name<span className="text-red-500">*</span></span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Phone<span className="text-red-500">*</span></span>
                <input className={inputCls} value={phone} onChange={(e) => setPhone(e.target.value)} required inputMode="tel" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-gray-600">Email<span className="text-red-500">*</span></span>
                <input className={inputCls} type="email" autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Vehicle type</span>
                <input className={inputCls} value={vehicleType} onChange={(e) => setVehicleType(e.target.value)} placeholder="e.g. Bike" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Vehicle number</span>
                <input className={inputCls} value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Service area</span>
                <input className={inputCls} value={serviceArea} onChange={(e) => setServiceArea(e.target.value)} />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">City</span>
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} />
              </label>
            </div>

            {/* Credential mode */}
            <fieldset className="rounded-lg border p-3">
              <legend className="px-1 text-sm font-medium text-gray-700">Credential</legend>
              <div className="space-y-2">
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="credMode" className="mt-1" checked={credMode === "reset"} onChange={() => setCredMode("reset")} />
                  <span>
                    <span className="font-medium">Send password reset email</span>{" "}
                    <span className="text-gray-500">(recommended — the person sets their own password)</span>
                  </span>
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="radio" name="credMode" className="mt-1" checked={credMode === "temp"} onChange={() => setCredMode("temp")} />
                  <span>
                    <span className="font-medium">Set temporary password</span>{" "}
                    <span className="text-gray-500">(shown once — share it securely)</span>
                  </span>
                </label>
                {credMode === "temp" && (
                  <label className="block pl-6">
                    <span className="text-sm text-gray-600">Temporary password (min 8 characters)</span>
                    <input
                      className={inputCls}
                      type="text"
                      autoComplete="off"
                      value={tempPassword}
                      onChange={(e) => setTempPassword(e.target.value)}
                      placeholder="Enter a temporary password"
                    />
                  </label>
                )}
              </div>
            </fieldset>

            {formError && (
              <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="rounded bg-black px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
            >
              {submitting ? "Onboarding…" : "Onboard delivery person"}
            </button>
          </form>
        )}
      </section>

      {/* ================= SECTION 2 — Existing persons ================= */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">YOMICO delivery persons</h2>
          <button
            onClick={() => { setLoading(true); void loadPersons(); }}
            disabled={loading}
            className="rounded border px-3 py-1.5 text-sm disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {listError && (
          <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</p>
        )}

        {loading ? (
          <div className="rounded border bg-gray-50 p-8 text-center text-gray-500">Loading…</div>
        ) : persons.length === 0 ? (
          <div className="rounded border bg-gray-50 p-8 text-center text-gray-500">
            No delivery persons yet. Add one above.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {persons.map((p) => (
              <PersonCard
                key={p.personId}
                person={p}
                busy={rowBusy === p.personId}
                disabled={rowBusy !== null && rowBusy !== p.personId}
                onPatch={patchPerson}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ---- Success / partial-failure view ----
function OutcomeView({
  outcome,
  resending,
  resendError,
  copied,
  onResend,
  onCopy,
  onDismiss,
}: {
  outcome: NonNullable<Outcome>;
  resending: boolean;
  resendError: string | null;
  copied: boolean;
  onResend: (email: string) => void;
  onCopy: (pw: string) => void;
  onDismiss: () => void;
}) {
  if (outcome.kind === "partial") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-900">Provisioning incomplete</h3>
        <p className="mt-2 text-sm text-amber-800">
          The login account for <span className="font-medium">{outcome.email}</span> was created, but the
          delivery-person record could not be saved. This account is <span className="font-medium">not</span> a
          working delivery person yet and needs administrative reconciliation.
        </p>
        <p className="mt-2 text-sm text-amber-800">
          Do not re-submit the same email — that will report the account already exists. No account was overwritten.
        </p>
        <button onClick={onDismiss} className="mt-3 rounded border border-amber-400 px-3 py-1.5 text-sm text-amber-900">
          Back to form
        </button>
      </div>
    );
  }

  const emailSentLine =
    outcome.kind === "success-reset"
      ? outcome.resetEmailSent
        ? "A password-reset email was sent — the person sets their own password from that link."
        : "The account was created, but the password-reset email could not be sent. You can resend it below."
      : "A temporary password was set (shown once below).";

  return (
    <div className="rounded-lg border border-green-300 bg-green-50 p-4">
      <h3 className="font-semibold text-green-900">Delivery person onboarded</h3>
      <dl className="mt-2 space-y-1 text-sm text-green-900">
        <div><span className="text-green-700">Name:</span> <span className="font-medium">{outcome.name}</span></div>
        <div><span className="text-green-700">Email:</span> <span className="font-medium">{outcome.email}</span></div>
        <div className="text-green-800">{emailSentLine}</div>
      </dl>

      {outcome.kind === "success-reset" && !outcome.resetEmailSent && (
        <div className="mt-3">
          <button
            onClick={() => onResend(outcome.email)}
            disabled={resending}
            className="rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {resending ? "Sending…" : "Resend reset email"}
          </button>
          {resendError && <p className="mt-2 text-sm text-red-700">{resendError}</p>}
        </div>
      )}

      {outcome.kind === "success-temp" && (
        <div className="mt-3 rounded border border-green-400 bg-white p-3">
          <p className="text-xs font-medium text-gray-600">Temporary password (shown once)</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-gray-100 px-2 py-1 text-sm">{outcome.tempPassword}</code>
            <button
              onClick={() => onCopy(outcome.tempPassword)}
              className="shrink-0 rounded border px-3 py-1.5 text-sm"
            >
              {copied ? "Copied" : "Copy"}
            </button>
          </div>
          <p className="mt-2 text-xs text-amber-700">
            ⚠ Share this only through a secure channel. It will not be shown again after you leave this screen.
          </p>
        </div>
      )}

      <p className="mt-3 text-sm text-green-800">
        Next step: the delivery person signs in at{" "}
        <code className="rounded bg-white px-1">{LOGIN_URL}</code>.
      </p>

      <button onClick={onDismiss} className="mt-3 rounded border border-green-400 px-3 py-1.5 text-sm text-green-900">
        Add another
      </button>
    </div>
  );
}

// ---- One person row ----
function PersonCard({
  person,
  busy,
  disabled,
  onPatch,
}: {
  person: PersonRow;
  busy: boolean;
  disabled: boolean;
  onPatch: (personId: string, body: Record<string, string>) => void;
}) {
  const active = (person.accountStatus || "Active") === "Active";
  const availability = person.availability || "Offline";
  const vehicle = [person.vehicleType, person.vehicleNumber].filter(Boolean).join(" · ") || "—";
  const location = [person.serviceArea, person.city].filter(Boolean).join(" · ") || "—";
  const blocked = busy || disabled;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium">{person.name || "—"}</p>
          <p className="truncate text-sm text-gray-500">{person.email || "—"}</p>
          <p className="text-sm text-gray-500">{person.phone || "—"}</p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${active ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
            {active ? "Active" : "Suspended"}
          </span>
          <span className={`rounded px-2 py-0.5 text-xs font-medium ${
            availability === "Available" ? "bg-blue-100 text-blue-800"
              : availability === "Busy" ? "bg-amber-100 text-amber-800"
              : "bg-gray-100 text-gray-700"
          }`}>
            {availability}
          </span>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1 text-xs text-gray-600">
        <div><span className="text-gray-400">Vehicle</span> {vehicle}</div>
        <div><span className="text-gray-400">Area/City</span> {location}</div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {active ? (
          <button onClick={() => onPatch(person.personId, { accountStatus: "Suspended" })} disabled={blocked}
            className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 disabled:opacity-50">
            Suspend
          </button>
        ) : (
          <button onClick={() => onPatch(person.personId, { accountStatus: "Active" })} disabled={blocked}
            className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 disabled:opacity-50">
            Activate
          </button>
        )}
        {availability === "Available" ? (
          <button onClick={() => onPatch(person.personId, { availability: "Offline" })} disabled={blocked}
            className="rounded border px-2.5 py-1 text-xs disabled:opacity-50">
            Set Offline
          </button>
        ) : (
          <button onClick={() => onPatch(person.personId, { availability: "Available" })} disabled={blocked}
            className="rounded border px-2.5 py-1 text-xs disabled:opacity-50">
            Set Available
          </button>
        )}
        {busy && <span className="text-xs text-gray-400">Updating…</span>}
      </div>
    </div>
  );
}
