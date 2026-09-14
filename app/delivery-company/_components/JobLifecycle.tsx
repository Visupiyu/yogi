"use client";

// Company Job lifecycle — a VISIBILITY-ONLY stepper for the ONE shipment
// (Seller → Customer). It renders the persisted stage progression; it never
// executes a physical step (those happen in the Delivery App) and never
// fabricates a stage the job is not actually in. The inter-city segment is
// clearly labelled as the company's own managed transport.
import type { LifecycleStep } from "@/app/delivery-company/_lib/console";

export default function JobLifecycle({ steps }: { steps: LifecycleStep[] }) {
  return (
    <ol className="space-y-3">
      {steps.map((s, i) => {
        const last = i === steps.length - 1;
        const dot =
          s.state === "done"
            ? "bg-teal-600 border-teal-600"
            : s.state === "current"
            ? "bg-white border-teal-600 ring-2 ring-teal-200"
            : "bg-white border-gray-300";
        const line = s.state === "done" ? "bg-teal-600" : "bg-gray-200";
        const label =
          s.state === "current"
            ? "font-semibold text-gray-900"
            : s.state === "done"
            ? "text-gray-700"
            : "text-gray-400";
        return (
          <li key={s.key} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span className={`mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 ${dot}`} />
              {!last ? <span className={`mt-0.5 w-0.5 flex-1 ${line}`} /> : null}
            </div>
            <div className="pb-1">
              <p className={`text-sm ${label}`}>
                {s.label}
                {s.state === "current" ? (
                  <span className="ml-2 rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-teal-700">
                    Current
                  </span>
                ) : null}
              </p>
              {s.note ? <p className="text-[11px] text-gray-400">{s.note}</p> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
