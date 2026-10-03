import { getAdminDb } from "@/lib/firebaseAdmin";
import { YOMICO_COMMISSION_AMOUNT, YOMICO_COMMISSION_RATE } from "@/lib/commissionPolicy";
import { emitOrderPlacedNotifications } from "@/lib/orderNotifications";
import { mintNumbers } from "@/lib/humanIds";
import { applyPointsMovements, pointsLedgerId } from "@/lib/points/pointsLedger";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import type { OrderPricing } from "@/lib/orderPricing";
import { pointsHoldRef } from "@/lib/rewards/pointsHold";
import { REWARD_FUNDED_BY_YOMICO } from "@/lib/rewards/redemption";
import {
  planVariantDecrements,
  sumVariantStock,
  type VariantStockEntry,
} from "@/lib/products/inventory";
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

// ---------------------------------------------------------------------------
// ONE NORMAL PAYMENT PER INTENT
// ---------------------------------------------------------------------------
// orders/{paymentId} makes each PAYMENT idempotent, but nothing tied an intent
// (= one Razorpay order, one checkout) to a single payment: if Razorpay ever
// captured a second, different payment against the same Razorpay order, it
// would have become a second full order — stock, sales, coupon, reward points,
// seller earnings, notifications all over again. Both finalizers now claim
// paymentIntents/{razorpayOrderId}.finalizedPaymentId inside the SAME
// transaction that creates the normal order, so two payments racing against
// one intent cannot both become the normal order.
//
// A second payment is never rejected (see MONEY-SAFETY RULE): it is recorded
// at orders/{itsPaymentId} as an inert, already-cancelled, refund-owed record
// — the exact state app/api/cancel-order leaves a paid ONLINE order in — so
// the captured money is visible in the admin refund queue, while no normal
// economic or fulfilment effect runs: no stock/sales, no order/payment number,
// no coupon claim, no reward spend or ledger, no cart clearing, no customer or
// seller notification or email. vendorIds/items are empty so no seller sees
// it or earns from it, it has no rewardPointsStatus so it is never credited
// points, and Cancelled cannot be cancelled, confirmed or dispatched.

/** Firestore record for a second captured payment against an already-finalized intent. */
export function duplicateIntentPaymentRecord(params: {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  /** The payment that already finalized this intent. */
  duplicateOf: string;
  capturedRupees: number;
  source: string;
  uid: string;
  email: string | null;
  customerName: string;
  phone: string;
  address: string;
}): Record<string, unknown> {
  const now = Timestamp.now();
  return {
    userId: params.uid,
    userEmail: params.email || "",
    customerEmail: params.email || "",
    customerName: params.customerName,
    phone: params.phone,
    address: params.address,
    vendorIds: [],
    items: [],
    paymentMethod: "ONLINE",
    paymentStatus: "Paid",
    status: "Cancelled",
    total: params.capturedRupees,
    finalTotal: params.capturedRupees,
    refundStatus: "Required",
    refundAmountDue: params.capturedRupees,
    refundRequestedAt: now,
    needsReview: true,
    duplicateIntentPayment: params.duplicateOf,
    razorpayPaymentId: params.razorpayPaymentId,
    razorpayOrderId: params.razorpayOrderId,
    finalizedBy: params.source,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Whether an order document is the NORMAL order a captured payment produced
 * for this checkout — i.e. what a finalizer writes, not the inert duplicate
 * record above. Finalizers key the order on its own Razorpay payment id and
 * only ever do so after Razorpay confirmed the capture, so id === the stored
 * razorpayPaymentId is the capture evidence. paymentStatus / status are
 * deliberately NOT consulted: a later cancellation or refund of that first
 * payment does not undo the fact that it was captured and finalized.
 */
function isFinalizedPaymentOrder(
  id: string,
  data: FirebaseFirestore.DocumentData,
  razorpayOrderId: string
): boolean {
  return (
    data.paymentMethod === "ONLINE" &&
    data.razorpayOrderId === razorpayOrderId &&
    typeof data.razorpayPaymentId === "string" &&
    data.razorpayPaymentId === id &&
    !data.duplicateIntentPayment
  );
}

/**
 * Which payment already finalized this intent, read INSIDE the caller's
 * transaction (reads only — call before any write).
 *
 * Intents finalized before finalizedPaymentId existed carry no claim, and
 * intents never expire, so an unclaimed intent is also checked for a normal
 * order it already produced (orders where razorpayOrderId == this intent).
 * When one exists, its payment is the finalized one; `legacyFinalizedAt` is
 * then set so the caller records the missing claim in the same transaction.
 */
export async function readIntentFinalization(
  tx: Transaction,
  db: FirebaseFirestore.Firestore,
  intentRef: FirebaseFirestore.DocumentReference,
  razorpayOrderId: string
): Promise<{ intentExists: boolean; finalizedPaymentId: string | null; legacyFinalizedAt: Timestamp | null }> {
  const intentSnap = await tx.get(intentRef);
  if (!intentSnap.exists) {
    return { intentExists: false, finalizedPaymentId: null, legacyFinalizedAt: null };
  }
  const claimed = intentSnap.data()?.finalizedPaymentId;
  if (typeof claimed === "string" && claimed) {
    return { intentExists: true, finalizedPaymentId: claimed, legacyFinalizedAt: null };
  }
  const legacy = await tx.get(
    db.collection("orders").where("razorpayOrderId", "==", razorpayOrderId).limit(20)
  );
  const finalized = legacy.docs
    .filter((d) => isFinalizedPaymentOrder(d.id, d.data(), razorpayOrderId))
    .map((d) => ({ id: d.id, createdAt: d.data().createdAt }))
    .sort((a, b) => (a.createdAt?.toMillis?.() ?? 0) - (b.createdAt?.toMillis?.() ?? 0));
  if (finalized.length === 0) {
    return { intentExists: true, finalizedPaymentId: null, legacyFinalizedAt: null };
  }
  const first = finalized[0];
  return {
    intentExists: true,
    finalizedPaymentId: first.id,
    legacyFinalizedAt: first.createdAt instanceof Timestamp ? first.createdAt : Timestamp.now(),
  };
}

/** Admin review alert for a duplicate payment — the same notifications shape the finalizers already use. */
export async function notifyDuplicateIntentPayment(
  db: FirebaseFirestore.Firestore,
  params: { razorpayPaymentId: string; razorpayOrderId: string; duplicateOf: string; capturedRupees: number }
): Promise<void> {
  try {
    await db.collection("notifications").add({
      title: "⚠ Duplicate payment needs refund",
      message: `Payment ${params.razorpayPaymentId} (₹${params.capturedRupees}) was captured for checkout ${params.razorpayOrderId}, which was already paid by ${params.duplicateOf}. No second order was placed; record ${params.razorpayPaymentId.slice(0, 12)} is marked Refund Required. Refund it in Razorpay, then record the refund.`,
      role: "admin",
      type: "order",
      read: false,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("notifyDuplicateIntentPayment: notification failed:", error);
  }
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

  const intentRef = db.collection("paymentIntents").doc(razorpayOrderId);

  const outcome = await db.runTransaction<
    FinalizeResult & {
      shortfalls?: Shortfall[];
      couponConflict?: boolean;
      rewardShort?: number;
      duplicateOf?: string;
    }
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

    // One normal payment per intent (see ONE NORMAL PAYMENT PER INTENT). A
    // different payment already finalized this intent -> record this one as
    // an inert duplicate and stop before any normal effect.
    const finalization = await readIntentFinalization(tx, db, intentRef, razorpayOrderId);
    const finalizedPaymentId = finalization.finalizedPaymentId;
    if (finalizedPaymentId) {
      const duplicateRupees = Math.round(capturedAmountPaise) / 100;
      // A legacy intent (finalized before the claim existed): record the claim
      // it is missing, atomically with the decision below.
      if (finalization.legacyFinalizedAt) {
        tx.update(intentRef, { finalizedPaymentId, finalizedAt: finalization.legacyFinalizedAt });
      }
      if (finalizedPaymentId === razorpayPaymentId) {
        return { kind: "already", orderId, finalTotal: duplicateRupees };
      }
      tx.set(
        orderRef,
        duplicateIntentPaymentRecord({
          razorpayPaymentId,
          razorpayOrderId,
          duplicateOf: finalizedPaymentId,
          capturedRupees: duplicateRupees,
          source,
          uid: intent.uid,
          email: intent.email,
          customerName: intent.customerName,
          phone: intent.phone,
          address: intent.address,
        })
      );
      return { kind: "created", orderId, finalTotal: duplicateRupees, duplicateOf: finalizedPaymentId };
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

    // Per-(product, variant) demand — Strategy 1, same shape the COD path uses.
    // Variant-authoritative only when the product has variants AND every line
    // for it carries a variantId; otherwise the product-level path is kept.
    const variantDemandByProduct = new Map<string, Map<string, number>>();
    const productHasNonVariantLine = new Set<string>();
    for (const line of pricing.items) {
      if (line.variantId) {
        let m = variantDemandByProduct.get(line.id);
        if (!m) { m = new Map(); variantDemandByProduct.set(line.id, m); }
        m.set(line.variantId, (m.get(line.variantId) || 0) + line.qty);
      } else {
        productHasNonVariantLine.add(line.id);
      }
    }

    const productIds = [...qtyByProduct.keys()];
    const productRefs = productIds.map((id) => db.collection("products").doc(id));
    const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

    const userRef = db.collection("users").doc(intent.uid);
    const userSnap = await tx.get(userRef);

    const couponSnap = couponRef ? await tx.get(couponRef) : null;
    // The reserve taken at /api/create-order for this payment's points.
    const holdRef = pointsHoldRef(db, intent.uid);
    const holdSnap = pricing.rewardValue > 0 ? await tx.get(holdRef) : null;

    // ---- Assess, but never reject: the money is already taken ----
    // A product-level decrement (legacy shape). A variant-path product records
    // its full decremented variants[] plan instead, applied at write time.
    const shortfalls: Shortfall[] = [];
    const decrements: { ref: FirebaseFirestore.DocumentReference; qty: number }[] = [];
    const variantWrites: {
      ref: FirebaseFirestore.DocumentReference;
      newVariants: VariantStockEntry[];
      taken: number;
    }[] = [];

    for (let i = 0; i < productIds.length; i++) {
      const id = productIds[i];
      const wanted = qtyByProduct.get(id) || 0;
      const snap = productSnaps[i];
      const label = nameByProduct.get(id) || "A product";

      if (!snap.exists) {
        shortfalls.push({ id, name: label, wanted, available: 0 });
        continue;
      }

      const data = snap.data() as { stock?: unknown; variants?: VariantStockEntry[] };
      const variantDemand = variantDemandByProduct.get(id);
      const useVariantPath =
        Array.isArray(data.variants) &&
        data.variants.length > 0 &&
        !!variantDemand &&
        !productHasNonVariantLine.has(id);

      if (useVariantPath) {
        // Take what each chosen variant has; a shortage is recorded and the
        // order flagged for review — never rejected, because the payment is
        // already captured. product.stock is derived from the new variant
        // totals at write time.
        const plan = planVariantDecrements(data.variants!, variantDemand!);
        for (const sf of plan.shortfalls) {
          shortfalls.push({ id, name: label, wanted: sf.wanted, available: sf.available });
        }
        variantWrites.push({ ref: productRefs[i], newVariants: plan.newVariants, taken: plan.totalTaken });
        continue;
      }

      const available = Number(data.stock ?? 0);

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

    // finalTotal is the amount Razorpay actually captured, not a recomputed
    // figure — it is what the customer's card was debited. The rest of the
    // breakdown comes from the server-derived snapshot the charge was based
    // on. Field-for-field the shape the browser used to write, so seller
    // orders, invoices, analytics, wallet, payouts and computeVendorShare()
    // all keep reading exactly what they expect.
    const capturedRupees = Math.round(capturedAmountPaise) / 100;

    // Human-readable numbers, minted after all reads/validation above and
    // BEFORE the first write below. mintNumbers reads its counters (tx.get)
    // and then writes them, so it must run before any product/order write or
    // Firestore rejects the transaction ("all reads before all writes").
    const [orderNumber, paymentNumber] = await mintNumbers(tx, db, [
      { kind: "daily", daily: "order", at: new Date() },
      { kind: "seq", counter: "payment" },
    ]);

    // ---- WRITES ----
    for (const { ref, qty } of decrements) {
      // stock and sales move in equal and opposite directions, conserving
      // stock + sales exactly as firestore.rules' isStockTransfer() requires.
      tx.update(ref, {
        stock: FieldValue.increment(-qty),
        sales: FieldValue.increment(qty),
      });
    }
    // Variant-path products: write the decremented variants[] and the derived
    // product.stock together, so the two ledgers stay consistent.
    for (const { ref, newVariants, taken } of variantWrites) {
      tx.update(ref, {
        variants: newVariants,
        stock: sumVariantStock(newVariants),
        sales: FieldValue.increment(taken),
      });
    }

    // Inventory + Order Consistency V1 — ONLY when a shortfall happened
    // (never rejected above, since the payment is already captured): the
    // order's own items[].qty stays the customer's ORIGINALLY REQUESTED
    // quantity (unchanged, so pricing/receipts stay honest about what was
    // paid for), which can now exceed what was ACTUALLY decremented from
    // inventory. Without recording the real figure, cancelling this order
    // later (app/api/cancel-order) would restore the requested quantity —
    // creating stock units that were never actually taken. This is the
    // minimal additive marker: the actual total decremented per product,
    // straight off the decrements/variantWrites already computed above —
    // no new computation, just persisting it. Absent on the (overwhelmingly
    // common) clean order with no shortfall.
    const stockDeductedQty: Record<string, number> = {};
    if (shortfalls.length > 0) {
      for (const { ref, qty } of decrements) {
        stockDeductedQty[ref.id] = (stockDeductedQty[ref.id] || 0) + qty;
      }
      for (const { ref, taken } of variantWrites) {
        stockDeductedQty[ref.id] = (stockDeductedQty[ref.id] || 0) + taken;
      }
    }

    tx.set(orderRef, {
      orderNumber,
      paymentNumber,
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
      // Delivery-cost snapshot (concepts B/C), additive and distinct from
      // shippingCharge (A). Seller responsibility is derived from these in
      // lib/vendorPayable; admin/server-written only.
      deliveryCost: pricing.deliveryCost,
      freeDeliveryApplied: pricing.freeDeliveryApplied,
      finalTotal: capturedRupees,
      deliveryDate: intent.deliveryDate,
      // Commission is permanently 0% / ₹0 (lib/commissionPolicy.ts) — stamped
      // from the constant, never from the intent, so an intent priced under an
      // old setting cannot carry a commission onto the order.
      commission: YOMICO_COMMISSION_AMOUNT,
      // Whole-order legacy figure; YOMICO funds redeemed points, so they are
      // added back (computeVendorShare is what payouts actually read).
      sellerEarning: capturedRupees + pricing.rewardValue,
      commissionRate: YOMICO_COMMISSION_RATE,
      commissionAmount: YOMICO_COMMISSION_AMOUNT,
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
      ...(pricing.rewardValue > 0 ? { rewardFundedBy: REWARD_FUNDED_BY_YOMICO } : {}),
      createdAt: Timestamp.now(),

      // Opts this order into deferred reward crediting, exactly as
      // app/api/place-order does. Paid is not earned: the points are granted
      // by app/api/credit-reward-points once the order is also delivered and
      // past its return window. See lib/rewardCredit.ts.
      rewardPointsStatus: "pending",

      // Payment provenance, for reconciliation against the Razorpay dashboard.
      razorpayPaymentId,
      razorpayOrderId,
      finalizedBy: source,

      // Anything that needed tolerating rather than rejecting. Absent on a
      // clean order; present means an admin should look.
      ...(shortfalls.length > 0 ? { stockShortfall: shortfalls } : {}),
      ...(Object.keys(stockDeductedQty).length > 0 ? { stockDeductedQty } : {}),
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

    // This payment is now THE normal payment for the intent — committed
    // atomically with the order above, so a racing second payment either sees
    // it (duplicate path) or conflicts and retries into it.
    if (finalization.intentExists) {
      tx.update(intentRef, { finalizedPaymentId: razorpayPaymentId, finalizedAt: Timestamp.now() });
    }

    // Same net movement the COD path performs: spend what was redeemed, and
    // nothing more. An ONLINE order is Paid at creation but not yet delivered
    // and nowhere near the end of its return window, so its points are not
    // earned — app/api/credit-reward-points grants them later.
    //
    // The deduction and its "Redeemed" ledger row (redeem_{orderId}) move
    // together inside this transaction (lib/points). The balance result is
    // unchanged — max(0, balance − actualRedeemed) — and any part of
    // pricing.rewardValue the balance could not cover is recorded on the row
    // as an explicit shortfall (the same figure as rewardShortfall above).
    if (pricing.rewardValue > 0) {
      // This payment's reserve ends with the order (only if it is this
      // payment's — never another session's).
      if (holdSnap?.exists && holdSnap.get("razorpayOrderId") === razorpayOrderId) {
        tx.delete(holdRef);
      }
      applyPointsMovements(
        tx,
        db,
        { ref: userRef, snap: userSnap, uid: intent.uid, email: intent.email, write: "merge" },
        [
          {
            kind: "checkout_redeem",
            id: pointsLedgerId.redeem(orderId),
            requested: -pricing.rewardValue,
            allowShortfall: true,
            refs: { orderId },
          },
        ]
      );
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

  // Duplicate payment: the admin refund alert is the ONLY effect. No reward
  // ledger, no confirmation email, no order notifications.
  if (outcome.duplicateOf) {
    await notifyDuplicateIntentPayment(db, {
      razorpayPaymentId,
      razorpayOrderId,
      duplicateOf: outcome.duplicateOf,
      capturedRupees: outcome.finalTotal,
    });
    return { kind: "already", orderId, finalTotal: outcome.finalTotal };
  }

  // ---- Best-effort, outside the transaction. None of these may fail an order
  // that has already committed and been paid for.

  // The reward ledger row is written inside the transaction above; no
  // "Earned" row at creation — see app/api/place-order for why.

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
  // In-app notifications, for the WEBHOOK path only.
  //
  // The browser path writes these itself, in app/checkout/page.tsx's
  // applyPostOrderEffects() — the same admin, per-vendor seller and customer
  // documents. Running both would file two of each for one order, so this is
  // gated on source rather than skipped from the caller the way the
  // confirmation email is.
  //
  // Exactly one set is written in either race order: when the browser wins it
  // reaches applyPostOrderEffects with alreadyPlaced === false and notifies;
  // when the webhook wins it notifies here, and the browser then takes its
  // alreadyPlaced branch, which writes nothing.
    // Emitted for BOTH sources now, not only the webhook.
    //
    // The browser used to write this set when it won the finalisation race,
    // and this block covered the webhook-wins case. The browser no longer
    // writes notifications at all -- that is exactly what allowed a customer
    // to forge role:"admin" -- so the server must cover both orders of the
    // race. Still exactly once: the early return above leaves only the
    // kind === "created" path here, and the deterministic order id means
    // only one caller ever creates.
    try {
      await emitOrderPlacedNotifications(db, {
        customerName: intent.customerName,
        customerUid: intent.uid,
        orderTotal: outcome.finalTotal,
      });
    } catch (error) {
      console.error("finalizeOnlineOrder: notification failed:", error);
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

/**
 * Records a captured payment that could not be turned into an order.
 *
 * Called from both finalisation entry points, for the cases where Razorpay
 * has confirmed money moved but there is nothing to build an order from. The
 * alternative is what used to happen: a console.error, and a payment whose
 * only trace is a Vercel log line.
 *
 * Deliberately NOT called for verification failures. Everything here runs
 * downstream of a successful verifyRazorpayPayment (browser) or a valid
 * webhook signature, so an unauthenticated caller posting junk identifiers
 * cannot write into this collection.
 *
 * No order is created from these records. Without a payment intent there is
 * no priced cart, no vendor split and no commission basis, so an invented
 * order would feed fabricated figures into the payout chain. Reconciliation
 * against the Razorpay dashboard is manual by design; this exists to make
 * that possible.
 *
 * Never throws — an audit record must not fail a request whose payment has
 * already been captured.
 */
export async function recordUnmatchedPayment(params: {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  amountPaise: number;
  reason: string;
  /** Which entry point saw it. Both write the same doc id, so last one wins. */
  source: "browser" | "webhook";
  uid?: string | null;
  expectedAmountPaise?: number | null;
}): Promise<void> {
  const {
    razorpayPaymentId,
    razorpayOrderId,
    amountPaise,
    reason,
    source,
    uid,
    expectedAmountPaise,
  } = params;

  const db = getAdminDb();

  // Keyed by payment id so a webhook redelivery — or the webhook arriving
  // after the browser already recorded the same orphan — overwrites rather
  // than piling up duplicates for one payment.
  //
  // Identifiers and amounts only: no signature, no secret, and no card or
  // payer detail is copied out of the payment payload.
  try {
    await db
      .collection("unmatchedPayments")
      .doc(razorpayPaymentId)
      .set({
        razorpayPaymentId,
        razorpayOrderId,
        amountPaise,
        reason,
        source,
        // Set now so a future admin view can filter without a backfill.
        resolved: false,
        seenAt: Timestamp.now(),
        ...(uid ? { uid } : {}),
        ...(expectedAmountPaise != null ? { expectedAmountPaise } : {}),
      });
  } catch (error) {
    console.error("recordUnmatchedPayment: failed to record:", error);
  }

  // Surfaced through the existing admin feed rather than a new page:
  // app/admin/notifications/page.tsx already queries role == "admin" and
  // renders type == "order". Without this the record above is written into a
  // collection no client rule grants read access to, so nobody would see it.
  try {
    await db.collection("notifications").add({
      title: "⚠ Captured payment with no order",
      message: `Payment ${razorpayPaymentId} of ₹${(
        Math.round(amountPaise) / 100
      ).toLocaleString("en-IN")} was captured but ${reason}. No order was created. Reconcile against the Razorpay dashboard.`,
      role: "admin",
      type: "order",
      read: false,
      createdAt: Timestamp.now(),
    });
  } catch (error) {
    console.error("recordUnmatchedPayment: admin notification failed:", error);
  }
}
