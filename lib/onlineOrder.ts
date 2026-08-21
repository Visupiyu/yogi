import { getAdminDb } from "@/lib/firebaseAdmin";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import type { OrderPricing } from "@/lib/orderPricing";
import { sendOrderConfirmationEmail } from "@/lib/orderConfirmationEmail";

// SERVER-ONLY.
//
// Finalises a captured Razorpay payment into an order. Called from exactly two
// places, deliberately sharing one implementation so the two cannot diverge:
//
//   app/api/finalize-online-order  — the browser's success callback
//   app/api/razorpay/webhook       — Razorpay's own server-to-server event
//
// Whichever arrives first wins; the other becomes a no-op. That is the whole
// point: a browser that dies after capture no longer loses the order, and a
// webhook that arrives twice cannot double-charge inventory or rewards.
//
// ---------------------------------------------------------------------------
// MONEY-SAFETY RULE
// ---------------------------------------------------------------------------
// By the time this runs the customer's money is already captured and cannot be
// silently returned. So this function NEVER refuses to create the order. Stock
// that ran out, a coupon claimed in the meantime, a reward balance that moved
// — each is recorded on the order and flagged for admin review, never used as
// grounds to reject. Refusing here would mean money taken with nothing to show
// for it, which is strictly worse than an order that needs manual attention.
//
// COD is the opposite and stays that way: /api/place-order rejects on the same
// conditions, because nothing has been charged yet and rejection is free.

/**
 * The order intent captured at /api/create-order time, before the customer saw
 * the Razorpay modal. Stored server-side in paymentIntents/{razorpay_order_id}
 * and never round-tripped through the browser.
 *
 * `pricing` is the snapshot the Razorpay order amount was derived from. Using
 * the snapshot rather than re-pricing at finalisation is deliberate: a product
 * price edited between checkout and capture would otherwise produce an order
 * whose total disagrees with what the customer was actually charged.
 */
export type PaymentIntent = {
  uid: string;
  email: string | null;
  pricing: OrderPricing;
  customerName: string;
  phone: string;
  address: string;
  couponCode: string | null;
  redeemPoints: boolean;
  deliveryDate: string;
  expectedAmountPaise: number;
};

export type FinalizeResult =
  | { kind: "created"; orderId: string; finalTotal: number }
  | { kind: "already"; orderId: string; finalTotal: number }
  | { kind: "error"; status: number; error: string };

/**
 * Deterministic order identity.
 *
 * The Razorpay payment id is globally unique, is issued by Razorpay rather
 * than by us, and is known identically to the browser callback and the
 * webhook — neither needs the other's context to compute it. Using it as the
 * Firestore document id makes "has this payment already been finalised?" a
 * single point read inside the transaction, which is what makes the whole
 * flow idempotent.
 *
 * Not prefixed with the uid (unlike the COD key) precisely so the webhook can
 * derive it without a session, and so the `id.slice(0, 8)` used for display
 * across the admin/seller/customer UIs stays distinguishable between orders
 * ("pay_ABCD" rather than eight characters of the same uid).
 */
export function onlineOrderIdFor(razorpayPaymentId: string): string {
  return razorpayPaymentId;
}

type Shortfall = { id: string; name: string; wanted: number; available: number };

export async function finalizeOnlineOrder(params: {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  intent: PaymentIntent;
  /** What Razorpay actually captured, in paise. */
  capturedAmountPaise: number;
  /** "browser" | "webhook" — recorded on the order for reconciliation. */
  source: string;
}): Promise<FinalizeResult> {
  const { razorpayPaymentId, razorpayOrderId, intent, capturedAmountPaise, source } =
    params;

  const db = getAdminDb();
  const orderId = onlineOrderIdFor(razorpayPaymentId);
  const orderRef = db.collection("orders").doc(orderId);
  const pricing = intent.pricing;

  // Fast path outside the transaction — a repeat callback never re-reads the
  // product catalogue. The authoritative check is repeated inside.
  const preexisting = await orderRef.get();
  if (preexisting.exists) {
    return {
      kind: "already",
      orderId,
      finalTotal: Number(preexisting.data()?.finalTotal || 0),
    };
  }

  const couponRef = intent.couponCode
    ? db
        .collection("couponRedemptions")
        .doc(`${intent.uid}_${intent.couponCode}`)
    : null;

  const outcome = await db.runTransaction<
    FinalizeResult & { shortfalls?: Shortfall[]; couponConflict?: boolean; rewardShort?: number }
  >(async (tx: Transaction) => {
    // ---- ALL READS FIRST (Firestore transaction requirement) ----

    // Idempotency, re-checked under transaction isolation so a webhook and a
    // browser callback racing each other cannot both proceed.
    const orderSnap = await tx.get(orderRef);
    if (orderSnap.exists) {
      return {
        kind: "already",
        orderId,
        finalTotal: Number(orderSnap.data()?.finalTotal || 0),
      };
    }

    // Inventory is per PRODUCT, not per order line: lib/cart.ts keys cart
    // lines on id + size + color, so one product in two sizes arrives as two
    // lines sharing an id. Aggregating first — the same approach already
    // proven on the COD path — keeps the stock check and the write correct.
    const qtyByProduct = new Map<string, number>();
    const nameByProduct = new Map<string, string>();
    for (const line of pricing.items) {
      qtyByProduct.set(line.id, (qtyByProduct.get(line.id) || 0) + line.qty);
      if (!nameByProduct.has(line.id)) nameByProduct.set(line.id, line.name);
    }

    const productIds = [...qtyByProduct.keys()];
    const productRefs = productIds.map((id) => db.collection("products").doc(id));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    const userRef = db.collection("users").doc(intent.uid);
    const userSnap = await tx.get(userRef);

    const couponSnap = couponRef ? await tx.get(couponRef) : null;

    // ---- Assess, but never reject: the money is already taken ----
    const shortfalls: Shortfall[] = [];
    const decrements: { ref: FirebaseFirestore.DocumentReference; qty: number }[] = [];

    for (let i = 0; i < productIds.length; i++) {
      const id = productIds[i];
      const wanted = qtyByProduct.get(id) || 0;
      const snap = productSnaps[i];
      const label = nameByProduct.get(id) || "A product";

      if (!snap.exists) {
        shortfalls.push({ id, name: label, wanted, available: 0 });
        continue;
      }

      const available = Number((snap.data() as { stock?: unknown })?.stock ?? 0);

      if (available < wanted) {
        // Decrement what there is rather than nothing, so inventory still
        // reflects the units that genuinely shipped.
        shortfalls.push({ id, name: label, wanted, available });
        if (available > 0) decrements.push({ ref: productRefs[i], qty: available });
        continue;
      }

      decrements.push({ ref: productRefs[i], qty: wanted });
    }

    const couponConflict = !!couponSnap?.exists;

    const currentPoints = Number(userSnap.data()?.rewardPoints ?? 0);
    const balance =
      Number.isFinite(currentPoints) && currentPoints > 0 ? currentPoints : 0;
    // The customer was already charged with pricing.rewardValue deducted. If
    // the balance moved since, deduct what actually exists and record the gap
    // instead of failing — refusing would strand a captured payment.
    const actualRedeemed = Math.min(pricing.rewardValue, balance);
    const rewardShort = pricing.rewardValue - actualRedeemed;

    // ---- WRITES ----
    for (const { ref, qty } of decrements) {
      // stock and sales move in equal and opposite directions, conserving
      // stock + sales exactly as firestore.rules' isStockTransfer() requires.
      tx.update(ref, {
        stock: FieldValue.increment(-qty),
        sales: FieldValue.increment(qty),
      });
    }

    // finalTotal is the amount Razorpay actually captured, not a recomputed
    // figure — it is what the customer's card was debited. The rest of the
    // breakdown comes from the server-derived snapshot the charge was based
    // on. Field-for-field the shape the browser used to write, so seller
    // orders, invoices, analytics, wallet, payouts and computeVendorShare()
    // all keep reading exactly what they expect.
    const capturedRupees = Math.round(capturedAmountPaise) / 100;

    tx.set(orderRef, {
      customerName: intent.customerName,
      phone: intent.phone,
      address: intent.address,
      userEmail: intent.email,
      userId: intent.uid,
      vendorIds: pricing.vendorIds,
      items: pricing.items,
      total: pricing.subtotal,
      status: "Pending",
      paymentMethod: "ONLINE",
      paymentStatus: "Paid",
      shippingCharge: pricing.shipping,
      finalTotal: capturedRupees,
      deliveryDate: intent.deliveryDate,
      commission: pricing.commission,
      sellerEarning: pricing.sellerEarning,
      commissionRate: pricing.commissionRate,
      couponCode: intent.couponCode || "",
      discount: pricing.couponDiscount,
      // The rupee discount applied to this order's PRICE, not the points
      // actually deducted — which is what this field has always meant:
      // app/api/place-order writes pricing.rewardValue, and the legacy
      // browser buildOrderData() wrote the priced value too while separately
      // deducting a possibly-smaller actualRedeemed from the balance.
      //
      // Writing actualRedeemed here instead broke two things when the two
      // diverged: total - discount - rewardValue + shippingCharge no longer
      // equalled finalTotal, and computeVendorShare() — which folds this into
      // totalDiscount — subtracted too little and over-credited the vendor
      // relative to what the platform actually collected.
      //
      // The gap between priced and deducted is real money, and it is recorded
      // as rewardShortfall below plus needsReview, not hidden in this field.
      rewardValue: pricing.rewardValue,
      createdAt: Timestamp.now(),

      // Payment provenance, for reconciliation against the Razorpay dashboard.
      razorpayPaymentId,
      razorpayOrderId,
      finalizedBy: source,

      // Anything that needed tolerating rather than rejecting. Absent on a
      // clean order; present means an admin should look.
      ...(shortfalls.length > 0 ? { stockShortfall: shortfalls } : {}),
      ...(couponConflict ? { couponConflict: true } : {}),
      ...(rewardShort > 0 ? { rewardShortfall: rewardShort } : {}),
      ...(shortfalls.length > 0 || couponConflict || rewardShort > 0
        ? { needsReview: true }
        : {}),
    });

    if (couponRef && intent.couponCode && !couponConflict) {
      tx.set(couponRef, {
        userId: intent.uid,
        userEmail: intent.email,
        code: intent.couponCode,
        orderId,
        createdAt: Timestamp.now(),
      });
    }

    // Same net movement the COD path performs: spend what was redeemed, credit
    // what was earned.
    const newBalance = Math.max(0, balance + pricing.earnedPoints - actualRedeemed);
    if (newBalance !== balance) {
      tx.set(userRef, { rewardPoints: newBalance }, { merge: true });
    }

    return {
      kind: "created",
      orderId,
      finalTotal: capturedRupees,
      shortfalls,
      couponConflict,
      rewardShort,
    };
  });

  if (outcome.kind !== "created") return outcome;

  // ---- Best-effort, outside the transaction. None of these may fail an order
  // that has already committed and been paid for.

  const ledger: { type: string; points: number }[] = [];
  if (pricing.earnedPoints > 0) {
    ledger.push({ type: "Earned", points: pricing.earnedPoints });
  }
  const redeemed = pricing.rewardValue - (outcome.rewardShort || 0);
  if (redeemed > 0) ledger.push({ type: "Redeemed", points: redeemed });

  for (const entry of ledger) {
    try {
      await db.collection("rewardTransactions").add({
        userId: intent.uid,
        userEmail: intent.email,
        type: entry.type,
        points: entry.points,
        ...(entry.type === "Earned" ? { orderTotal: outcome.finalTotal } : {}),
        orderId,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("finalizeOnlineOrder: reward ledger write failed:", error);
    }
  }

  // Confirmation email. Sent from here rather than from the browser so the
  // webhook path — the whole reason the webhook exists — also reaches the
  // customer. Guarded by `kind === "created"` above, so whichever of the
  // browser callback and the webhook wins the race sends exactly one; the
  // loser returns before this point. The checkout page passes
  // skipConfirmationEmail for ONLINE so it does not send a second.
  //
  // Every value comes from the order document, never from a caller.
  try {
    const mailed = await sendOrderConfirmationEmail(orderId);
    if (!mailed.ok) {
      console.error("finalizeOnlineOrder: confirmation email:", mailed.reason);
    }
  } catch (error) {
    console.error("finalizeOnlineOrder: confirmation email threw:", error);
  }

  if (outcome.shortfalls?.length || outcome.couponConflict || outcome.rewardShort) {
    try {
      const parts: string[] = [];
      if (outcome.shortfalls?.length) {
        parts.push(
          `oversold: ${outcome.shortfalls
            .map((s) => `${s.name} (wanted ${s.wanted}, had ${s.available})`)
            .join("; ")}`
        );
      }
      if (outcome.couponConflict) parts.push(`coupon ${intent.couponCode} already redeemed`);
      if (outcome.rewardShort) parts.push(`reward shortfall ${outcome.rewardShort} points`);

      await db.collection("notifications").add({
        title: "⚠ Paid order needs review",
        message: `Order ${orderId.slice(0, 12)} was paid but ${parts.join(
          " · "
        )}. Payment was captured and the order was NOT rejected. Needs manual review.`,
        role: "admin",
        type: "order",
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("finalizeOnlineOrder: review notification failed:", error);
    }
  }

  return { kind: "created", orderId, finalTotal: outcome.finalTotal };
}
