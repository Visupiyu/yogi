import {
  addDoc,
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
  updateDoc,
  Firestore,
} from "firebase/firestore";

type ReturnRecord = {
  id: string;
  userId?: string;
  userEmail?: string;
  refundAmount?: number;
  [key: string]: unknown;
};

// What the "Refunded" transaction observed and did, so the caller can write
// the ledger entry outside it (a transaction cannot addDoc with a generated
// id) without having to guess whether a credit actually happened.
type RefundOutcome = {
  alreadyRefunded: boolean;
  amount: number;
  userId: string | null;
  userEmail: string | null;
};

// Shared by the two admin surfaces that both manage the `returns`
// collection (app/admin/refunds and app/admin/returns) — previously each
// had its own updateStatus() and only one of them actually notified the
// customer and credited reward points on "Refunded", so which page an
// admin happened to use silently changed what the customer received.
export async function applyReturnStatusUpdate(
  db: Firestore,
  returnRecord: ReturnRecord,
  status: string
): Promise<void> {
  const returnRef = doc(db, "returns", returnRecord.id);

  // Non-"Refunded" transitions move no money, so they keep the plain
  // single-write path and cost no extra read.
  if (status !== "Refunded") {
    await updateDoc(returnRef, { status });
  }

  // Crediting reward points used to be an unguarded increment(): the helper
  // never looked at the return's CURRENT status, so every arrival at
  // "Refunded" paid out again. Two ways that happened in practice, neither
  // needing anything unusual from the admin:
  //
  //   1. Re-picking the status after a correction — Refunded -> Approved ->
  //      Refunded fires onChange twice with "Refunded".
  //   2. Both admin pages load `returns` once with getDocs() and then patch
  //      their own local state, so a second open tab still shows "Pending"
  //      after the first one refunded, and selecting "Refunded" there
  //      credits a second time.
  //
  // An early `if (returnRecord.status === "Refunded") return;` would only
  // close (1): returnRecord is the caller's page-load snapshot, which is
  // precisely the value that is stale in (2). So the guard reads the
  // document itself, inside a transaction that also performs the status
  // write, making the check and the credit one atomic step.
  const outcome =
    status === "Refunded"
      ? await runTransaction<RefundOutcome>(db, async (tx) => {
          const snap = await tx.get(returnRef);

          if (!snap.exists()) {
            throw new Error("Return request no longer exists.");
          }

          const data = snap.data();
          const alreadyRefunded = data.status === "Refunded";

          // Amount and owner come from the transaction snapshot, never from
          // returnRecord — the caller's copy can predate an admin editing
          // the amount, and firestore.rules only ever bounded refundAmount
          // on the write to the document, so the document is the only value
          // that was actually checked against the order's total.
          const rawAmount = Number(data.refundAmount);
          const amount = Number.isFinite(rawAmount) && rawAmount > 0 ? rawAmount : 0;
          const userId =
            typeof data.userId === "string" && data.userId ? data.userId : null;
          const userEmail =
            typeof data.userEmail === "string" ? data.userEmail : null;

          tx.update(returnRef, { status });

          if (!alreadyRefunded && userId && amount > 0) {
            tx.update(doc(db, "users", userId), {
              rewardPoints: increment(amount),
            });
          }

          return { alreadyRefunded, amount, userId, userEmail };
        })
      : null;

  if (returnRecord.userId) {
    await addDoc(collection(db, "notifications"), {
      title: "Refund Status Updated",
      message: `Your refund request is now ${status}.`,
      userId: returnRecord.userId,
      role: "customer",
      type: "refund",
      read: false,
      createdAt: serverTimestamp(),
    });
  }

  // Ledger entry on the FIRST arrival at "Refunded" only. Still written when
  // the amount is 0 or the owner is unknown, exactly as before — only the
  // genuine duplicate is suppressed, so a re-refund no longer leaves a
  // second, indistinguishable row. returnId and userId are new: the previous
  // entry carried only userEmail/type/points/createdAt, so two duplicate
  // credits were impossible to tell apart or trace back to their return.
  if (outcome && !outcome.alreadyRefunded) {
    await addDoc(collection(db, "rewardTransactions"), {
      returnId: returnRecord.id,
      userId: outcome.userId,
      userEmail: outcome.userEmail ?? returnRecord.userEmail ?? "",
      type: "Refund",
      points: outcome.amount,
      createdAt: serverTimestamp(),
    });
  }
}
