"use client";

// Job Card — permanent DELIVERY PEOPLE section. A COMPANY hub-routed shipment
// has FOUR distinct operational actors, each tied to a specific leg/handoff in
// the existing Delivery Engine (this component only DISPLAYS them — it never
// assigns; assignment/receipt happens through the engine + the Delivery App):
//
//   1 First-mile rider (Rider 1)  — Pickup leg assignedPersonId (Seller → Origin Hub)
//   2 Origin hub person           — Pickup leg originHubHandover.confirmedByPersonId
//   3 Destination hub person      — destination-hub-receipt event personId
//   4 Final-mile rider (Rider 2)  — FinalMile leg assignedPersonId (Dest Hub → Customer)
//
// All values come from the server job projection (survives refresh). Hub persons
// are shown against the SELECTED origin/destination hub; a not-yet-confirmed hub
// person shows a truthful pending state (any active hub person at that hub
// confirms receipt in the Delivery App — never pre-picked by the operator).

export type ActorView = {
  personId?: string | null;
  name?: string;
  phone?: string;
  status: string;
  hubName?: string; // present for the two hub-person rows
};

function Actor({
  n,
  role,
  actor,
  hub,
}: {
  n: number;
  role: string;
  actor?: ActorView | null;
  hub?: boolean;
}) {
  const assigned = !!(actor && actor.personId);
  return (
    <div className="flex gap-3 rounded-lg border p-3">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          hub ? "bg-teal-600" : "bg-slate-700"
        }`}
      >
        {n}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{role}</p>
        {actor?.hubName ? (
          <p className="text-xs text-teal-700">Hub: {actor.hubName}</p>
        ) : null}
        {assigned ? (
          <>
            <p className="truncate text-sm font-semibold text-gray-900">{actor?.name || "—"}</p>
            <p className="text-xs text-gray-500">{actor?.phone || "—"}</p>
          </>
        ) : (
          <p className="text-sm text-gray-400">{actor?.status || "Not assigned"}</p>
        )}
      </div>
      <div className="shrink-0 self-start">
        <span
          className={`rounded px-2 py-0.5 text-[11px] font-medium ${
            assigned ? "bg-green-100 text-green-800" : "bg-gray-100 text-gray-600"
          }`}
        >
          {actor?.status || "Not assigned"}
        </span>
      </div>
    </div>
  );
}

export default function DeliveryPeople({
  rider1,
  originHubPerson,
  destinationHubPerson,
  rider2,
}: {
  rider1?: ActorView | null;
  originHubPerson?: ActorView | null;
  destinationHubPerson?: ActorView | null;
  rider2?: ActorView | null;
}) {
  return (
    <div className="space-y-2">
      <Actor n={1} role="First-mile rider (Seller → Origin hub)" actor={rider1} />
      <Actor n={2} role="Origin hub person (receives at origin hub)" actor={originHubPerson} hub />
      <Actor n={3} role="Destination hub person (receives at destination hub)" actor={destinationHubPerson} hub />
      <Actor n={4} role="Final-mile rider (Destination hub → Customer)" actor={rider2} />
      <p className="pt-1 text-[11px] text-gray-400">
        Four separate operational assignments. Hub persons and riders each authenticate in the Delivery App and
        confirm their own physical step — this view reflects the actual leg assignments, it does not perform them.
      </p>
    </div>
  );
}
