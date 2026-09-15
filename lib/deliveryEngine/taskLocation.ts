// SERVER-ONLY. Derives the RIDER'S PHYSICAL TASK (pickup location -> drop
// location) for whichever leg is currently assigned, so the mobile Delivery
// App never has to re-implement the leg/hub lifecycle itself.
//
//   YOMICO DIRECT (one leg, one rider):        seller  -> customer
//   COMPANY first-mile  (leg.type "Pickup"):    seller  -> origin hub
//   COMPANY final-mile  (leg.type "FinalMile"): dest hub -> customer
//
// Read-only. Does not touch assignment, the scan FSM, custody, OTP, company
// transit, destination-receipt or final-mile-assignment — it only READS the
// job + its current leg (+ a hub doc when needed) and formats what is already
// persisted. Nothing is invented, derived-by-guessing, or geocoded: a hub has
// no street address today, so only name/city/region are ever shown, and an
// unresolvable origin hub is reported honestly rather than guessed.
import type { Firestore } from "firebase-admin/firestore";
import type { DeliveryJob, DeliveryLeg, DeliveryHub } from "@/lib/deliveryEngine/types";

// FinalMile leg only: the destination-hub -> Rider 2 handover state, read
// directly off the leg's own persisted `status` + `destinationHandover`
// (destinationHandover.ts) — the SAME fields my-hub-tasks.ts already reads
// for the Hub Person's mirror of this same handover, so this is not a new
// state machine, just this leg's existing FSM read from Rider 2's side:
//   "ready"                       — not yet initiated; nothing to confirm.
//   "awaiting_rider_confirmation" — Hub Person initiated; Rider 2 may confirm.
//   "confirmed"                   — Rider 2 already confirmed; custody is theirs.
export type FinalMileHandoverState = "ready" | "awaiting_rider_confirmation" | "confirmed";

function finalMileHandoverStateOf(leg: DeliveryLeg): FinalMileHandoverState {
  if (leg.status === "HandoverInitiated" && leg.destinationHandover?.state === "Initiated") {
    return "awaiting_rider_confirmation";
  }
  if (leg.destinationHandover?.state === "Confirmed") return "confirmed";
  return "ready";
}

export type TaskLocation = {
  kind: "seller" | "customer" | "hub" | "unassigned";
  name: string;
  // Seller fields (job.pickup snapshot — see lib/deliveryEngine/jobFactory.ts).
  street?: string;
  unit?: string;
  city?: string;
  state?: string;
  zipCode?: string;
  // Customer fields (job.drop snapshot). Also reused, unchanged, for a hub's
  // optional real street address (deliveryHubs/{hubId}.address) — most hubs
  // today have none, and it is never invented/geocoded when absent (see
  // deriveNavigationDestination, which reports navigation as unavailable
  // rather than guessing one).
  address?: string;
  phone?: string;
  slot?: string | null;
  // Hub fields (deliveryHubs/{hubId}).
  region?: string;
  // Set only for kind "unassigned": an honest explanation, never a guess.
  note?: string;
};

export type RiderTask = {
  pickup: TaskLocation;
  drop: TaskLocation;
  // Present only when the current leg is FinalMile — absent (never a guessed
  // value) for YOMICO Direct and every other COMPANY leg type, where this
  // handover does not apply.
  finalMileHandoverState?: FinalMileHandoverState;
};

function sellerLocation(job: DeliveryJob): TaskLocation {
  return {
    kind: "seller",
    name: job.pickup?.sellerName || "",
    street: job.pickup?.street || "",
    unit: job.pickup?.unit || "",
    city: job.pickup?.city || "",
    state: job.pickup?.state || "",
    zipCode: job.pickup?.zipCode || "",
  };
}

function customerLocation(job: DeliveryJob): TaskLocation {
  return {
    kind: "customer",
    name: job.drop?.customerName || "",
    address: job.drop?.address || "",
    phone: job.drop?.phone || "",
    slot: job.drop?.slot ?? null,
  };
}

function hubLocation(hub: DeliveryHub): TaskLocation {
  return {
    kind: "hub",
    name: typeof hub.name === "string" && hub.name ? hub.name : "Company hub",
    city: hub.city || "",
    region: hub.region || "",
    address: typeof hub.address === "string" && hub.address.trim() ? hub.address.trim() : undefined,
  };
}

function unassignedLocation(note: string): TaskLocation {
  return { kind: "unassigned", name: "", note };
}

// Per-request caches so /my-jobs (many jobs, possibly the same company/hub)
// never re-reads the same hub doc more than once. Optional — omit for a
// single-job lookup.
export type TaskHubCaches = {
  originHubByCompany: Map<string, TaskLocation>;
  hubById: Map<string, TaskLocation>;
};
export function newTaskHubCaches(): TaskHubCaches {
  return { originHubByCompany: new Map(), hubById: new Map() };
}

// Origin hub for a first-mile (Pickup leg) COMPANY job: only resolvable
// unambiguously when the company has exactly one Active hub (the same
// derivation applyOriginHubHandoverInitiate itself uses) — mirrors, never
// overrides, the handover's own logic. Zero or multiple active hubs -> honest
// "not assigned" rather than a guess.
async function resolveOriginHub(
  db: Firestore,
  companyId: string,
  caches?: TaskHubCaches
): Promise<TaskLocation> {
  const cached = caches?.originHubByCompany.get(companyId);
  if (cached) return cached;
  const hubsSnap = await db.collection("deliveryHubs").where("companyId", "==", companyId).get();
  const active = hubsSnap.docs.filter((d) => (d.data() as DeliveryHub).status === "Active");
  let result: TaskLocation;
  if (active.length === 1) {
    result = hubLocation(active[0].data() as DeliveryHub);
  } else if (active.length === 0) {
    result = unassignedLocation("Origin hub not assigned yet.");
  } else {
    result = unassignedLocation("Origin hub not assigned yet.");
  }
  caches?.originHubByCompany.set(companyId, result);
  return result;
}

// Destination hub for a final-mile leg: resolved from the PERSISTED hub id
// (job.destinationHubId, set once by the destination-hub-receipt transition)
// — never re-derived or re-selected here.
async function resolveHubById(
  db: Firestore,
  hubId: string | null | undefined,
  caches?: TaskHubCaches
): Promise<TaskLocation> {
  if (!hubId) return unassignedLocation("Destination hub not assigned yet.");
  const cached = caches?.hubById.get(hubId);
  if (cached) return cached;
  const snap = await db.collection("deliveryHubs").doc(hubId).get();
  const result = snap.exists ? hubLocation(snap.data() as DeliveryHub) : unassignedLocation("Destination hub not assigned yet.");
  caches?.hubById.set(hubId, result);
  return result;
}

// Reads job.currentLegId's DeliveryLeg and derives the rider's physical task
// from job.providerType + leg.type. Returns null when there is no current
// leg, the leg cannot be read, or the leg type is not one a rider is ever
// assigned to (e.g. HubIntake — its assignedPersonId is always null, so no
// rider's /my-jobs or job-detail call can reach it in practice).
export async function deriveRiderTask(
  db: Firestore,
  jobId: string,
  job: DeliveryJob,
  caches?: TaskHubCaches
): Promise<RiderTask | null> {
  if (!job.currentLegId) return null;
  const legSnap = await db.collection("deliveryJobs").doc(jobId).collection("legs").doc(job.currentLegId).get();
  if (!legSnap.exists) return null;
  const leg = legSnap.data() as DeliveryLeg;

  if (job.providerType !== "COMPANY") {
    // YOMICO Direct: one leg, one rider, seller -> customer.
    return { pickup: sellerLocation(job), drop: customerLocation(job) };
  }

  if (leg.type === "Pickup") {
    // Prefer the operator's per-job origin-hub selection (job.originHubId) so a
    // company running multiple active hubs navigates to the RIGHT one; fall back
    // to the company's single active hub when none was chosen. resolveHubById
    // reads by id regardless of status, so an in-flight job keeps working even
    // if that hub is later deactivated.
    const originHub = job.originHubId
      ? await resolveHubById(db, job.originHubId, caches)
      : job.companyId
      ? await resolveOriginHub(db, job.companyId, caches)
      : unassignedLocation("Origin hub not assigned yet.");
    return { pickup: sellerLocation(job), drop: originHub };
  }

  if (leg.type === "FinalMile") {
    const destHub = await resolveHubById(db, job.destinationHubId, caches);
    return { pickup: destHub, drop: customerLocation(job), finalMileHandoverState: finalMileHandoverStateOf(leg) };
  }

  return null;
}

// ---------------------------------------------------------------------------
// V1 navigation ("open the phone's map app") — read-only, derived STRICTLY
// from the same server-authoritative task above. Never lets the client pick
// an arbitrary destination: the backend decides which single place (seller,
// origin hub, destination hub, or customer) the CURRENT actor should be
// heading to, from provider type + current stage + current leg + the leg's
// own handover state — the exact same signals deriveRiderTask already reads.
// No geocoding, no coordinates: only whatever address string is already on
// file (job.pickup/job.drop snapshots, or a hub's optional `address`).
// ---------------------------------------------------------------------------

export type NavigationDestination = {
  available: boolean;
  label: string;
  address: string | null;
  // Present ONLY when available is false and there is something honest to say
  // (e.g. a hub with no address on file). Absent when available, and absent
  // when there is simply no destination to explain (job complete, no task).
  reason?: string;
};

const NO_NAVIGATION: NavigationDestination = { available: false, label: "", address: null };

// Job statuses past which physical navigation no longer applies. Mirrors the
// mobile app's own TERMINAL set (src/app/jobs/[jobId].tsx) — never a second,
// diverging notion of "done".
const NAV_TERMINAL_STATUSES = new Set(["Delivered", "Cancelled", "Returned"]);

function formatSellerAddress(loc: TaskLocation): string | null {
  const parts = [loc.street, loc.unit, loc.city, loc.state, loc.zipCode].filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

// Turns one TaskLocation into a navigation destination, honestly reporting
// "unavailable" (never a guess) when the location itself has no usable
// address — an unassigned hub, a seller/customer snapshot missing an address,
// or a resolved hub with no `address` on file.
function navigationFromLocation(loc: TaskLocation, label: string): NavigationDestination {
  if (loc.kind === "unassigned") {
    return { available: false, label, address: null, reason: loc.note || "Not yet assigned." };
  }
  if (loc.kind === "seller") {
    const address = formatSellerAddress(loc);
    return address
      ? { available: true, label, address }
      : { available: false, label, address: null, reason: "Seller address not on file." };
  }
  if (loc.kind === "customer") {
    return loc.address
      ? { available: true, label, address: loc.address }
      : { available: false, label, address: null, reason: "Customer address not on file." };
  }
  // kind === "hub"
  return loc.address
    ? { available: true, label, address: loc.address }
    : { available: false, label, address: null, reason: "Navigation unavailable — hub address not configured." };
}

// The single navigation destination for whichever rider currently holds this
// job's physical task — see the per-model rules above deriveRiderTask.
// `task` MUST be this same job's own deriveRiderTask() result (never a
// different job's, never client-supplied) — callers always derive both from
// the same authoritative read.
export function deriveNavigationDestination(job: DeliveryJob, task: RiderTask | null): NavigationDestination {
  if (!task) return NO_NAVIGATION;
  if (NAV_TERMINAL_STATUSES.has(job.status)) return NO_NAVIGATION;

  // FinalMile leg (COMPANY Rider 2) is the only case where task.pickup is a
  // hub — see deriveRiderTask above. Before the destination-hub handover is
  // confirmed, Rider 2 has no customer destination (must not be offered one)
  // and instead navigates to the destination hub to receive the parcel; only
  // once handover is Confirmed does the customer become the destination —
  // and Rider 2 is never given the origin hub, which this branch never reads.
  if (task.pickup.kind === "hub") {
    if (task.finalMileHandoverState === "confirmed") {
      return navigationFromLocation(task.drop, "Navigate to customer");
    }
    return navigationFromLocation(task.pickup, "Navigate to destination hub");
  }

  // Pickup leg (COMPANY Rider 1) or YOMICO Direct's single leg: before pickup,
  // navigate to the seller; after, navigate to whatever task.drop is for this
  // model (origin hub for COMPANY Rider 1 — never the customer; customer for
  // YOMICO Direct — never a hub).
  if (job.currentStage === "AwaitingHandoff") {
    return navigationFromLocation(task.pickup, "Navigate to seller");
  }
  const isYomicoDirect = job.providerType !== "COMPANY";
  return navigationFromLocation(task.drop, isYomicoDirect ? "Navigate to customer" : "Navigate to origin hub");
}
