// ---------------------------------------------------------------------------
// YOMICO Delivery Engine — Phase 1 foundation types.
//
// SCOPE: delivery companies + delivery persons + their identity/ownership.
// NOT in Phase 1: deliveryJobs lifecycle, payment collection, and DELIBERATELY
// NO money model at all — no wallet, balance, payout, settlement, or earnings
// fields exist on any type here. Any future delivery-company payment is a
// separate YOMICO settlement/payable; customer payment is NEVER routed to a
// delivery company.
//
// These mirror the approved field-by-field schema. Kept dependency-free so both
// server routes and (later) client code can import them.
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

export type DeliveryPersonStatus = "Active" | "Inactive";

// Collection: deliveryPersons/{personId}
// personId REUSES the existing deliveryPartners doc id on migration, so
// orders.deliveryPartnerId references stay valid.
export type DeliveryPerson = {
  companyId: string; // ownership boundary — every check keys on this
  uid: string; // Firebase Auth uid (preserved on migration)
  name: string;
  phone: string;
  email: string;
  vehicleType?: string;
  vehicleNumber?: string;
  serviceArea?: string;
  status: DeliveryPersonStatus;
  createdBy: string; // company uid, or "admin-migrated" for the 2 existing ones
  createdAt?: unknown;
  updatedAt?: unknown;
};

// What the server resolves a caller into. No money, no PII beyond the actor's
// own business identity. `none` = a signed-in user who is neither.
export type DeliveryActorRole = "company" | "person" | "none";

export type DeliveryActor =
  | { role: "company"; uid: string; companyId: string; company: DeliveryCompany & { id: string } }
  | { role: "person"; uid: string; companyId: string; personId: string; person: DeliveryPerson & { id: string } }
  | { role: "none"; uid: string };

// The fields a company may set when registering one of its own persons. The
// server always overrides companyId (from the caller) and createdBy — never
// trusted from the body.
export type DeliveryPersonInput = {
  uid: string;
  name: string;
  phone: string;
  email: string;
  vehicleType?: string;
  vehicleNumber?: string;
  serviceArea?: string;
};
