"use client";

// Job Card — permanent DELIVERY ROUTE section. Shows the WHOLE physical shipment
// route for one delivery number, from seller pickup to customer delivery, and
// stays visible regardless of the current FSM stage. Every value is loaded from
// the server job projection (GET /api/delivery/jobs/[jobId]) — NOT local state —
// so it survives a page refresh. Hubs are resolved server-side from the stored
// originHubId / destinationHubId (authoritative ids), so an in-flight job keeps
// resolving even if a hub is later deactivated. Nothing here is typed by hand.

export type RouteHub = {
  id: string;
  name?: string;
  address?: string;
  city?: string;
  region?: string;
  pincode?: string;
} | null;

export type RoutePickup = {
  sellerName?: string;
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
} | null;

export type RouteDrop = {
  customerName?: string;
  address?: string;
} | null;

function joinParts(parts: (string | undefined)[]): string {
  return parts.filter((p) => typeof p === "string" && p.trim().length > 0).join(", ");
}

function Step({
  badge,
  tone,
  title,
  address,
  locality,
  missing,
}: {
  badge: string;
  tone: string;
  title: string;
  address?: string;
  locality?: string;
  missing?: string;
}) {
  return (
    <div className="flex gap-3">
      <div className={`mt-0.5 flex h-6 shrink-0 items-center rounded px-2 text-[10px] font-bold uppercase tracking-wide ${tone}`}>
        {badge}
      </div>
      <div className="min-w-0 flex-1">
        {missing ? (
          <p className="text-sm text-gray-400">{missing}</p>
        ) : (
          <>
            <p className="text-sm font-semibold text-gray-900">{title || "—"}</p>
            {address ? <p className="text-xs text-gray-600">{address}</p> : null}
            {locality ? <p className="text-xs text-gray-500">{locality}</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

function Arrow({ label }: { label?: string }) {
  return (
    <div className="ml-2 flex items-center gap-2 py-0.5 text-gray-300">
      <span aria-hidden className="text-base leading-none">↓</span>
      {label ? <span className="text-[11px] font-medium text-gray-400">{label}</span> : null}
    </div>
  );
}

export default function DeliveryRoute({
  pickup,
  originHub,
  destinationHub,
  drop,
}: {
  pickup: RoutePickup;
  originHub: RouteHub;
  destinationHub: RouteHub;
  drop: RouteDrop;
}) {
  const sellerAddr = joinParts([pickup?.street, pickup?.unit, pickup?.city, pickup?.state, pickup?.zipCode]);
  const sellerLocality = joinParts([pickup?.city, pickup?.state]);

  const originLocality = originHub ? joinParts([originHub.city, originHub.region, originHub.pincode]) : "";
  const destLocality = destinationHub ? joinParts([destinationHub.city, destinationHub.region, destinationHub.pincode]) : "";

  const lineHaulLabel =
    originHub || destinationHub
      ? `Line haul: ${originHub?.name || "Origin hub"} → ${destinationHub?.name || "Destination hub"}`
      : "Line haul";

  return (
    <div className="space-y-1">
      <Step
        badge="Seller"
        tone="bg-slate-100 text-slate-700"
        title={pickup?.sellerName || "Seller"}
        address={sellerAddr || undefined}
        locality={sellerLocality || undefined}
      />
      <Arrow />
      <Step
        badge="Origin"
        tone="bg-teal-100 text-teal-800"
        title={originHub?.name || ""}
        address={originHub?.address || undefined}
        locality={originLocality || undefined}
        missing={originHub ? undefined : "Origin hub not selected"}
      />
      <Arrow label={lineHaulLabel} />
      <Step
        badge="Dest"
        tone="bg-teal-100 text-teal-800"
        title={destinationHub?.name || ""}
        address={destinationHub?.address || undefined}
        locality={destLocality || undefined}
        missing={destinationHub ? undefined : "Destination hub not selected"}
      />
      <Arrow />
      <Step
        badge="Customer"
        tone="bg-slate-100 text-slate-700"
        title={drop?.customerName || "Customer"}
        address={drop?.address || undefined}
      />
    </div>
  );
}
