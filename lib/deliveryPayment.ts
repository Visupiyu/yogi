import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { logAdminAction, logDeliveryPartnerAction } from "@/lib/auditLog";

// Re-exported from lib/upiPayment.ts — that's the canonical source (also
// used by the UPI-settings/payload helpers); kept importable from here too
// since this is the module callers of the payment-confirmation flow reach
// for already.
export { PAY_ON_DELIVERY_UPI } from "@/lib/upiPayment";

// Step 1 of Pay on Delivery (UPI Only)'s state machine: the delivery
// partner submits what they witnessed — a transaction reference — which
// only ever moves the order to AwaitingVerification, never directly to
// Paid. The amount is never part of this call: paymentAmount was already
// fixed server-side at order-creation time (app/api/create-order) and the
// Firestore rule (isValidDeliveryPaymentSubmission) doesn't even allow
// this write to touch that field, so there's nothing for the partner to
// tamper with here even in principle.
export async function confirmDeliveryPayment(
  orderId: string,
  transactionId: string,
  confirmedByName: string
) {
  const confirmedBy = auth.currentUser?.uid || "";

  await updateDoc(doc(db, "orders", orderId), {
    paymentStatus: "AwaitingVerification",
    paymentTransactionId: transactionId,
    paymentSubmittedAt: serverTimestamp(),
    paymentConfirmedBy: confirmedBy,
    paymentConfirmedByName: confirmedByName,
    updatedAt: serverTimestamp(),
  });

  await logDeliveryPartnerAction("delivery_payment_confirmed", orderId, {
    transactionId,
  });
}

// Step 2: only admin can promote AwaitingVerification -> Paid, after
// independently checking YOMICO's own UPI/bank account. Deliberately
// narrow — never touches paymentAmount or anything else — even though the
// underlying Firestore rule trusts admin unconditionally like every other
// admin order capability in this codebase; the discipline lives here, in
// what this function is willing to send, plus the audit trail below.
export async function verifyDeliveryPayment(
  orderId: string,
  verifiedByName: string
) {
  const verifiedBy = auth.currentUser?.uid || "";

  await updateDoc(doc(db, "orders", orderId), {
    paymentStatus: "Paid",
    paymentVerifiedAt: serverTimestamp(),
    paymentVerifiedBy: verifiedBy,
    paymentVerifiedByName: verifiedByName,
    updatedAt: serverTimestamp(),
  });

  await logAdminAction("delivery_payment_verified", orderId, {});
}
