// ---------------------------------------------------------------------------
// YOMICO Delivery Engine — types.
//
// Phase 2A: the unified delivery-person model. ONE deliveryPersons collection
// serves both provider sides; they differ only in WHO controls the person.
//
// NOT in Phase 2A (deferred to 2B): deliveryJobs / deliveryLegs / deliveryEvents
// types and the operational routes. And DELIBERATELY, in no phase here: any
// money model — no wallet, balance, payout, settlement, pricing, commission, or
// earnings field exists on any type. Customer payment is never routed to a
// delivery company; a future company payable is a separate YOMICO settlement.
// ---------------------------------------------------------------------------

export type DeliveryCompanyStatus = "Pending" | "Active" | "Suspended";

// Collection: deliveryCompanies/{companyId}  (companyId = existing auto-id)
export type DeliveryCompany = {
  name: string;
  legalName?: string;
  status: DeliveryCompanyStatus;
  // The company-admin Firebase Auth uid — the login identity. Null until an
  // owner account is provisioned (the 2 live companies currently have none).
  ownerUid?: string | null;
  contact?: { email?: string; phone?: string };
  serviceAreas?: string[];
  approvedAt?: unknown | null;
  approvedBy?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
  // NO wallet / balance / pricing / earnings fields — concept D is deferred.
};

// Who controls a delivery person.
//   YOMICO  -> YOMICO's own workforce; companyId is null; self-registers and is
//              approved by YOMICO; YOMICO Admin assigns their jobs.
//   COMPANY -> an external company's employee; companyId is required; the
//              company creates, controls and assigns them. Admin never does.
export type DeliveryProviderType = "YOMICO" | "COMPANY";

// Approval / eligibility state — DISTINCT from operational availability.
export type DeliveryAccountStatus = "Pending" | "Active" | "Suspended";

// Operational state — set by the person (Available/Offline) or the engine
// (Busy while holding an active leg). Never conflated with accountStatus.
export type DeliveryAvailability = "Available" | "Offline" | "Busy";

// Deprecated legacy field, kept as a compatibility alias for ONE transition
// phase (locked decision 5). New code reads accountStatus; this shadows it.
export type DeliveryPersonStatus = "Active" | "Inactive";

// Physical role within a COMPANY workforce (four-actor COMPANY_HUB model,
// Phase 1). Server-owned — NEVER trusted from a client body; every route that
// creates/reads a person derives or defaults this itself.
//   RIDER      -> moves a parcel between two points (seller<->hub, hub<->
//                 customer). Every existing/legacy person (incl. ALL YOMICO
//                 persons, which are never hub staff) is a RIDER; a doc with no
//                 `role` at all defaults to RIDER for backward compatibility.
//   HUB_PERSON -> stationed AT one specific DeliveryHub (hubId REQUIRED, never
//                 optional) to receive parcels handed to that hub. Only ever
//                 valid for a COMPANY person.
export type DeliveryPersonRole = "RIDER" | "HUB_PERSON";

// Collection: deliveryPersons/{personId}
// personId REUSES the existing deliveryPartners doc id on migration, so
// orders.deliveryPartnerId references stay valid.
export type DeliveryPerson = {
  providerType: DeliveryProviderType;
  // Ownership boundary for COMPANY persons; MUST be null for YOMICO persons.
  // The mutual-exclusion invariant (providerType/companyId) is enforced
  // server-side on create — never trusted from a client body.
  companyId: string | null;
  // Absent on every legacy/YOMICO doc => treated as RIDER (see
  // DeliveryPersonRole). Only a COMPANY person may ever be "HUB_PERSON".
  role?: DeliveryPersonRole;
  // REQUIRED (and only meaningful) when role is "HUB_PERSON": the one
  // DeliveryHub this person is stationed at. MUST be null/absent for a RIDER
  // and for every YOMICO person — never optional-but-empty for a hub person.
  hubId?: string | null;
  uid: string; // Firebase Auth uid (preserved on migration)
  name: string;
  phone: string;
  email: string;
  vehicleType?: string;
  vehicleNumber?: string;
  serviceArea?: string;
  city?: string;
  accountStatus: DeliveryAccountStatus;
  availability: DeliveryAvailability;
  approvedBy?: string; // YOMICO admin uid, for YOMICO persons
  approvedAt?: unknown | null;
  createdBy: string; // company uid | "yomico-admin" | "self-register" | "admin-migrated"
  // Deprecated compatibility alias (one phase). Mirrors accountStatus:
  // Active<->Active, Suspended<->Inactive. Do not read in new code.
  status?: DeliveryPersonStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};

// What the server resolves a caller into. No money, no PII beyond the actor's
// own business identity. `none` = a signed-in user who is neither.
export type DeliveryActorRole = "company" | "person" | "none";

export type DeliveryActor =
  | { role: "company"; uid: string; companyId: string; company: DeliveryCompany & { id: string } }
  | {
      role: "person";
      uid: string;
      providerType: DeliveryProviderType;
      companyId: string | null; // null for YOMICO persons
      personId: string;
      person: DeliveryPerson & { id: string };
    }
  | { role: "none"; uid: string };

// Fields a COMPANY may set when registering one of its own persons. The server
// always overrides providerType ("COMPANY"), companyId (from the caller) and
// createdBy — never trusted from the body.
export type DeliveryPersonInput = {
  uid: string;
  name: string;
  phone: string;
  email: string;
  vehicleType?: string;
  vehicleNumber?: string;
  serviceArea?: string;
  city?: string;
  // Optional; server defaults to "RIDER" when omitted. "HUB_PERSON" REQUIRES
  // hubId — the server rejects one without the other (see company/persons).
  role?: DeliveryPersonRole;
  hubId?: string | null;
};

// ===========================================================================
// Delivery Engine — Phase 2B-1 operational data model (types only).
//
// Distinct concepts, deliberately not merged:
//   shipmentNumber  = permanent PHYSICAL shipment identity (TRCK…), minted once
//                     at confirm-order; carried here, never regenerated.
//   DeliveryJob     = YOMICO operational shipment record (one per order+vendor).
//   DeliveryLeg     = ONE physical movement / custody segment of a job.
//   DeliveryPerson  = the party responsible for a particular leg.
// A job may contain multiple legs and multiple people over its lifetime.
//
// NO financial fields exist on any of these — no wallet, earnings, pricing,
// commission, settlement, and (in 2B-1) no COD/payment fields yet. Customer
// payment is never routed to a delivery company.
// ===========================================================================

// Full status set declared for forward-compat.
//   2B-1/2B-2 SET only "Created". 2B-3 (provider assignment) additionally SETS
//   "AssignedToYomico" (Admin assigned a YOMICO person), "OfferedToCompany"
//   (Admin handed off; awaiting the company's own person), "AssignedToCompany"
//   (the company assigned its own person) and "RejectedByCompany" (company
//   declined a handoff). "InProgress" is reserved for the LATER physical
//   execution phase and is NOT set by assignment — assignment is not custody.
export type DeliveryJobStatus =
  | "Created"
  | "OfferedToCompany"
  | "AssignedToYomico"
  | "AssignedToCompany"
  | "InProgress"
  | "Delivered"
  | "RejectedByCompany"
  | "DeliveryFailed"
  | "Returned"
  | "Cancelled";

export type DeliveryLegType =
  | "Pickup"
  | "LineHaul"
  | "HubIntake"
  | "HubHandover"
  | "FinalMile";

export type DeliveryLegStatus =
  | "LegCreated"
  | "Assigned"
  | "Started"
  | "PickedUp"
  | "InTransit"
  | "ArrivedAtStage"
  | "HandoverInitiated"
  | "HandoverConfirmed"
  | "OutForDelivery"
  | "Delivered"
  | "Failed"
  | "Rescheduled";

export type DeliveryEventRole = "admin" | "company" | "person" | "system";

// ===========================================================================
// Phase 2B-4 — physical execution & custody (types only).
//
// Custody is DISTINCT from assignment (2B-3) and from location evidence. A leg
// can be "Assigned" with the parcel still at the seller; only a pickup SCAN
// moves custody to a person. Custody changes ONLY via PICKUP, HANDOVER_CONFIRM
// and DELIVER — never by editing assignedPersonId directly (decision M7).
// Still NO money/inventory/earnings/settlement fields — ever.
// ===========================================================================

// Who physically holds/answers for the parcel right now.
export type CustodyHolderKind = "SELLER" | "YOMICO" | "COMPANY" | "CUSTOMER";

export type CustodyState = {
  holderKind: CustodyHolderKind | null;
  personId: string | null; // the delivery person holding it, when in a person's hands
  companyId: string | null;
  // Set only when the parcel is parked at a COMPANY hub (holderKind "COMPANY",
  // personId null) — i.e. custody is at a physical hub location, not in a
  // person's hands. Null in every other custody state. A hub is a custody
  // LOCATION, never a human actor.
  hubId?: string | null;
  since?: unknown | null;
  sinceEventId?: string | null; // the scan event that established this custody
};

// Physical scan actions the Delivery App may request.
export type ExecutionAction =
  | "PICKUP"
  | "DEPART"
  | "ARRIVE"
  | "OUT_FOR_DELIVERY"
  | "HANDOVER_INITIATE"
  | "HANDOVER_CONFIRM"
  | "DELIVER"
  | "ATTEMPT_FAILED"
  | "EXCEPTION";

export type DeliveryExceptionCode =
  | "SELLER_UNAVAILABLE"
  | "CUSTOMER_UNAVAILABLE"
  | "DAMAGED_PACKAGE"
  | "WRONG_PACKAGE"
  | "WRONG_SHIPMENT_SCAN"
  | "FAILED_PICKUP"
  | "FAILED_DELIVERY"
  | "HANDOVER_TIMEOUT"
  | "PERSON_UNAVAILABLE"
  // Delivery Failure/Exception Handling V1 — rider-reported customer-delivery
  // attempt reasons (see lib/deliveryEngine/deliveryException.ts). CUSTOMER_
  // UNAVAILABLE above is reused as-is; these four are additive.
  | "CUSTOMER_REFUSED"
  | "ADDRESS_PROBLEM"
  | "COD_PAYMENT_FAILED"
  | "OTP_VERIFICATION_FAILED"
  | "OTHER";

// Proof captured at a custody-changing scan. scan+timestamp+actor+geo are the
// core; photo/signature are optional/future; otpVerified gates final delivery.
export type ProofRecord = {
  eventId: string;
  at: unknown;
  actorUid: string;
  geo?: { lat: number; lng: number } | null;
  geoAccuracy?: number | null;
  photoPath?: string | null;
  signaturePath?: string | null;
  otpVerified?: boolean;
};

// Proof-of-Delivery (POD) foundation — Part 1. A durable, server-derived
// summary written on the SAME job-level write as the DELIVER transition
// (execution.ts), never a second custody mutation or a second event. Every
// value is derived from the authenticated actor, the current leg, or the
// order doc — NEVER from the client request. Deliberately amount-free
// (codPaymentStatus/codPaymentReference only — never an amount), matching the
// no-financial-fields boundary the rest of this file already documents for
// every other DeliveryJob field (see jobFactory.ts's assertNoFinancialFields).
export type DeliveryPod = {
  deliveredAt: unknown; // server Timestamp — never the client's capturedAt
  deliveredByPersonId: string;
  eventId: string; // the DELIVER DeliveryEvent's id — the durable audit reference
  legId: string;
  otpVerified: true; // DELIVER only ever writes this once OTP verification succeeded
  // Present only for a PAY_ON_DELIVERY_UPI order — the order's own
  // paymentStatus/paymentTransactionId AT THE MOMENT of delivery (see
  // codPayment.ts for what these values mean). Null for a non-COD order.
  codPaymentStatus?: string | null;
  codPaymentReference?: string | null;
};

// Two-sided custody handover between two delivery people (relay, or a future
// inter-leg handover). Custody transfers only on Confirmed by the incoming party.
export type LegHandover = {
  state: "Initiated" | "Confirmed" | "Cancelled";
  fromPersonId: string;
  toKind: DeliveryProviderType;
  toCompanyId: string | null;
  toPersonId: string;
  initiatedAt: unknown;
  initiatedEventId: string;
  confirmedAt?: unknown | null;
  confirmedEventId?: string | null;
};

// Two-actor ORIGIN HUB handover (four-actor COMPANY_HUB model, Phase 1):
//   Rider 1 (fromPersonId)  "I am handing this shipment to the Origin Hub."
//   Origin Hub Person       "I received this shipment." (confirmedByPersonId)
// Deliberately NOT the generic LegHandover above: LegHandover requires a
// specific NAMED toPersonId chosen by the outgoing party, but Rider 1 does not
// choose which Hub Person receives it — ANY eligible person stationed at the
// target hub may confirm. state "Initiated" => the parcel is still physically
// in Rider 1's custody (custody is UNCHANGED); only "Confirmed" moves custody
// to COMPANY at the hub. fromPersonName is denormalized (mirrors
// assignedPersonName elsewhere) purely so the receiving Hub Person's task list
// needs no extra read.
export type OriginHubHandover = {
  state: "Initiated" | "Confirmed";
  hubId: string;
  fromPersonId: string;
  fromPersonName: string;
  initiatedAt: unknown;
  initiatedEventId: string;
  confirmedByPersonId?: string | null;
  confirmedAt?: unknown | null;
  confirmedEventId?: string | null;
};

// Two-actor DESTINATION HUB -> RIDER 2 handover (four-actor COMPANY_HUB model,
// Phase 2):
//   Destination Hub Person (fromPersonId)  "I am handing this shipment to Rider 2."
//   Rider 2                                "I received this shipment."
// Unlike OriginHubHandover, the receiving party here IS already named — Rider 2
// was selected by the dispatcher (applyFinalMileAssignment) BEFORE this handover
// starts, and that selection is recorded as the leg's own assignedPersonId, so
// this type deliberately carries no separate toPersonId (one source of truth:
// leg.assignedPersonId). state "Initiated" => custody is UNCHANGED (still
// parked at the hub, holderKind COMPANY / personId null); only "Confirmed"
// moves custody to Rider 2. fromPersonName is denormalized purely for a
// self-contained audit record on the leg.
export type DestinationHandover = {
  state: "Initiated" | "Confirmed";
  hubId: string;
  fromPersonId: string;
  fromPersonName: string;
  initiatedAt: unknown;
  initiatedEventId: string;
  confirmedByPersonId?: string | null;
  confirmedAt?: unknown | null;
  confirmedEventId?: string | null;
};

export type LegException = {
  code: DeliveryExceptionCode;
  state: "Open" | "Resolved";
  at: unknown;
  eventId: string;
  notes?: string | null;
  resolution?: string | null;
};

// Who currently holds custody responsibility for a job/leg. Null on a freshly
// created job/leg (no provider assigned yet). providerType null == unassigned.
export type ResponsibleParty = {
  kind: DeliveryProviderType;
  companyId: string | null;
  personId: string | null;
};

// Minimal, non-financial parcel description (names + quantities only).
export type DeliveryParcelItem = { name: string; qty: number };

// Collection: deliveryJobs/{jobId}   jobId = `${orderId}_${vendorId}`
export type DeliveryJob = {
  orderId: string;
  orderNumber: string;
  vendorId: string;
  vendorName: string;
  sellerOrderId: string; // == jobId; explicit link to sellerOrders
  shipmentNumber: string; // this PARCEL's permanent tracking number (minted per job)
  orderShipmentNumber: string; // audit ref to the order-level shipment number
  // Provider ownership. NULL at Created — no provider chosen yet. When set
  // later, the invariant is COMPANY => companyId != null, YOMICO => companyId
  // == null (see assertProviderInvariant in jobFactory).
  providerType: DeliveryProviderType | null;
  companyId: string | null;
  status: DeliveryJobStatus;
  currentLegId: string | null;
  currentStage: string; // e.g. "AwaitingHandoff" at Created
  responsibleParty: ResponsibleParty | null;
  lastEventId: string | null;
  lastEventAt: unknown | null;
  // Seller pickup location, SNAPSHOTTED from the vendor's own profile at job
  // creation (materialize) — never re-read from the vendor doc afterward, so a
  // later change to the vendor's address does not alter an existing job.
  pickup: { sellerName: string; street: string; unit: string; city: string; state: string; zipCode: string };
  drop: { customerName: string; phone: string; address: string; slot: string | null };
  parcel: { items: DeliveryParcelItem[] };
  attemptCount: number;
  // 2B-3 assignment snapshot — denormalized so a reader (esp. YOMICO Admin
  // viewing a COMPANY job) sees WHO currently holds the job without a second
  // read. Written by the assignment helpers only; absent on a freshly created
  // (unassigned) job. Cleared/overwritten on reassignment, handoff and reject.
  // assignedPersonId mirrors the current leg's assignedPersonId.
  assignedPersonId?: string | null;
  assignedPersonName?: string | null;
  assignedPersonPhone?: string | null;
  assignedCompanyName?: string | null; // set on a COMPANY handoff/assignment
  assignedAt?: unknown | null;
  assignedBy?: string | null; // actor uid that performed the assignment
  // 2B-4 execution/custody. scanToken is the opaque QR secret, minted once at
  // job creation and stable for the shipment's life (all legs share it). It is
  // server-only and MUST NOT be returned by ordinary job reads — only by the
  // dedicated QR endpoint. custody mirrors the current leg's custody.
  scanToken?: string;
  custody?: CustodyState | null;
  executionStartedAt?: unknown | null; // first pickup (custody acquired)
  // COMPANY_HUB journey (multi-leg). Set by the origin-hub-intake transition when
  // the first-mile custody is received into the company's origin hub. currentHubId
  // mirrors custody.hubId for the hub the parcel is currently parked at;
  // originHubIntakeAt is the denormalised timestamp the customer tracking uses
  // for the "at origin hub" milestone. Absent for YOMICO DIRECT jobs.
  currentHubId?: string | null;
  originHubIntakeAt?: unknown | null;
  // Four-actor origin-hub handover (Phase 1) — a TRANSIENT task-queue marker,
  // set by the handover-initiate transition and cleared (null) by the
  // handover-confirm transition. Mirrors the current leg's originHubHandover
  // ONLY while state is "Initiated"; this is what a HUB_PERSON's task query
  // (my-hub-tasks) filters on — deliberately separate from assignedPersonId so
  // a hub person never appears in a rider's /my-jobs query. Absent/null once
  // there is no outstanding origin-hub handover awaiting receipt.
  pendingOriginHubHandover?: OriginHubHandover | null;
  // COMPANY_HUB journey — transit / line-haul. Set by the transit-departure
  // transition when the parcel leaves the origin hub into line-haul. originHubId
  // preserves the origin hub after the parcel has left it (currentHubId becomes
  // null while in transit — it is not AT any hub). transitStartedAt is the
  // denormalised timestamp the customer tracking uses for the "in transit"
  // milestone.
  originHubId?: string | null;
  transitStartedAt?: unknown | null;
  // COMPANY_HUB journey — destination hub.
  //
  // PHASE 5: destinationHubId is now set by the TRANSIT-DEPARTURE transition
  // (transit.ts), as an explicit, server-validated DISPATCHER decision — the
  // only authoritative, non-guessed source (never derived from hub count,
  // city/address text, or geocoding). It is METADATA: the INTENDED
  // destination, established before the parcel ever moves. This is DISTINCT
  // from custody.hubId (the physical CURRENT hub location, null throughout
  // transit) and from currentHubId (mirrors custody.hubId) — destinationHubId
  // does not change either of those and is not itself custody.
  //
  // The destination-hub-receipt transition (destinationHub.ts) later
  // re-validates that the receiving Hub Person's own hub matches this exact
  // field (rejecting a mismatched hub) rather than establishing it for the
  // first time — except for a job that entered transit before this field
  // existed, where receipt still establishes it once, for backward
  // compatibility. destinationHubReceivedAt is the denormalised timestamp
  // customer tracking uses for the "at destination hub" milestone. Final-mile
  // is a later slice — NOT set here.
  destinationHubId?: string | null;
  destinationHubReceivedAt?: unknown | null;
  // COMPANY_HUB journey — final-mile assignment. Set by the final-mile-assignment
  // transition when the company DISPATCHER (the server-authoritative company
  // actor) assigns an eligible company delivery person to carry the parcel from
  // the destination hub to the customer, and custody is handed from the hub to
  // that person. This is ASSIGNMENT + a hub→person custody handover, NOT
  // departure: OutForDelivery / customer delivery are later slices and are NOT
  // set here. finalMileAssignedAt is the denormalised timestamp customer tracking
  // uses for the "assigned for final delivery" milestone. Absent for DIRECT jobs.
  finalMileAssignedAt?: unknown | null;
  deliveredAt?: unknown | null;
  // Set by a rider-reported customer-delivery exception (Delivery Failure/
  // Exception Handling V1 — see deliveryException.ts). Reused for its
  // obvious intended purpose; never written anywhere else today.
  failedAt?: unknown | null;
  // Most recent customer-delivery exception a final-mile rider reported.
  // Mirrors the current leg's own `exception` (LegException) for convenience
  // — NOT a second source of truth; both are written in the SAME
  // transaction. Persists across a later reattempt (a subsequent
  // OUT_FOR_DELIVERY does not clear it) as a simple "last reported issue"
  // audit trail; never read to gate any transition itself.
  lastDeliveryException?: {
    code: DeliveryExceptionCode;
    reportedAt: unknown;
    reportedByPersonId: string;
    note?: string | null;
    eventId: string;
  } | null;
  // 2B-5: set by the commerce-owned reconciliation (NOT by the Delivery Engine
  // scan path) once a Delivered job has been reflected into its sellerOrder /
  // order. Its presence is the idempotency/retry marker: unset on a Delivered
  // job means reconciliation still owes a (safe, repeatable) retry.
  commerceReconciledAt?: unknown | null;
  // Customer delivery-OTP (2B-5D). Stored HASHED ONLY (HMAC-SHA256 under a
  // server-only secret) — the plaintext is never persisted. Issued when the
  // parcel enters OutForDelivery, verified at DELIVER; unset => delivery cannot
  // be confirmed (fails closed). These are NEVER returned by any API/projection
  // (job/admin/seller/customer), never in the QR, and never reach Expo. NOT money.
  deliveryOtpHash?: string | null;
  deliveryOtpIssuedAt?: unknown | null;
  deliveryOtpAttempts?: number | null;
  // POD foundation — Part 1. Set ONCE, only by the DELIVER transition in
  // execution.ts, alongside status/deliveredAt on that SAME write. See
  // DeliveryPod above. Absent on every job that has not yet been Delivered.
  pod?: DeliveryPod | null;
  createdAt?: unknown;
  updatedAt?: unknown;
  // NO cod/payment AMOUNT fields ever (see DeliveryPod above for the one
  // exception: a non-amount payment STATE/REFERENCE snapshot at delivery
  // time), NO agreedCost/wallet/earnings/settlement/pricing/commission — ever.
};

// Collection: deliveryJobs/{jobId}/legs/{legId}
export type DeliveryLeg = {
  jobId: string;
  shipmentNumber: string;
  sequence: number; // 1 for the initial Pickup leg
  type: DeliveryLegType;
  providerType: DeliveryProviderType | null; // null until assigned
  companyId: string | null;
  assignedPersonId: string | null;
  status: DeliveryLegStatus; // "LegCreated" at creation; "Assigned" once a person is set
  from: { stage: string };
  to: { stage: string };
  // 2B-3 assignment snapshot on the leg (mirrors the job). Absent until assigned.
  assignedPersonName?: string | null;
  assignedAt?: unknown | null;
  assignedBy?: string | null;
  // 2B-4 execution/custody. custody is null (or SELLER) until pickup; then the
  // holding person; then CUSTOMER on delivery. handover/proof/exception are
  // populated by execution scans. attemptCount counts delivery attempts.
  custody?: CustodyState | null;
  handover?: LegHandover | null;
  // Four-actor origin-hub handover (Phase 1) — the PERMANENT audit record on
  // the Pickup leg. Distinct from `handover` above (the generic person->named
  // -person relay), never the other's shape. Absent on any leg that never goes
  // through an origin-hub handover (YOMICO Direct, and every leg after Pickup).
  originHubHandover?: OriginHubHandover | null;
  // Four-actor destination-hub -> Rider 2 handover (Phase 2) — the PERMANENT
  // audit record on the FinalMile leg. Distinct from both `handover` and
  // `originHubHandover`. Absent on any leg that never goes through this
  // handover (YOMICO Direct, and every leg before the FinalMile leg).
  destinationHandover?: DestinationHandover | null;
  proof?: { pickup?: ProofRecord | null; delivery?: ProofRecord | null } | null;
  exception?: LegException | null;
  attemptCount?: number;
  createdAt?: unknown;
  updatedAt?: unknown;
};

// Collection: deliveryEvents/{eventId}  — append-only, server-write-only.
export type DeliveryEvent = {
  jobId: string;
  legId: string | null;
  shipmentNumber: string;
  actorUid: string;
  role: DeliveryEventRole;
  providerType: DeliveryProviderType | null;
  companyId: string | null;
  action: string; // "JobCreated" in 2B-1; assignment actions in 2B-3 (see below)
  fromStage: string | null;
  toStage: string;
  // 2B-3 assignment audit: the status transition and the person involved.
  // Assignment is NOT custody, so fromStage/toStage stay the current physical
  // stage (unchanged); the status change is recorded here instead.
  fromStatus?: string | null;
  toStatus?: string | null;
  personId?: string | null;
  // 2B-4 execution evidence. `at` is the AUTHORITATIVE server timestamp;
  // capturedAt is the device time (evidence only, may be offline/older).
  capturedAt?: unknown | null;
  geoAccuracy?: number | null; // metres; supporting evidence only
  deviceId?: string | null;
  handoverRole?: "outgoing" | "incoming" | null;
  exceptionCode?: DeliveryExceptionCode | null;
  custodyToKind?: CustodyHolderKind | null;
  // COMPANY_HUB journey: the hub a custody-to-hub transition (e.g. origin-hub
  // intake) parked the parcel at. Audit only; null for non-hub events.
  hubId?: string | null;
  // Denormalized from the job for a customer-delivery exception report (see
  // deliveryException.ts) — lets a future order-level projection query "all
  // exceptions for this order" without joining through jobId. Audit only;
  // absent on every event that isn't a delivery-exception report.
  orderId?: string | null;
  at?: unknown;
  geo?: { lat: number; lng: number } | null;
  notes?: string | null;
  photoPath?: string | null;
  clientEventId?: string | null; // offline idempotency key for scans
};

// ===========================================================================
// COMPANY_HUB journey — physical hub entity (a custody LOCATION, not an actor).
//
// Collection: deliveryHubs/{hubId}. Server-managed only (firestore.rules keep it
// client-unreadable/unwritable; admin/company access is via server APIs that
// scope by companyId). A hub belongs to exactly ONE company; cross-company
// access is never permitted. NO money/capacity/routing-graph fields here — this
// is the minimum needed to receive first-mile custody into an origin hub.
// ===========================================================================
export type DeliveryHubStatus = "Active" | "Inactive";

export type DeliveryHub = {
  companyId: string; // owning company — authorization is always scoped to this
  name: string;
  city?: string;
  region?: string;
  // Optional real street address, for the V1 navigation feature only (see
  // lib/deliveryEngine/taskLocation.ts's deriveNavigationDestination). Absent
  // on every hub created before this field existed and NEVER backfilled/
  // geocoded automatically — a hub with no address here honestly reports
  // navigation as unavailable rather than guessing one.
  address?: string;
  status: DeliveryHubStatus;
  createdBy?: string; // admin uid that provisioned it
  createdAt?: unknown;
  updatedAt?: unknown;
};
