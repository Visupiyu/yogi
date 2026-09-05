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

// Full status set declared for forward-compat; 2B-1 only ever SETS "Created".
export type DeliveryJobStatus =
  | "Created"
  | "OfferedToCompany"
  | "AssignedToYomico"
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
  shipmentNumber: string; // permanent physical identity (from the order)
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
  status: DeliveryLegStatus; // "LegCreated" at creation
  from: { stage: string };
  to: { stage: string };
  handover: null; // populated in a later sub-phase
  proof: null; // populated in a later sub-phase
  exception: null; // populated in a later sub-phase
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
  action: string; // "JobCreated" in 2B-1
  fromStage: string | null;
  toStage: string;
  at?: unknown;
  geo?: { lat: number; lng: number } | null;
  notes?: string | null;
  photoPath?: string | null;
  clientEventId?: string | null; // offline idempotency key for future scans
};
