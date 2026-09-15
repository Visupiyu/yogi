"use client";

// Delivery Company — Hubs. Manage ONLY this company's own hubs via the existing
// company-scoped endpoints (reusing the shared deliveryHubs collection/model —
// no second hub system):
//   GET/POST /api/delivery/company/hubs
//   PATCH    /api/delivery/company/hubs/[hubId]   (activate / deactivate)
//
// companyId is ALWAYS resolved server-side from the verified caller — this UI
// never sends it and can never reach another company's hubs. The stored hub
// address is what the Delivery Engine's navigation/task derivation uses for the
// Seller → Rider 1 → Origin Hub handoff, so at least one active hub must be
// configured before hub-dependent operations can proceed. A company may run
// MULTIPLE active hubs; the specific hub for each job is chosen on the Job Card.
import { useCallback, useEffect, useRef, useState } from "react";
import { authedFetch, Spinner } from "@/app/delivery-company/_lib/console";

type CompanyHub = {
  id: string;
  name: string;
  address?: string;
  city?: string;
  region?: string; // state / region
  pincode?: string;
  status: string;
};

export default function DeliveryCompanyHubsPage() {
  const [hubs, setHubs] = useState<CompanyHub[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [active, setActive] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const inFlightRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  const loadHubs = useCallback(async () => {
    setListError(null);
    try {
      const res = await authedFetch("/api/delivery/company/hubs");
      const data = await res.json().catch(() => ({}));
      if (res.status === 401 || res.status === 403) {
        setListError("You are not authorized. Please sign in as a delivery company operator again.");
        return;
      }
      if (!res.ok) throw new Error(data?.error || "Could not load your hubs.");
      setHubs(Array.isArray(data.hubs) ? data.hubs : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Could not load your hubs.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadHubs(); }, [loadHubs]);

  const activeCount = hubs.filter((h) => h.status === "Active").length;

  const resetForm = () => {
    setName(""); setAddress(""); setCity(""); setStateName(""); setPincode(""); setActive(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlightRef.current) return;
    setFormError(null);
    setFormSuccess(null);

    const n = name.trim(), a = address.trim(), c = city.trim(), s = stateName.trim(), p = pincode.trim();
    if (!n || !a || !c || !s) { setFormError("Hub name, address, city and state are required."); return; }
    if (!/^\d{6}$/.test(p)) { setFormError("Enter a valid 6-digit pincode."); return; }

    inFlightRef.current = true;
    setSubmitting(true);
    try {
      const res = await authedFetch("/api/delivery/company/hubs", {
        method: "POST",
        body: JSON.stringify({
          name: n, address: a, city: c, state: s, pincode: p,
          status: active ? "Active" : "Inactive",
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setFormError(data?.error || "Could not add the hub."); return; }
      setFormSuccess("Hub added.");
      resetForm();
      setShowForm(false);
      await loadHubs();
    } catch {
      setFormError("Could not add the hub. Please try again.");
    } finally {
      inFlightRef.current = false;
      setSubmitting(false);
    }
  };

  const setStatus = async (hubId: string, status: "Active" | "Inactive") => {
    if (rowBusy) return;
    setRowBusy(hubId);
    setListError(null);
    try {
      const res = await authedFetch(`/api/delivery/company/hubs/${encodeURIComponent(hubId)}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setListError(d?.error || "Could not update this hub.");
      } else {
        await loadHubs();
      }
    } catch {
      setListError("Could not update this hub.");
    } finally {
      setRowBusy(null);
    }
  };

  const inputCls = "mt-1 w-full rounded border px-3 py-2 text-sm";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Hubs</h1>
          <p className="text-sm text-gray-500">
            Your company&apos;s physical hubs. A hub&apos;s address is used as the
            Seller → Rider 1 → Origin Hub handoff destination.
          </p>
        </div>
        <button
          onClick={() => { setShowForm((s) => !s); setFormError(null); setFormSuccess(null); }}
          className="rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white"
        >
          {showForm ? "Close" : "+ Add Hub"}
        </button>
      </div>

      {/* Active-hub requirement notice */}
      {!loading && !listError && activeCount === 0 ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">No active hub configured</p>
          <p className="mt-1 text-sm text-amber-800">
            Your company must have an active hub before hub handoff operations
            (Seller → Rider 1 → Origin Hub) can proceed. Add a hub and mark it Active.
          </p>
          <button
            onClick={() => { setShowForm(true); setFormError(null); setFormSuccess(null); }}
            className="mt-3 rounded bg-amber-600 px-3 py-1.5 text-sm font-medium text-white"
          >
            Add a hub
          </button>
        </div>
      ) : null}

      {/* Add form */}
      {showForm ? (
        <section className="rounded-xl border bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold">Add hub</h2>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block md:col-span-2">
                <span className="text-sm text-gray-600">Hub name<span className="text-red-500">*</span></span>
                <input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Ahmedabad Central Hub" />
              </label>
              <label className="block md:col-span-2">
                <span className="text-sm text-gray-600">Address (complete)<span className="text-red-500">*</span></span>
                <input className={inputCls} value={address} onChange={(e) => setAddress(e.target.value)} required placeholder="Building, street, area" />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">City<span className="text-red-500">*</span></span>
                <input className={inputCls} value={city} onChange={(e) => setCity(e.target.value)} required />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">State<span className="text-red-500">*</span></span>
                <input className={inputCls} value={stateName} onChange={(e) => setStateName(e.target.value)} required />
              </label>
              <label className="block">
                <span className="text-sm text-gray-600">Pincode<span className="text-red-500">*</span></span>
                <input className={inputCls} value={pincode} onChange={(e) => setPincode(e.target.value)} required inputMode="numeric" placeholder="6 digits" />
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm">
                <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
                <span className="text-gray-700">Active</span>
              </label>
            </div>
            <p className="text-xs text-gray-500">
              New hubs are active by default. You can run multiple active hubs at once —
              the specific hub for each job is chosen on the job card.
            </p>
            {formError ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</p> : null}
            <button type="submit" disabled={submitting} className="rounded bg-slate-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50">
              {submitting ? "Adding…" : "Add hub"}
            </button>
          </form>
        </section>
      ) : null}

      {/* List */}
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Your hubs</h2>
          <button onClick={() => { setLoading(true); void loadHubs(); }} disabled={loading} className="rounded border px-3 py-1.5 text-sm disabled:opacity-50">
            {loading ? "Refreshing…" : "Refresh"}
          </button>
        </div>

        {formSuccess ? <p className="mb-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">{formSuccess}</p> : null}
        {listError ? <p className="mb-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{listError}</p> : null}

        {loading ? (
          <Spinner />
        ) : hubs.length === 0 ? (
          <div className="rounded border border-dashed bg-gray-50 p-8 text-center text-sm text-gray-500">
            No hubs yet. Add one above.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {hubs.map((h) => (
              <HubCard
                key={h.id}
                hub={h}
                busy={rowBusy === h.id}
                disabled={rowBusy !== null && rowBusy !== h.id}
                onSetStatus={setStatus}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function HubCard({ hub, busy, disabled, onSetStatus }: {
  hub: CompanyHub;
  busy: boolean;
  disabled: boolean;
  onSetStatus: (hubId: string, status: "Active" | "Inactive") => void;
}) {
  const active = hub.status === "Active";
  const locality = [hub.city, hub.region, hub.pincode].filter((p) => p && p.trim()).join(", ") || "—";
  const blocked = busy || disabled;

  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-medium text-gray-900">{hub.name || "—"}</p>
          <p className="mt-0.5 text-sm text-gray-600">{hub.address || "—"}</p>
          <p className="text-sm text-gray-500">{locality}</p>
        </div>
        <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${active ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-700"}`}>
          {active ? "Active" : "Inactive"}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {active ? (
          <button onClick={() => onSetStatus(hub.id, "Inactive")} disabled={blocked} className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-700 disabled:opacity-50">
            Deactivate
          </button>
        ) : (
          <button onClick={() => onSetStatus(hub.id, "Active")} disabled={blocked} className="rounded border border-green-300 px-2.5 py-1 text-xs text-green-700 disabled:opacity-50">
            Set active
          </button>
        )}
        {busy ? <span className="text-xs text-gray-400">Updating…</span> : null}
      </div>
    </div>
  );
}
