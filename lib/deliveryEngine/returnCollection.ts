// SERVER-ONLY. Return Collection V1 — reverse-logistics delivery job.
//
// The website/backend owns the AUTHORITATIVE item-level return FSM on
// `itemRequests` (REQUESTED → … → PICKUP_ASSIGNED → PICKED_UP →
// RECEIVED_BY_YOMICO → SELLER_INSPECTION → REFUND_PENDING → REFUNDED). This
// module does NOT replace or re-implement that FSM. It adds the OPERATIONAL
// collection job the Delivery App executes, and only advances the two return
// stages that are the physical collection milestones — PICKED_UP (on
// collection) and RECEIVED_BY_YOMICO (on receipt at the return destination) —
// each guarded so it can only advance from the exact expected prior state.
// Refund, seller inspection and every other stage stay with the website.
//
// This is a DEDICATED collection (returnCollectionJobs), reusing the engine's
// PATTERNS (custody, deliveryEvents audit, emitDeliveryNotification, the
// assignment eligibility validators) and the SHARED deliveryEvents /
// notifications collections — but never touching the forward deliveryJobs
// collection or any forward read-path, so the forward-delivery workflow is
// wholly unaffected.
//
// No financial fields ever (assertNoFinancialFields, defence in depth). Refund
// amount / customer uid / seller uid / status are NEVER trusted from a client:
// everything is re-derived from the authoritative itemRequests + order docs.
import type { Transaction, Firestore, DocumentReference } from "firebase-admin/firestore";
import { Timestamp, FieldValue } from "firebase-admin/firestore";
import type {
  CustodyState,
  DeliveryEvent,
  DeliveryPerson,
  DeliveryProviderType,
} from "@/lib/deliveryEngine/types";
import {
  assertPersonAssignable,
  assertYomicoPerson,
  assertCompanyPerson,
  assertRiderPerson,
  hasOtherActiveJobs,
  releaseAfterLosingJob,
} from "@/lib/deliveryEngine/assignment";
import { assertNoFinancialFields } from "@/lib/deliveryEngine/jobFactory";
import { emitDeliveryNotification } from "@/lib/deliveryEngine/notifications";

// ---- status FSM (operational; distinct from the website itemRequests FSM) ---
export type ReturnJobStatus =
  | "Assigned" // created + a delivery person assigned; parcel still with customer
  | "OutForCollection" // person en route to the customer
  | "Collected" // picked up from the customer (custody with the person)
  | "Received" // handed to the seller / return destination (terminal success)
  | "CollectionFailed" // an attempt failed — recoverable, never auto-cancels the return
  | "Cancelled"; // terminal

const PRE_COLLECTION: ReadonlySet<string> = new Set([
  "Assigned",
  "OutForCollection",
  "CollectionFailed",
]);

// The one website return stage from which an operational collection job may be
// created, and the two stages this module is allowed to advance the return to.
const REQUIRED_ITEM_REQUEST_STATUS = "PICKUP_ASSIGNED";
const ITEM_STATUS_ON_COLLECTED = "PICKED_UP";
const ITEM_STATUS_ON_RECEIVED = "RECEIVED_BY_YOMICO";

// Runtime-checkable list backing ReturnExecutionAction — the HTTP execution
// route validates an incoming action against this SAME array (never a second,
// hand-typed copy of the engine's own action vocabulary).
export const RETURN_EXECUTION_ACTIONS = ["start", "collect", "receive", "exception"] as const;
export type ReturnExecutionAction = (typeof RETURN_EXECUTION_ACTIONS)[number];

// Customer-safe return-collection exception reasons (a subset that maps to the
// engine's own DeliveryExceptionCode vocabulary; validated in the route).
export const RETURN_EXCEPTION_CODES = [
  "CUSTOMER_UNAVAILABLE",
  "CUSTOMER_REFUSED",
  "ADDRESS_PROBLEM",
  "DAMAGED_PACKAGE",
  "WRONG_PACKAGE",
  "OTHER",
] as const;
export type ReturnExceptionCode = (typeof RETURN_EXCEPTION_CODES)[number];

export class ReturnCollectionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ReturnCollectionError";
    this.status = status;
  }
}

function str(v: unknown, max = 500): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

/** Deterministic job id: one collection job per return request. Idempotent. */
export function returnJobId(returnRequestId: string): string {
  return `rc_${returnRequestId}`;
}

// ---- shapes read off the authoritative itemRequests doc --------------------
type ItemRequestData = {
  type?: string;
  status?: string;
  userId?: string;
  vendorId?: string;
  orderId?: string;
  itemKey?: string;
  requestNumber?: string;
  customerName?: string;
  reason?: string;
  item?: { name?: string; qty?: number; size?: string; color?: string };
  pickup?: { scheduledAt?: Timestamp | null };
  history?: unknown[];
};

// A denormalized snapshot the route reads OUTSIDE the transaction (content
// only — never gates correctness): the customer's pickup location (from the
// order) and the return destination (the seller's address).
export type ReturnJobSnapshot = {
  orderNumber: string;
  customerPickup: { customerName: string; phone: string; address: string; slot: string | null };
  destination: { name: string; street: string; unit: string; city: string; state: string; zipCode: string };
};

function writeReturnEvent(
  tx: Transaction,
  db: Firestore,
  args: {
    returnJobId: string;
    shipmentRef: string; // display ref (requestNumber/orderNumber) — audit only
    actorUid: string;
    role: DeliveryEvent["role"];
    providerType: DeliveryProviderType | null;
    companyId: string | null;
    personId: string | null;
    action: string;
    fromStage: string;
    toStage: string;
    orderId: string | null;
    exceptionCode?: string | null;
    notes?: string | null;
    now: Timestamp;
    eventId?: string; // deterministic id for one-shot transitions; else server id
  }
): string {
  const eventRef = args.eventId
    ? db.collection("deliveryEvents").doc(args.eventId)
    : db.collection("deliveryEvents").doc();
  const event: DeliveryEvent = {
    jobId: args.returnJobId, // rc_… — never collides with a forward deliveryJobs id
    legId: null,
    shipmentNumber: args.shipmentRef,
    actorUid: str(args.actorUid, 128),
    role: args.role,
    providerType: args.providerType,
    companyId: args.companyId,
    action: args.action,
    fromStage: args.fromStage,
    toStage: args.toStage,
    personId: args.personId,
    orderId: args.orderId,
    exceptionCode: (args.exceptionCode as DeliveryEvent["exceptionCode"]) ?? null,
    at: args.now,
    geo: null,
    notes: args.notes ?? null,
    photoPath: null,
    clientEventId: null,
  };
  tx.set(eventRef, event, { merge: true });
  return eventRef.id;
}

// ===========================================================================
// Resolve the ReturnJobSnapshot an admin/company route needs BEFORE calling
// createOrAssignReturnJob (which, per its own contract, reads it OUTSIDE the
// transaction — see the ReturnJobSnapshot doc comment above). Read-only;
// invents nothing and re-derives no FSM decision — it only copies the same
// order/vendor fields the FORWARD job builder already copies verbatim
// (see jobFactory.ts's buildDeliveryJob: order.customerName/phone/address for
// the customer side, the vendor doc's street/unit/city/state/zipCode for the
// seller side), just with pickup/destination reversed for the reverse leg.
// No slot/appointment label exists on itemRequests beyond the Timestamp
// createOrAssignReturnJob already reads itself (req.pickup.scheduledAt), so
// customerPickup.slot is honestly left null rather than reusing the
// forward-delivery order.deliverySlot (a different appointment entirely).
export async function resolveReturnJobSnapshot(
  db: Firestore,
  returnRequestId: string
): Promise<ReturnJobSnapshot> {
  const itemSnap = await db.collection("itemRequests").doc(returnRequestId).get();
  if (!itemSnap.exists) throw new ReturnCollectionError("Return request not found.", 404);
  const req = itemSnap.data() as ItemRequestData;

  const orderId = typeof req.orderId === "string" ? req.orderId : "";
  if (!orderId) throw new ReturnCollectionError("This return request has no associated order.", 409);
  const orderSnap = await db.collection("orders").doc(orderId).get();
  if (!orderSnap.exists) throw new ReturnCollectionError("Order not found.", 404);
  const order = orderSnap.data() as {
    orderNumber?: unknown;
    customerName?: unknown;
    phone?: unknown;
    address?: unknown;
  };

  const vendorId = typeof req.vendorId === "string" ? req.vendorId : "";
  let vendorName = "";
  let vendorAddress: { street?: unknown; unit?: unknown; city?: unknown; state?: unknown; zipCode?: unknown } = {};
  if (vendorId) {
    try {
      const vq = await db.collection("vendors").where("uid", "==", vendorId).limit(1).get();
      const v = vq.docs[0]?.data() as
        | { businessName?: unknown; storeName?: unknown; name?: unknown; street?: unknown; unit?: unknown; city?: unknown; state?: unknown; zipCode?: unknown }
        | undefined;
      vendorName =
        (typeof v?.businessName === "string" && v.businessName) ||
        (typeof v?.storeName === "string" && v.storeName) ||
        (typeof v?.name === "string" && v.name) ||
        "";
      vendorAddress = { street: v?.street, unit: v?.unit, city: v?.city, state: v?.state, zipCode: v?.zipCode };
    } catch {
      // Same tolerance as materialize's resolveVendorInfo: an address lookup
      // failure degrades to an empty address, never blocks the caller.
    }
  }

  return {
    orderNumber: str(order.orderNumber, 40),
    customerPickup: {
      customerName: str(req.customerName, 200) || str(order.customerName, 200),
      phone: str(order.phone, 40),
      address: str(order.address, 1000),
      slot: null,
    },
    destination: {
      name: str(vendorName, 200),
      street: str(vendorAddress.street, 200),
      unit: str(vendorAddress.unit, 100),
      city: str(vendorAddress.city, 100),
      state: str(vendorAddress.state, 100),
      zipCode: str(vendorAddress.zipCode, 12),
    },
  };
}

// ===========================================================================
// Create + assign / reassign a return-collection job.
//
// Trigger: an itemRequests return in PICKUP_ASSIGNED (i.e. the customer has
// already confirmed the proposed appointment — PICKUP_ASSIGNED only follows
// PICKUP_CONFIRMED in the website FSM, so a job is never created before the
// customer confirms). Idempotent by the deterministic job id; a duplicate
// retry never creates a second job. Only an admin (→ YOMICO person) or a
// company actor (→ its OWN person) may assign; the customer never creates a
// job, and a client-supplied person/company/status is never trusted.
// ===========================================================================
export async function createOrAssignReturnJob(
  tx: Transaction,
  db: Firestore,
  args: {
    returnRequestId: string;
    actorUid: string;
    actorKind: "admin" | "company";
    actorCompanyId: string | null; // required + validated when actorKind === "company"
    personId: string;
    snapshot: ReturnJobSnapshot;
  }
): Promise<{ created: boolean; changed: boolean; returnJobId: string; personId: string }> {
  const rjId = returnJobId(args.returnRequestId);
  const jobRef = db.collection("returnCollectionJobs").doc(rjId);
  const itemRef = db.collection("itemRequests").doc(args.returnRequestId);
  const personRef = db.collection("deliveryPersons").doc(args.personId);

  // ---- READS FIRST ----
  const [jobSnap, itemSnap, personSnap] = await Promise.all([
    tx.get(jobRef),
    tx.get(itemRef),
    tx.get(personRef),
  ]);

  if (!itemSnap.exists) throw new ReturnCollectionError("Return request not found.", 404);
  const req = itemSnap.data() as ItemRequestData;
  if (req.type !== "return") {
    throw new ReturnCollectionError("Only a return can have a collection job.", 409);
  }
  if (req.status !== REQUIRED_ITEM_REQUEST_STATUS) {
    throw new ReturnCollectionError(
      `A collection job can only be created once the return is at ${REQUIRED_ITEM_REQUEST_STATUS} (customer-confirmed pickup). Current: ${req.status || "unknown"}.`,
      409
    );
  }

  if (!personSnap.exists) throw new ReturnCollectionError("Delivery person not found.", 404);
  const person = personSnap.data() as DeliveryPerson;

  // ---- eligibility (reused validators) ----
  assertPersonAssignable(person); // Active account AND Available
  assertRiderPerson(person); // never a HUB_PERSON
  const providerType: DeliveryProviderType =
    args.actorKind === "admin" ? "YOMICO" : "COMPANY";
  if (args.actorKind === "admin") {
    assertYomicoPerson(person); // admin only ever assigns a YOMICO person
  } else {
    if (!args.actorCompanyId) throw new ReturnCollectionError("Missing company.", 403);
    assertCompanyPerson(person, args.actorCompanyId); // company only its OWN person
  }
  const companyId = args.actorKind === "company" ? args.actorCompanyId : null;

  const now = Timestamp.now();
  const shipmentRef = req.requestNumber || args.snapshot.orderNumber || rjId;

  // ---- REASSIGN path (job already exists) ----
  if (jobSnap.exists) {
    const job = jobSnap.data() as { status?: string; assignedPersonId?: string | null };
    if (!PRE_COLLECTION.has(job.status || "")) {
      throw new ReturnCollectionError(
        "This return has already been collected and can no longer be reassigned.",
        409
      );
    }
    if (job.assignedPersonId === args.personId) {
      return { created: false, changed: false, returnJobId: rjId, personId: args.personId };
    }
    // Free the previously-assigned person (read first). Multi-parcel: only
    // return them to Available if they hold no OTHER active job; else stay Busy.
    let oldPerson: DeliveryPerson | null = null;
    let oldRef: DocumentReference | null = null;
    let oldHasOtherActive = false;
    if (job.assignedPersonId) {
      oldRef = db.collection("deliveryPersons").doc(job.assignedPersonId);
      const oldSnap = await tx.get(oldRef);
      oldPerson = oldSnap.exists ? (oldSnap.data() as DeliveryPerson) : null;
      oldHasOtherActive = await hasOtherActiveJobs(tx, db, job.assignedPersonId, rjId);
    }
    if (oldRef && oldPerson) {
      releaseAfterLosingJob(tx, oldRef, oldPerson, oldHasOtherActive, now);
    }
    tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

    const eventId = writeReturnEvent(tx, db, {
      returnJobId: rjId,
      shipmentRef,
      actorUid: args.actorUid,
      role: args.actorKind === "admin" ? "admin" : "company",
      providerType,
      companyId,
      personId: args.personId,
      action: "ReturnCollectionReassigned",
      fromStage: job.status || "Assigned",
      toStage: "Assigned",
      orderId: req.orderId || null,
      now,
    });

    tx.set(
      jobRef,
      {
        providerType,
        companyId,
        assignedPersonId: args.personId,
        assignedPersonName: str(person.name, 200),
        assignedPersonPhone: str(person.phone, 40),
        assignedAt: now,
        assignedBy: args.actorUid,
        status: "Assigned",
        lastEventId: eventId,
        lastEventAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    if (person.uid) {
      emitDeliveryNotification(tx, db, {
        type: "RETURN_COLLECTION_ASSIGNED",
        recipient: { role: "delivery_person", userId: person.uid },
        eventId,
        title: "Return collection assigned",
        message: "A return collection has been assigned to you.",
        orderId: req.orderId || null,
        orderNumber: args.snapshot.orderNumber || null,
        deliveryJobId: rjId,
        now,
      });
    }
    return { created: false, changed: true, returnJobId: rjId, personId: args.personId };
  }

  // ---- CREATE path ----
  tx.set(personRef, { availability: "Busy", updatedAt: now }, { merge: true });

  const custody: CustodyState = {
    holderKind: "CUSTOMER", // the item is with the customer until collection
    personId: null,
    companyId: null,
    since: now,
    sinceEventId: null,
  };

  const eventId = writeReturnEvent(tx, db, {
    returnJobId: rjId,
    shipmentRef,
    actorUid: args.actorUid,
    role: args.actorKind === "admin" ? "admin" : "company",
    providerType,
    companyId,
    personId: args.personId,
    action: "ReturnCollectionCreated",
    fromStage: "None",
    toStage: "Assigned",
    orderId: req.orderId || null,
    now,
    eventId: `${rjId}__evt_created`,
  });

  const jobDoc: Record<string, unknown> = {
    returnJobId: rjId,
    returnRequestId: args.returnRequestId,
    orderId: req.orderId || "",
    orderNumber: str(args.snapshot.orderNumber, 40),
    itemKey: str(req.itemKey, 120),
    vendorId: str(req.vendorId, 128), // internal — never sent to the app projection
    vendorName: str(args.snapshot.destination.name, 200),
    userId: str(req.userId, 128), // internal — never sent to the app projection
    customerName: str(req.customerName, 200) || str(args.snapshot.customerPickup.customerName, 200),
    requestNumber: str(req.requestNumber, 40),
    reason: str(req.reason, 200),
    item: {
      name: str(req.item?.name, 200) || "Item",
      qty: Number(req.item?.qty) > 0 ? Number(req.item?.qty) : 1,
      size: str(req.item?.size, 40),
      color: str(req.item?.color, 40),
    },
    // Reverse: pickup = the CUSTOMER; destination = the SELLER / return address.
    pickup: {
      customerName: str(args.snapshot.customerPickup.customerName, 200),
      phone: str(args.snapshot.customerPickup.phone, 40),
      address: str(args.snapshot.customerPickup.address, 1000),
      slot: typeof args.snapshot.customerPickup.slot === "string" ? args.snapshot.customerPickup.slot : null,
    },
    destination: {
      name: str(args.snapshot.destination.name, 200),
      street: str(args.snapshot.destination.street, 200),
      unit: str(args.snapshot.destination.unit, 100),
      city: str(args.snapshot.destination.city, 100),
      state: str(args.snapshot.destination.state, 100),
      zipCode: str(args.snapshot.destination.zipCode, 12),
    },
    appointmentAt: req.pickup?.scheduledAt ?? null,
    providerType,
    companyId,
    assignedPersonId: args.personId,
    assignedPersonName: str(person.name, 200),
    assignedPersonPhone: str(person.phone, 40),
    assignedCompanyName: null,
    assignedAt: now,
    assignedBy: args.actorUid,
    status: "Assigned",
    custody,
    attemptCount: 0,
    collectedAt: null,
    receivedAt: null,
    failedAt: null,
    lastException: null,
    lastEventId: eventId,
    lastEventAt: now,
    createdAt: now,
    updatedAt: now,
  };
  assertNoFinancialFields(jobDoc);
  tx.set(jobRef, jobDoc);

  // Customer: a friendly "collection assigned" note (no internal mechanics).
  if (req.userId) {
    emitDeliveryNotification(tx, db, {
      type: "RETURN_COLLECTION_ASSIGNED",
      recipient: { role: "customer", userId: req.userId },
      eventId,
      title: "Return pickup scheduled",
      message: "A pickup partner has been assigned to collect your return.",
      orderId: req.orderId || null,
      orderNumber: args.snapshot.orderNumber || null,
      deliveryJobId: rjId,
      now,
    });
  }
  // Delivery person: the new job in their queue.
  if (person.uid) {
    emitDeliveryNotification(tx, db, {
      type: "RETURN_COLLECTION_ASSIGNED",
      recipient: { role: "delivery_person", userId: person.uid },
      eventId,
      title: "Return collection assigned",
      message: "A return collection has been assigned to you.",
      orderId: req.orderId || null,
      orderNumber: args.snapshot.orderNumber || null,
      deliveryJobId: rjId,
      now,
    });
  }

  return { created: true, changed: true, returnJobId: rjId, personId: args.personId };
}

// ===========================================================================
// Execute a return-collection transition (Delivery App → person-only).
//
// start:     Assigned/CollectionFailed → OutForCollection
// collect:   Assigned/OutForCollection/CollectionFailed → Collected
//            (+ itemRequests PICKUP_ASSIGNED → PICKED_UP, guarded)
// receive:   Collected → Received
//            (+ itemRequests PICKED_UP → RECEIVED_BY_YOMICO, guarded; frees person)
// exception: Assigned/OutForCollection → CollectionFailed (recoverable)
//
// Every transition is idempotent (a repeat that lands on the same target is a
// no-op success) and server-authorized (the caller MUST be the job's assigned
// person; a company person's job must belong to their company).
// ===========================================================================
export async function executeReturnTransition(
  tx: Transaction,
  db: Firestore,
  args: {
    returnJobId: string;
    actorUid: string;
    personId: string;
    companyId: string | null; // the caller's company (null for a YOMICO person)
    providerType: DeliveryProviderType;
    action: ReturnExecutionAction;
    exceptionCode?: ReturnExceptionCode;
    note?: string;
  }
): Promise<{ ok: true; status: ReturnJobStatus; changed: boolean }> {
  const jobRef = db.collection("returnCollectionJobs").doc(args.returnJobId);

  // ---- READS FIRST ----
  const jobSnap = await tx.get(jobRef);
  if (!jobSnap.exists) throw new ReturnCollectionError("Return collection job not found.", 404);
  const job = jobSnap.data() as {
    status?: string;
    assignedPersonId?: string | null;
    companyId?: string | null;
    providerType?: DeliveryProviderType | null;
    returnRequestId?: string;
    orderId?: string | null;
    orderNumber?: string;
    requestNumber?: string;
    userId?: string;
    vendorId?: string;
    attemptCount?: number;
    custody?: CustodyState | null;
  };

  // ---- authorization: only the assigned person may execute ----
  if (job.assignedPersonId !== args.personId) {
    throw new ReturnCollectionError("This return collection is not assigned to you.", 403);
  }
  if (args.providerType === "COMPANY" && job.companyId !== args.companyId) {
    throw new ReturnCollectionError("This return collection belongs to another company.", 403);
  }

  const from = (job.status || "Assigned") as ReturnJobStatus;
  const now = Timestamp.now();
  const shipmentRef = job.requestNumber || job.orderNumber || args.returnJobId;

  // The authoritative return request — read so the two allowed FSM advances can
  // be guarded on its exact current status, and its userId/vendorId used to
  // address customer/seller notifications (never trusted from the client).
  const returnRequestId = job.returnRequestId || "";
  const itemRef = returnRequestId ? db.collection("itemRequests").doc(returnRequestId) : null;
  const itemSnap = itemRef ? await tx.get(itemRef) : null;
  const req = itemSnap && itemSnap.exists ? (itemSnap.data() as ItemRequestData) : null;

  // For "receive" we free the assigned person — read the person doc first.
  let personSnapAvailability: string | null = null;
  let personRef: DocumentReference | null = null;
  let receiveHasOtherActive = false;
  if (args.action === "receive") {
    personRef = db.collection("deliveryPersons").doc(args.personId);
    const pSnap = await tx.get(personRef);
    personSnapAvailability = pSnap.exists
      ? ((pSnap.data() as DeliveryPerson).availability ?? null)
      : null;
    // Multi-parcel (READ phase): keep Busy on receive if another active job remains.
    receiveHasOtherActive = await hasOtherActiveJobs(tx, db, args.personId, args.returnJobId);
  }

  const customerUid = req?.userId || job.userId || "";
  const sellerUid = req?.vendorId || job.vendorId || "";

  // ---------------- start ----------------
  if (args.action === "start") {
    if (from === "OutForCollection") return { ok: true, status: from, changed: false };
    if (from !== "Assigned" && from !== "CollectionFailed") {
      throw new ReturnCollectionError(`Cannot start collection from ${from}.`, 409);
    }
    const eventId = writeReturnEvent(tx, db, {
      returnJobId: args.returnJobId,
      shipmentRef,
      actorUid: args.actorUid,
      role: "person",
      providerType: args.providerType,
      companyId: args.companyId,
      personId: args.personId,
      action: "ReturnOutForCollection",
      fromStage: from,
      toStage: "OutForCollection",
      orderId: job.orderId ?? null,
      now,
      eventId: `${args.returnJobId}__evt_start`,
    });
    tx.set(jobRef, { status: "OutForCollection", lastEventId: eventId, lastEventAt: now, updatedAt: now }, { merge: true });
    return { ok: true, status: "OutForCollection", changed: true };
  }

  // ---------------- collect ----------------
  if (args.action === "collect") {
    if (from === "Collected" || from === "Received") return { ok: true, status: from, changed: false };
    if (from !== "Assigned" && from !== "OutForCollection" && from !== "CollectionFailed") {
      throw new ReturnCollectionError(`Cannot collect from ${from}.`, 409);
    }
    // Guard the website FSM advance: only PICKUP_ASSIGNED → PICKED_UP.
    if (req && req.status !== REQUIRED_ITEM_REQUEST_STATUS && req.status !== ITEM_STATUS_ON_COLLECTED) {
      throw new ReturnCollectionError(
        `The return is no longer awaiting collection (status ${req.status}).`,
        409
      );
    }
    const custody: CustodyState = {
      holderKind: args.providerType, // YOMICO | COMPANY — now in the person's hands
      personId: args.personId,
      companyId: args.companyId,
      since: now,
      sinceEventId: null,
    };
    const eventId = writeReturnEvent(tx, db, {
      returnJobId: args.returnJobId,
      shipmentRef,
      actorUid: args.actorUid,
      role: "person",
      providerType: args.providerType,
      companyId: args.companyId,
      personId: args.personId,
      action: "ReturnCollected",
      fromStage: from,
      toStage: "Collected",
      orderId: job.orderId ?? null,
      now,
      eventId: `${args.returnJobId}__evt_collect`,
    });
    tx.set(
      jobRef,
      { status: "Collected", custody, collectedAt: now, lastEventId: eventId, lastEventAt: now, updatedAt: now },
      { merge: true }
    );
    // Advance the website return FSM to PICKED_UP (only from PICKUP_ASSIGNED).
    if (itemRef && req && req.status === REQUIRED_ITEM_REQUEST_STATUS) {
      const history = Array.isArray(req.history) ? req.history : [];
      tx.set(
        itemRef,
        {
          status: ITEM_STATUS_ON_COLLECTED,
          updatedAt: now,
          history: [...history, { status: ITEM_STATUS_ON_COLLECTED, at: now, by: "delivery" }],
          pickup: { pickedUpAt: now },
        },
        { merge: true }
      );
    }
    if (customerUid) {
      emitDeliveryNotification(tx, db, {
        type: "RETURN_COLLECTED",
        recipient: { role: "customer", userId: customerUid },
        eventId,
        title: "Return collected",
        message: "Your return has been collected. We'll let you know when it reaches us.",
        orderId: job.orderId ?? null,
        orderNumber: job.orderNumber ?? null,
        deliveryJobId: args.returnJobId,
        now,
      });
    }
    return { ok: true, status: "Collected", changed: true };
  }

  // ---------------- receive ----------------
  if (args.action === "receive") {
    if (from === "Received") return { ok: true, status: from, changed: false };
    if (from !== "Collected") {
      throw new ReturnCollectionError(`Cannot mark received from ${from}.`, 409);
    }
    if (req && req.status !== ITEM_STATUS_ON_COLLECTED && req.status !== ITEM_STATUS_ON_RECEIVED) {
      throw new ReturnCollectionError(
        `The return is not in a collected state (status ${req.status}).`,
        409
      );
    }
    const custody: CustodyState = {
      holderKind: "SELLER", // handed to the seller / return destination
      personId: null,
      companyId: null,
      since: now,
      sinceEventId: null,
    };
    const eventId = writeReturnEvent(tx, db, {
      returnJobId: args.returnJobId,
      shipmentRef,
      actorUid: args.actorUid,
      role: "person",
      providerType: args.providerType,
      companyId: args.companyId,
      personId: args.personId,
      action: "ReturnReceived",
      fromStage: from,
      toStage: "Received",
      orderId: job.orderId ?? null,
      now,
      eventId: `${args.returnJobId}__evt_receive`,
    });
    tx.set(
      jobRef,
      { status: "Received", custody, receivedAt: now, lastEventId: eventId, lastEventAt: now, updatedAt: now },
      { merge: true }
    );
    // Free the delivery person ONLY if they hold no OTHER active job (multi-
    // parcel); otherwise they stay Busy. Never overrides a manual Offline.
    if (personRef && personSnapAvailability === "Busy" && !receiveHasOtherActive) {
      tx.set(personRef, { availability: "Available", updatedAt: now }, { merge: true });
    }
    // Advance the website return FSM to RECEIVED_BY_YOMICO (only from PICKED_UP).
    // Seller inspection remains the authoritative NEXT stage (unchanged).
    if (itemRef && req && req.status === ITEM_STATUS_ON_COLLECTED) {
      const history = Array.isArray(req.history) ? req.history : [];
      tx.set(
        itemRef,
        {
          status: ITEM_STATUS_ON_RECEIVED,
          updatedAt: now,
          history: [...history, { status: ITEM_STATUS_ON_RECEIVED, at: now, by: "delivery" }],
          pickup: { receivedAt: now },
        },
        { merge: true }
      );
    }
    if (customerUid) {
      emitDeliveryNotification(tx, db, {
        type: "RETURN_RECEIVED",
        recipient: { role: "customer", userId: customerUid },
        eventId,
        title: "Return received",
        message: "We've received your returned item. It's now being processed.",
        orderId: job.orderId ?? null,
        orderNumber: job.orderNumber ?? null,
        deliveryJobId: args.returnJobId,
        now,
      });
    }
    if (sellerUid) {
      emitDeliveryNotification(tx, db, {
        type: "RETURN_RECEIVED",
        recipient: { role: "seller", userId: sellerUid },
        eventId,
        title: "Returned item received",
        message: "A returned item has been received and is ready for your inspection.",
        orderId: job.orderId ?? null,
        orderNumber: job.orderNumber ?? null,
        deliveryJobId: args.returnJobId,
        now,
      });
    }
    return { ok: true, status: "Received", changed: true };
  }

  // ---------------- exception ----------------
  // A failed collection attempt. Recoverable: the return is NOT cancelled, and
  // the job can be re-started/collected. Never touches the website FSM.
  if (from !== "Assigned" && from !== "OutForCollection") {
    throw new ReturnCollectionError(`Cannot report a collection issue from ${from}.`, 409);
  }
  const attempt = (Number(job.attemptCount) || 0) + 1;
  const eventId = writeReturnEvent(tx, db, {
    returnJobId: args.returnJobId,
    shipmentRef,
    actorUid: args.actorUid,
    role: "person",
    providerType: args.providerType,
    companyId: args.companyId,
    personId: args.personId,
    action: "ReturnCollectionFailed",
    fromStage: from,
    toStage: "CollectionFailed",
    orderId: job.orderId ?? null,
    exceptionCode: args.exceptionCode || "OTHER",
    notes: args.note ? str(args.note, 500) : null,
    now,
    eventId: `${args.returnJobId}__evt_exc_${attempt}`,
  });
  tx.set(
    jobRef,
    {
      status: "CollectionFailed",
      failedAt: now,
      attemptCount: FieldValue.increment(1),
      lastException: {
        code: args.exceptionCode || "OTHER",
        note: args.note ? str(args.note, 500) : null,
        at: now,
        eventId,
      },
      lastEventId: eventId,
      lastEventAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  if (customerUid) {
    emitDeliveryNotification(tx, db, {
      type: "RETURN_COLLECTION_ISSUE",
      recipient: { role: "customer", userId: customerUid },
      eventId,
      title: "Return collection issue",
      message:
        "We couldn't complete your return collection this time. We'll be in touch to arrange it again.",
      orderId: job.orderId ?? null,
      orderNumber: job.orderNumber ?? null,
      deliveryJobId: args.returnJobId,
      now,
    });
  }
  return { ok: true, status: "CollectionFailed", changed: true };
}

// ===========================================================================
// Customer/operational-safe projection for the Delivery App.
//
// NEVER exposes: refund amount (none is stored anyway), the customer's or
// seller's uid, internal notes, or the returnRequestId's internal parts beyond
// a display reference. The person needs the pickup (customer) location and the
// return destination to do the job — those ARE returned; identity ids are not.
// ===========================================================================
export type ReturnJobView = {
  id: string;
  kind: "RETURN_COLLECTION";
  status: string;
  orderNumber: string;
  requestNumber: string;
  reason: string;
  item: { name: string; qty: number; size: string; color: string };
  pickup: { customerName: string; phone: string; address: string; slot: string | null };
  destination: { name: string; city: string; address: string };
  appointmentAt: unknown | null;
  custody: CustodyState | null;
  attemptCount: number;
  updatedAt: unknown | null;
};

export function buildReturnJobView(id: string, job: Record<string, unknown>): ReturnJobView {
  const item = (job.item as ReturnJobView["item"]) || { name: "Item", qty: 1, size: "", color: "" };
  const pickup = (job.pickup as ReturnJobView["pickup"]) || {
    customerName: "",
    phone: "",
    address: "",
    slot: null,
  };
  const dest = (job.destination as { name?: string; city?: string; street?: string; unit?: string; state?: string; zipCode?: string }) || {};
  const destAddress = [dest.street, dest.unit, dest.city, dest.state, dest.zipCode]
    .filter((p) => typeof p === "string" && p)
    .join(", ");
  return {
    id,
    kind: "RETURN_COLLECTION",
    status: typeof job.status === "string" ? job.status : "Assigned",
    orderNumber: typeof job.orderNumber === "string" ? job.orderNumber : "",
    requestNumber: typeof job.requestNumber === "string" ? job.requestNumber : "",
    reason: typeof job.reason === "string" ? job.reason : "",
    item: {
      name: item.name || "Item",
      qty: Number(item.qty) > 0 ? Number(item.qty) : 1,
      size: item.size || "",
      color: item.color || "",
    },
    pickup: {
      customerName: pickup.customerName || "",
      phone: pickup.phone || "",
      address: pickup.address || "",
      slot: pickup.slot ?? null,
    },
    destination: {
      name: typeof dest.name === "string" ? dest.name : "",
      city: typeof dest.city === "string" ? dest.city : "",
      address: destAddress,
    },
    appointmentAt: (job.appointmentAt as unknown) ?? null,
    custody: (job.custody as CustodyState) ?? null,
    attemptCount: Number(job.attemptCount) || 0,
    updatedAt: (job.updatedAt as unknown) ?? null,
  };
}
