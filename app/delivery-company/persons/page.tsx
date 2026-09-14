"use client";

// Delivery Company — Delivery People. Manage ONLY this company's own people via
// the existing company-scoped endpoints:
//   GET/POST /api/delivery/company/persons
//   PATCH    /api/delivery/company/persons/[personId]   (activate / suspend)
//
// providerType / companyId / uid / createdBy are ALL server-owned — the company
// can never create a YOMICO person, change providerType/companyId, or touch
// another company's people (the server enforces this from the verified caller;
// this UI never sends those fields). Availability is NOT settable here — the
// person toggles it themselves in the Delivery App — so it is shown read-only.
//
// SECURITY: the new person's password is created only in the browser on a
// SEPARATE "secondary" Firebase app (so the operator's own session is untouched),
// is NEVER sent to any API, NEVER written to Firestore, NEVER logged, and never
// placed in a URL/localStorage. The reset-mode throwaway password is never shown.
import { useCallback, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { auth, getSecondaryAuth } from "@/lib/firebase";
import { authedFetch, Spinner, type CompanyPerson } from "@/app/delivery-company/_lib/console";

const APP_LOGIN_HINT = "/delivery-app/login";

type CredMode = "reset" | "temp";
type Outcome =
  | { kind: "success-reset"; name: string; email: string; resetEmailSent: boolean }
  | { kind: "success-temp"; name: string; email: string; tempPassword: string }
  | { kind: "partial"; email: string }
  | null;

// Strong throwaway password for reset-email mode. Never displayed, never stored.
function generateStrongPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnopqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%^&*-_";
  const all = upper + lower + digit + sym;
  const pick = (set: string) => set[crypto.getRandomValues(new Uint8Array(1))[0] % set.length];
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  let body = "";
  for (let i = 0; i < bytes.length; i++) body += all[bytes[i] % all.length];
  return (pick(upper) + pick(lower) + pick(digit) + pick(sym) + body).slice(0, 24);
}

export default function DeliveryCompanyPersonsPage() {
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
  const inFlightRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [resending, setResending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [persons, setPersons] = useState<CompanyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadPersons = useCallback(async () => {
    setListError(null);
    try {
      const res = await authedFetch("/api/delivery/company/persons");
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setListError("You are not authorized. Please sign in as a delivery company operator again.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Could not load your delivery people.");
      setPersons(Array.isArray(data.persons) ? data.persons : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load your delivery people.");
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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setFormError(null);

    const cleanName = name.trim();
    const cleanPhone = phone.trim();
    const cleanEmail = email.trim().toLowerCase();
    if (!cleanName || !cleanPhone || !cleanEmail) { setFormError("Name, phone and email are required."); return; }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) { setFormError("Enter a valid email address."); return; }
    if (credMode === "temp" && tempPassword.length < 8) { setFormError("Temporary password must be at least 8 characters."); return; }

    inFlightRef.current = true;
    setSubmitting(true);
    const secondaryAuth = getSecondaryAuth();
    const password = credMode === "temp" ? tempPassword : generateStrongPassword(); // local only

    try {
      // 1. Create the Auth account on the SECONDARY app (operator session untouched).
      let uid = "";
      try {
        const cred = await createUserWithEmailAndPassword(secondaryAuth, cleanEmail, password);
        uid = cred.user.uid;
      } catch (err) {
        const code = (err as { code?: string })?.code || "";
        if (code === "auth/email-already-in-use") {
          setFormError("An account with this email already exists — provisioning was not started and nothing was overwritten. Use a different email.");
        } else if (code === "auth/invalid-email") {
          setFormError("Enter a valid email address.");
        } else if (code === "auth/weak-password") {
          setFormError("The temporary password is too weak. Use at least 8 characters.");
        } else {
          setFormError("Could not create the login account. Please try again.");
        }
        return;
      }

      // 2. Sign the secondary app out immediately.
      try { await signOut(secondaryAuth); } catch { /* non-fatal */ }

      // 3. Register through the company API. Body carries NO password and NO
      //    providerType/companyId — the server forces providerType:"COMPANY" and
      //    companyId from the verified caller.
      try {
        const res = await authedFetch("/api/delivery/company/persons", {
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
        if (!res.ok) { setOutcome({ kind: "partial", email: cleanEmail }); return; }
      } catch {
        setOutcome({ kind: "partial", email: cleanEmail });
        return;
      }

      // 4. Success — establish the credential per the chosen mode.
      if (credMode === "temp") {
        setOutcome({ kind: "success-temp", name: cleanName, email: cleanEmail, tempPassword: password });
      } else {
        let sent = false;
        try { await sendPasswordResetEmail(secondaryAuth, cleanEmail); sent = true; } catch { sent = false; }
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
    try {
      await sendPasswordResetEmail(getSecondaryAuth(), toEmail);
      setOutcome((o) => (o && o.kind === "success-reset" ? { ...o, resetEmailSent: true } : o));
    } catch { /* retryable */ } finally { setResending(false); }
  };

  const setStatus = async (personId: string, accountStatus: "Active" | "Suspended") => {
    if (rowBusy) return;
    setRowBusy(personId);
    setListError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/persons/${encodeURIComponent(personId)}`, {
        method: "PATCH",
        body: JSON.stringify({ accountStatus }),
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
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Delivery People</h1>
          <p className="text-sm text-gray-500">
            Your company&apos;s delivery people. They sign in to the YOMICO Delivery Person app
            (<code className="rounded bg-gray-100 px-1">{APP_LOGIN_HINT}</code>).
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setOutcome(null); setFormError(null); }}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Close" : "Add delivery person"}
        </button>
      </div>

      {/* Add form */}
      {showForm ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Add delivery person</h2>
          {outcome ? (
            <OutcomeView outcome={outcome} resending={resending} copied={copied} onResend={resendReset} onCopy={async (pw) => {
              try { await navigator.clipboard.writeText(pw); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); }
            }} onDismiss={() => { setOutcome(null); setCopied(false); }} loginHint={APP_LOGIN_HINT} />
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

              <fieldset className="rounded-lg border p-3">
                <legend className="px-1 text-sm font-medium text-gray-700">Credential</legend>
                <div className="space-y-2">
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" name="credMode" className="mt-1" checked={credMode === "reset"} onChange={() => setCredMode("reset")} />
                    <span><span className="font-medium">Send password reset email</span>{" "}
                      <span className="text-gray-500">(recommended — the person sets their own password)</span></span>
                  </label>
                  <label className="flex items-start gap-2 text-sm">
                    <input type="radio" name="credMode" className="mt-1" checked={credMode === "temp"} onChange={() => setCredMode("temp")} />
                    <span><span className="font-medium">Set temporary password</span>{" "}
                      <span className="text-gray-500">(shown once — share it securely)</span></span>
                  </label>
                  {credMode === "temp" ? (
                    <label className="block pl-6">
                      <span className="text-sm text-gray-600">Temporary password (min 8 characters)</span>
                      <input className={inputCls} type="text" autoComplete="off" value={tempPassword} onChange={(e) => setTempPassword(e.target.value)} placeholder="Enter a temporary password" />
                    </label>
                  ) : null}
                </div>
              </fieldset>

              {formError ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}

              <button type="submit" disabled={submitting} className="rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
                {submitting ? "Adding…" : "Add delivery person"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      {/* List */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your delivery people</h2>
          <button onClick={() => { setLoading(true); void loadPersons(); }} disabled={loading} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {listError ? <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</p> : null}

        {loading ? (
          <Spinner />
        ) : persons.length === 0 ? (
          <div className="rounded border border-dashed bg-gray-50 p-8 text-center text-sm text-gray-500">
            No delivery people yet. Add one above.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {persons.map((p) => (
              <PersonCard
                key={p.id}
                person={p}
                busy={rowBusy === p.id}
                disabled={rowBusy !== null && rowBusy !== p.id}
                onSetStatus={setStatus}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function OutcomeView({ outcome, resending, copied, onResend, onCopy, onDismiss, loginHint }: {
  outcome: NonNullable<Outcome>;
  resending: boolean;
  copied: boolean;
  onResend: (email: string) => void;
  onCopy: (pw: string) => void;
  onDismiss: () => void;
  loginHint: string;
}) {
  if (outcome.kind === "partial") {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
        <h3 className="font-semibold text-amber-900">Provisioning incomplete</h3>
        <p className="mt-2 text-sm text-amber-800">
          The login account for <span className="font-medium">{outcome.email}</span> was created, but the
          delivery-person record could not be saved. Do not re-submit the same email — no account was overwritten.
        </p>
        <button onClick={onDismiss} className="mt-3 rounded border border-amber-400 px-3 py-1.5 text-sm text-amber-900">Back to form</button>
      </div>
    );
  }

  const line = outcome.kind === "success-reset"
    ? (outcome.resetEmailSent
        ? "A password-reset email was sent — the person sets their own password from that link."
        : "The account was created, but the reset email could not be sent. You can resend it below.")
    : "A temporary password was set (shown once below).";

  return (
    <div className="rounded-lg border border-green-300 bg-green-50 p-4">
      <h3 className="font-semibold text-green-900">Delivery person added</h3>
      <dl className="mt-2 space-y-1 text-sm text-green-900">
        <div><span className="text-green-700">Name:</span> <span className="font-medium">{outcome.name}</span></div>
        <div><span className="text-green-700">Email:</span> <span className="font-medium">{outcome.email}</span></div>
        <div className="text-green-800">{line}</div>
      </dl>

      {outcome.kind === "success-reset" && !outcome.resetEmailSent ? (
        <button onClick={() => onResend(outcome.email)} disabled={resending} className="mt-3 rounded bg-green-700 px-3 py-1.5 text-sm text-white disabled:opacity-50">
          {resending ? "Sending…" : "Resend reset email"}
        </button>
      ) : null}

      {outcome.kind === "success-temp" ? (
        <div className="mt-3 rounded border border-green-400 bg-white p-3">
          <p className="text-xs font-medium text-gray-600">Temporary password (shown once)</p>
          <div className="mt-1 flex items-center gap-2">
            <code className="flex-1 break-all rounded bg-gray-100 px-2 py-1 text-sm">{outcome.tempPassword}</code>
            <button onClick={() => onCopy(outcome.tempPassword)} className="shrink-0 rounded border px-3 py-1.5 text-sm">{copied ? "Copied" : "Copy"}</button>
          </div>
          <p className="mt-2 text-xs text-amber-700">⚠ Share this only through a secure channel. It will not be shown again after you leave this screen.</p>
        </div>
      ) : null}

      <p className="mt-3 text-sm text-green-800">
        Next: the delivery person signs in to the YOMICO Delivery Person app (<code className="rounded bg-white px-1">{loginHint}</code>).
      </p>
      <button onClick={onDismiss} className="mt-3 rounded border border-green-400 px-3 py-1.5 text-sm text-green-900">Add another</button>
    </div>
  );
}

function PersonCard({ person, busy, disabled, onSetStatus }: {
  person: CompanyPerson;
  busy: boolean;
  disabled: boolean;
  onSetStatus: (personId: string, status: "Active" | "Suspended") => void;
}) {
  const active = (person.accountStatus || "Active") === "Active";
  const availability = person.availability || "Offline";
  const vehicle = [person.vehicleType, person.vehicleNumber].filter(Boolean).join(" · ") || "—";
  const blocked = busy || disabled;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{person.name || "—"}</p>
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
        <div><span className="text-gray-400">Area</span> {person.serviceArea || "—"}</div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {active ? (
          <button onClick={() => onSetStatus(person.id, "Suspended")} disabled={blocked} className="rounded border border-red-300 px-2.5 py-1 text-xs text-red-700 disabled:opacity-50">
            Suspend
          </button>
        ) : (
          <button onClick={() => onSetStatus(person.id, "Active")} disabled={blocked} className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 disabled:opacity-50">
            Activate
          </button>
        )}
        {busy ? <span className="text-xs text-gray-400">Updating…</span> : null}
      </div>
      <p className="mt-2 text-[11px] text-gray-400">Availability is set by the person in the Delivery App.</p>
    </div>
  );
}
