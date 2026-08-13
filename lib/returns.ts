import {
  addDoc,
  collection,
  doc,
  increment,
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
  await updateDoc(doc(db, "returns", returnRecord.id), { status });

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

  if (status === "Refunded") {
    await addDoc(collection(db, "rewardTransactions"), {
      userEmail: returnRecord.userEmail || "",
      type: "Refund",
      points: returnRecord.refundAmount || 0,
      createdAt: serverTimestamp(),
    });

    if (returnRecord.userId) {
      await updateDoc(doc(db, "users", returnRecord.userId), {
        rewardPoints: increment(returnRecord.refundAmount || 0),
      });
    }
  }
}
