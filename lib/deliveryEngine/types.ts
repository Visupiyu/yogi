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

// Collection: deliveryPersons/{personId}
// personId REUSES the existing deliveryPartners doc id on migration, so
// orders.deliveryPartnerId references stay valid.
export type DeliveryPerson = {
  providerType: DeliveryProviderType;
  // Ownership boundary for COMPANY persons; MUST be null for YOMICO persons.
  // The mutual-exclusion invariant (providerType/companyId) is enforced
  // server-side on create — never trusted from a client body.
  companyId: string | null;
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
  | "PERSON_UNAVAILABLE";

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
  pickup: { sellerName: string; area: string };
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
  // COMPANY_HUB journey — transit / line-haul. Set by the transit-departure
  // transition when the parcel leaves the origin hub into line-haul. originHubId
  // preserves the origin hub after the parcel has left it (currentHubId becomes
  // null while in transit — it is not AT any hub). transitStartedAt is the
  // denormalised timestamp the customer tracking uses for the "in transit"
  // milestone. Destination hub is intentionally NOT represented yet.
  originHubId?: string | null;
  transitStartedAt?: unknown | null;
  // COMPANY_HUB journey — destination hub. Set by the destination-hub-receipt
  // transition when the line-haul person delivers the parcel into the (explicitly
  // requested, server-validated) destination hub. There is no persisted
  // destination-routing source today, so this hub is never auto-selected — it is
  // provided by the authorized receiving actor and validated. destinationHubId
  // also becomes currentHubId once received; destinationHubReceivedAt is the
  // denormalised timestamp customer tracking uses for the "at destination hub"
  // milestone. Final-mile is a later slice — NOT set here.
  destinationHubId?: string | null;
  destinationHubReceivedAt?: unknown | null;
  deliveredAt?: unknown | null;
  failedAt?: unknown | null;
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
  createdAt?: unknown;
  updatedAt?: unknown;
  // NO cod/payment fields (payment sub-phase), NO agreedCost/wallet/earnings/
  // settlement/pricing/commission — ever.
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
  status: DeliveryHubStatus;
  createdBy?: string; // admin uid that provisioned it
  createdAt?: unknown;
  updatedAt?: unknown;
};
