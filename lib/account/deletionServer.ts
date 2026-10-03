// SERVER-ONLY (Admin SDK). Account deletion requests: the customer asks, an
// admin processes by hand. This module writes ONLY the request document, a
// notification and (for admin decisions) an audit_logs entry — it never
// deletes or blocks an account, and never touches orders, invoices, payments,
// refunds or reward records.
import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";
import type { VerifiedUser } from "@/lib/serverAuth";
import {
  DELETION_STATUS_LABELS,
  buildDeletionRequestView,
  canRequestDeletion,
  isAllowedAdminTransition,
  isDeletionStatus,
  isOpenDeletion,
  type AdminDeletionRequestView,
  type DeletionRequestView,
  type DeletionStatus,
} from "@/lib/account/deletionRequests";

const COLLECTION = "accountDeletionRequests";

type Fail = { ok: false; status: number; error: string };
type Ok<T> = { ok: true } & T;

function iso(v: unknown): string | null {
  const d = (v as { toDate?: () => Date } | null)?.toDate?.();
  return d instanceof Date && !Number.isNaN(d.getTime()) ? d.toISOString() : null;
}

export async function loadOwnDeletionRequest(
  db: Firestore,
  uid: string
): Promise<{ request: DeletionRequestView | null; canRequest: boolean }> {
  const snap = await db.collection(COLLECTION).doc(uid).get();
  const data = snap.exists ? (snap.data() || {}) : {};
  return {
    request: snap.exists ? buildDeletionRequestView(data) : null,
    canRequest: canRequestDeletion(snap.exists ? data.status : undefined),
  };
}

export async function createDeletionRequest(
  db: Firestore,
  who: VerifiedUser,
  reason: string
): Promise<Ok<{ request: DeletionRequestView }> | Fail> {
  const ref = db.collection(COLLECTION).doc(who.uid);
  const userRef = db.collection("users").doc(who.uid);
  return db.runTransaction(async (tx) => {
    const [snap, userSnap] = await Promise.all([tx.get(ref), tx.get(userRef)]);
    const existing = snap.exists ? snap.data() || {} : null;
    if (existing && isOpenDeletion(existing.status)) {
      return { ok: false, status: 409, error: "You already have an account deletion request in progress." };
    }
    if (existing && !canRequestDeletion(existing.status)) {
      return { ok: false, status: 409, error: "Your account deletion request has already been completed." };
    }
    const now = Timestamp.now();
    const name = userSnap.exists && typeof userSnap.get("name") === "string" ? String(userSnap.get("name")).slice(0, 100) : "";
    const history = Array.isArray(existing?.history) ? existing.history : [];
    const doc = {
      userId: who.uid,
      email: who.email || "",
      name,
      status: "pending" as DeletionStatus,
      reason,
      requestedAt: now,
      updatedAt: now,
      // A new request starts clean for the customer; an earlier internal note
      // stays for the admin's context.
      customerMessage: null,
      internalNote: existing && typeof existing.internalNote === "string" ? existing.internalNote : null,
      handledBy: null,
      history: [...history, { status: "pending", at: now, by: "customer" }],
    };
    tx.set(ref, doc);
    tx.set(db.collection("notifications").doc(), {
      title: "Account deletion request",
      message: `${name || "A customer"} requested account deletion. Review it under Account Deletions.`,
      role: "admin",
      type: "support",
      read: false,
      createdAt: now,
    });
    return { ok: true, request: buildDeletionRequestView(doc)! };
  });
}

export async function cancelDeletionRequest(
  db: Firestore,
  uid: string
): Promise<Ok<{ request: DeletionRequestView }> | Fail> {
  const ref = db.collection(COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : null;
    if (!data) return { ok: false, status: 404, error: "You have no account deletion request." };
    if (!isOpenDeletion(data.status)) {
      return { ok: false, status: 409, error: "This request can no longer be cancelled." };
    }
    const now = Timestamp.now();
    const update = {
      status: "cancelled" as DeletionStatus,
      updatedAt: now,
      cancelledAt: now,
      history: FieldValue.arrayUnion({ status: "cancelled", at: now, by: "customer" }),
    };
    tx.update(ref, update);
    tx.set(db.collection("notifications").doc(), {
      title: "Account deletion request withdrawn",
      message: `${typeof data.name === "string" && data.name ? data.name : "A customer"} withdrew their account deletion request.`,
      role: "admin",
      type: "support",
      read: false,
      createdAt: now,
    });
    return { ok: true, request: buildDeletionRequestView({ ...data, status: "cancelled", updatedAt: now })! };
  });
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

async function accountSnapshot(db: Firestore, uid: string): Promise<AdminDeletionRequestView["account"]> {
  const [orders, requests, user] = await Promise.all([
    db.collection("orders").where("userId", "==", uid).get(),
    db.collection("itemRequests").where("userId", "==", uid).get(),
    db.collection("users").doc(uid).get(),
  ]);
  const closed = new Set(["Delivered", "Cancelled", "Returned"]);
  const points = Number(user.get("rewardPoints"));
  return {
    orders: orders.size,
    openOrders: orders.docs.filter((d) => !closed.has(String(d.get("status")))).length,
    openReturns: requests.docs.filter((d) => !["REFUNDED", "DELIVERED", "REJECTED", "CANCELLED"].includes(String(d.get("status")))).length,
    refundsDue: orders.docs.filter((d) => d.get("refundStatus") === "Required" || d.get("refundStatus") === "Processing" || d.get("refundStatus") === "Failed").length,
    rewardBalance: Number.isFinite(points) && points > 0 ? Math.floor(points) : 0,
  };
}

export async function listDeletionRequests(
  db: Firestore,
  filter: "open" | "all"
): Promise<AdminDeletionRequestView[]> {
  const snap = await db.collection(COLLECTION).get();
  const docs = snap.docs.filter((d) => isDeletionStatus(d.get("status")) && (filter === "all" || isOpenDeletion(d.get("status"))));
  const out = await Promise.all(
    docs.map(async (d) => {
      const data = d.data() || {};
      return {
        uid: d.id,
        email: typeof data.email === "string" ? data.email : "",
        name: typeof data.name === "string" ? data.name : "",
        status: data.status as DeletionStatus,
        reason: typeof data.reason === "string" ? data.reason : "",
        requestedAt: iso(data.requestedAt),
        updatedAt: iso(data.updatedAt),
        customerMessage: typeof data.customerMessage === "string" ? data.customerMessage : null,
        internalNote: typeof data.internalNote === "string" ? data.internalNote : null,
        account: await accountSnapshot(db, d.id),
      } satisfies AdminDeletionRequestView;
    })
  );
  return out.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
}

export async function decideDeletionRequest(
  db: Firestore,
  admin: VerifiedUser,
  uid: string,
  to: DeletionStatus,
  customerMessage: string | null,
  internalNote: string | null
): Promise<Ok<{ status: DeletionStatus }> | Fail> {
  const ref = db.collection(COLLECTION).doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() || {} : null;
    if (!data) return { ok: false, status: 404, error: "Request not found." };
    if (!isAllowedAdminTransition(data.status, to)) {
      return { ok: false, status: 409, error: `A ${String(data.status)} request cannot be moved to ${to}.` };
    }
    const now = Timestamp.now();
    const update: Record<string, unknown> = {
      status: to,
      updatedAt: now,
      handledBy: admin.uid,
      history: FieldValue.arrayUnion({ status: to, at: now, by: "admin" }),
      ...(to === "in_review" ? { reviewedAt: now } : {}),
      ...(to === "completed" ? { completedAt: now } : {}),
      ...(to === "rejected" ? { rejectedAt: now } : {}),
      ...(customerMessage !== null ? { customerMessage } : {}),
      ...(internalNote !== null ? { internalNote } : {}),
    };
    tx.update(ref, update);
    tx.set(db.collection("audit_logs").doc(), {
      actorUid: admin.uid,
      actorEmail: admin.email || "",
      action: `account_deletion_${to}`,
      targetId: uid,
      details: { from: data.status, to },
      createdAt: now,
    });
    // The customer is told the new status (the admin's note to them is shown
    // on their Account & Security page, not copied into the feed).
    tx.set(db.collection("notifications").doc(), {
      userId: uid,
      role: "customer",
      title: "Account deletion request update",
      message: `Your account deletion request is now: ${DELETION_STATUS_LABELS[to]}. See Account & Security for details.`,
      type: "account",
      read: false,
      createdAt: now,
    });
    return { ok: true, status: to };
  });
}
