"use client";

// Delivery Company — Hub Persons. A first-class management section for HUB
// PERSONS (stationed receivers), separate from Delivery People (riders). It
// REUSES the existing deliveryPersons model + company-scoped endpoints:
//   GET/POST /api/delivery/company/persons          (list all; create)
//   PATCH    /api/delivery/company/persons/[personId] (activate / suspend)
//   GET      /api/delivery/company/hubs               (the company's hubs)
//
// A Hub Person is stored as role="HUB_PERSON" + hubId=<a company-owned hub>.
// providerType / companyId / uid / createdBy / role / hubId are all validated
// server-side from the verified caller (companyId is never trusted from the
// browser; the hub must be one of this company's own Active hubs). This page
// lists ONLY hub persons and shows each person's stored hub. The same hub
// person can be designated on many jobs — nothing here limits that.
//
// SECURITY: the new person's password is created only in the browser on a
// SEPARATE "secondary" Firebase app (so the operator's own session is
// untouched), is NEVER sent to any API, written to Firestore, logged, or put in
// a URL/localStorage — identical to the Delivery People page.
import { useCallback, useEffect, useRef, useState } from "react";
import { createUserWithEmailAndPassword, sendPasswordResetEmail, signOut } from "firebase/auth";
import { getSecondaryAuth } from "@/lib/firebase";
import { authedFetch, Spinner, type CompanyPerson } from "@/app/delivery-company/_lib/console";

const APP_LOGIN_HINT = "/delivery-app/login";

type CredMode = "reset" | "temp";
type Hub = { id: string; name?: string; status?: string };
type Outcome =
  | { kind: "success-reset"; name: string; email: string; resetEmailSent: boolean }
  | { kind: "success-temp"; name: string; email: string; tempPassword: string }
  | { kind: "partial"; email: string }
  | null;

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

export default function DeliveryCompanyHubPersonsPage() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [hubId, setHubId] = useState("");
  const [credMode, setCredMode] = useState<CredMode>("reset");
  const [tempPassword, setTempPassword] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome>(null);
  const [resending, setResending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const [hubPersons, setHubPersons] = useState<CompanyPerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);
  const [hubs, setHubs] = useState<Hub[]>([]);

  const loadHubPersons = useCallback(async () => {
    setListError(null);
    try {
      const res = await authedFetch("/api/delivery/company/persons");
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setListError("You are not authorized. Please sign in as a delivery company operator again.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Could not load your hub persons.");
      const all: CompanyPerson[] = Array.isArray(data.persons) ? data.persons : [];
      setHubPersons(all.filter((p) => p.role === "HUB_PERSON"));
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load your hub persons.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHubPersons(); }, [loadHubPersons]);

  useEffect(() => {
    (async () => {
      try {
        const res = await authedFetch("/api/delivery/company/hubs");
        const data = await res.json().catch(() => ({}));
        if (res.ok && Array.isArray(data.hubs)) setHubs(data.hubs);
      } catch { /* non-fatal — the list still renders without hub names */ }
    })();
  }, []);

  const hubNameById = (id?: string | null): string =>
    (id && hubs.find((h) => h.id === id)?.name) || (id ? "Unknown hub" : "—");

  const resetFormFields = () => {
    setName(""); setPhone(""); setEmail(""); setHubId(""); setTempPassword("");
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
    if (!hubId) { setFormError("Select the hub where this person is stationed."); return; }
    if (credMode === "temp" && tempPassword.length < 8) { setFormError("Temporary password must be at least 8 characters."); return; }

    inFlightRef.current = true;
    setSubmitting(true);
    const secondaryAuth = getSecondaryAuth();
    const password = credMode === "temp" ? tempPassword : generateStrongPassword(); // local only

    try {
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

      try { await signOut(secondaryAuth); } catch { /* non-fatal */ }

      // Register as a HUB_PERSON. The body carries NO password; providerType/
      // companyId are forced server-side. role="HUB_PERSON" REQUIRES hubId, which
      // the server validates is one of THIS company's own Active hubs.
      try {
        const res = await authedFetch("/api/delivery/company/persons", {
          method: "POST",
          body: JSON.stringify({
            uid,
            name: cleanName,
            phone: cleanPhone,
            email: cleanEmail,
            role: "HUB_PERSON",
            hubId,
          }),
        });
        if (!res.ok) { setOutcome({ kind: "partial", email: cleanEmail }); return; }
      } catch {
        setOutcome({ kind: "partial", email: cleanEmail });
        return;
      }

      if (credMode === "temp") {
        setOutcome({ kind: "success-temp", name: cleanName, email: cleanEmail, tempPassword: password });
      } else {
        let sent = false;
        try { await sendPasswordResetEmail(secondaryAuth, cleanEmail); sent = true; } catch { sent = false; }
        setOutcome({ kind: "success-reset", name: cleanName, email: cleanEmail, resetEmailSent: sent });
      }
      resetFormFields();
      void loadHubPersons();
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
        setListError(d?.error || "Could not update this hub person.");
      } else {
        await loadHubPersons();
      }
    } catch {
      setListError("Could not update this hub person.");
    } finally {
      setRowBusy(null);
    }
  };

  const activeHubs = hubs.filter((h) => (h.status ?? "Active") === "Active");
  const inputCls = "mt-1 w-full rounded border px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hub Persons</h1>
          <p className="text-sm text-gray-500">
            Receivers stationed at your hubs (not riders). They sign in to the YOMICO Delivery Person app
            (<code className="rounded bg-gray-100 px-1">{APP_LOGIN_HINT}</code>) and confirm shipment receipt at their hub.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setOutcome(null); setFormError(null); }}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Close" : "Add hub person"}
        </button>
      </div>

      {showForm ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Add hub person</h2>
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
                <label className="block md:col-span-2">
                  <span className="text-sm text-gray-600">Hub<span className="text-red-500">*</span></span>
                  <select className={inputCls} value={hubId} onChange={(e) => setHubId(e.target.value)} required>
                    <option value="">{activeHubs.length ? "Select the hub this person is stationed at…" : "No active hubs configured"}</option>
                    {hubs.map((h) => {
                      const activeHub = (h.status ?? "Active") === "Active";
                      return (
                        <option key={h.id} value={h.id} disabled={!activeHub}>
                          {h.name || h.id}{activeHub ? "" : " (inactive)"}
                        </option>
                      );
                    })}
                  </select>
                  <span className="mt-1 block text-[11px] text-gray-400">Only your company&apos;s active hubs can be selected for a new hub person.</span>
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
                {submitting ? "Adding…" : "Add hub person"}
              </button>
            </form>
          )}
        </section>
      ) : null}

      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your hub persons</h2>
          <button onClick={() => { setLoading(true); void loadHubPersons(); }} disabled={loading} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {listError ? <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</p> : null}

        {loading ? (
          <Spinner />
        ) : hubPersons.length === 0 ? (
          <div className="rounded border border-dashed bg-gray-50 p-8 text-center text-sm text-gray-500">
            No hub persons yet. Add one above and station them at a hub.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {hubPersons.map((p) => (
              <HubPersonCard
                key={p.id}
                person={p}
                hubName={hubNameById(p.hubId)}
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
          hub-person record could not be saved. Do not re-submit the same email — no account was overwritten.
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
      <h3 className="font-semibold text-green-900">Hub person added</h3>
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
        Next: the hub person signs in to the YOMICO Delivery Person app (<code className="rounded bg-white px-1">{loginHint}</code>) and confirms receipt at their hub.
      </p>
      <button onClick={onDismiss} className="mt-3 rounded border border-green-400 px-3 py-1.5 text-sm text-green-900">Add another</button>
    </div>
  );
}

function HubPersonCard({ person, hubName, busy, disabled, onSetStatus }: {
  person: CompanyPerson;
  hubName: string;
  busy: boolean;
  disabled: boolean;
  onSetStatus: (personId: string, status: "Active" | "Suspended") => void;
}) {
  const active = (person.accountStatus || "Active") === "Active";
  const availability = person.availability || "Offline";
  const blocked = busy || disabled;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{person.name || "—"}</p>
          <p className="truncate text-sm text-gray-500">{person.email || "—"}</p>
          <p className="text-sm text-gray-500">{person.phone || "—"}</p>
          <p className="mt-1">
            <span className="rounded bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
              HUB PERSON{hubName && hubName !== "—" ? ` — ${hubName}` : ""}
            </span>
          </p>
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
      <p className="mt-2 text-[11px] text-gray-400">
        Availability is set by the person in the Delivery App. A hub person is stationed at their hub and can receive
        many shipments.
      </p>
    </div>
  );
}
