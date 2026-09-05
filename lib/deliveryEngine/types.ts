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
