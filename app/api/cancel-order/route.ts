import { verifyRequestUser, type VerifiedUser } from "@/lib/serverAuth";
import { shouldReverseEarnedPoints } from "@/lib/rewardCredit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  FieldValue,
  Timestamp,
  type Transaction,
} from "firebase-admin/firestore";
import {
  applyVariantRestores,
  sumVariantStock,
  type VariantStockEntry,
} from "@/lib/products/inventory";
import { emitDeliveryNotification } from "@/lib/deliveryEngine/notifications";

// ---------------------------------------------------------------------------
// Single server-authoritative cancellation path.
//
// Replaces three separate client-side implementations that had drifted apart:
//   app/orders/page.tsx            (customer) - restored stock, reversed
//                                   reward points, released the coupon
//   app/seller/orders/page.js      (seller)   - restored stock ONLY
//   app/seller/orders/[id]/page.tsx(seller)   - restored stock ONLY
//
// So which button was pressed silently changed the financial outcome: a
// seller-cancelled order left the customer's reward points credited for an
// order that never happened AND left their coupon consumed. This route makes
// both paths identical.
//
// The client sends only an orderId. Authorization, cancellability, the items,
// the quantities and every amount are read from Firestore server-side — none
// of it is accepted from the request.
//
// NOTE: no caller is migrated yet, and no Firestore rule has changed, so the
// existing client-side cancellation paths still work. Migrating them is the
// next step; the rules tightening comes last.
// ---------------------------------------------------------------------------

// Same rateLimits collection / window-count shape as
// app/api/create-order/route.ts. That helper is module-local and not
// exported, so it is duplicated by convention (send-verification-email and
// the AI routes do the same) under its own key namespace.
const CANCEL_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const CANCEL_RATE_LIMIT_MAX = 20;

async function isWithinCancelRateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`cancel-order_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > CANCEL_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= CANCEL_RATE_LIMIT_MAX) return false;

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

// Two order-creation paths write two DIFFERENT item shapes into the SAME
// `orders/{id}.items[]` array:
//   web (lib/orderPricing.ts's PricedLineItem, via app/api/place-order and
//        lib/onlineOrder.ts)   — id IS the product id; quantity is `qty`.
//   mobile (app/api/mobile/place-order)
//        — `id` is the CART DOCUMENT id (never a product), the product id is
//          `productId`, and quantity is `quantity`, not `qty`.
// Reading only `item.qty`/`item.id` here silently restored ZERO stock for
// every mobile-app order (id resolved to a nonexistent "product", qty was
// always undefined) — this type/the resolution below accepts both shapes.
type OrderItem = {
  id?: unknown;
  productId?: unknown;
  qty?: unknown;
  quantity?: unknown;
  variantId?: unknown;
};

type OrderRecord = {
  userId?: unknown;
  userEmail?: unknown;
  vendorIds?: unknown;
  items?: unknown;
  status?: unknown;
  finalTotal?: unknown;
  rewardValue?: unknown;
  couponCode?: unknown;
  paymentMethod?: unknown;
  paymentStatus?: unknown;
  // Inventory + Order Consistency V1 — see lib/onlineOrder.ts's own comment.
  // Present only when a stock shortfall happened at order-creation time (the
  // Razorpay finalize path never rejects, since the payment is already
  // captured): the ACTUAL total decremented per product, which can be less
  // than the sum of items[].qty for that product.
  stockDeductedQty?: unknown;
};

// Mirrors isLegalOrderStatusTransition() in firestore.rules: Cancelled is
// only reachable from these three. Deliberately applied to admins too — an
// admin "cancelling" a Delivered order would restore stock for goods the
// customer already has.
const CANCELLABLE_STATUSES = ["Pending", "Confirmed", "Packed"];

type AuthzResult =
  | { ok: true; role: "customer" | "vendor" | "admin" }
  | { ok: false; status: number; error: string };

// Mirrors the orders update rule's own branches, server-side. The customer
// boundary stays deliberately narrower than the vendor's, exactly as today:
// a customer may only cancel while Pending.
function authorize(order: OrderRecord, requester: VerifiedUser): AuthzResult {
  const status = typeof order.status === "string" ? order.status : "";
  const vendorIds = Array.isArray(order.vendorIds) ? order.vendorIds : [];

  if (order.userId === requester.uid) {
    if (status !== "Pending") {
      return {
        ok: false,
        status: 409,
        error: "This order can no longer be cancelled.",
      };
    }
    return { ok: true, role: "customer" };
  }

  if (vendorIds.includes(requester.uid)) {
    if (!CANCELLABLE_STATUSES.includes(status)) {
      return {
        ok: false,
        status: 409,
        error: "This order can no longer be cancelled.",
      };
    }
    return { ok: true, role: "vendor" };
  }

  if (requester.isAdmin) {
    if (!CANCELLABLE_STATUSES.includes(status)) {
      return {
        ok: false,
        status: 409,
        error: "This order can no longer be cancelled.",
      };
    }
    return { ok: true, role: "admin" };
  }

  // Same shape as send-order-email: don't confirm an order exists to
  // someone who has no business seeing it.
  return { ok: false, status: 404, error: "Order not found." };
}

// Discriminated union rather than an outer mutable flag: the transaction may
// be retried by Firestore, so every attempt must produce its own complete
// result instead of mutating shared state a retry could leave stale.
type CancelOutcome =
  | { kind: "error"; status: number; error: string }
  | { kind: "already" }
  | {
      kind: "cancelled";
      restockedItems: number;
      earnedPoints: number;
      redeemedValue: number;
      orderUserId: string | null;
      orderUserEmail: string | null;
    };

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);

    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinCancelRateLimit(requester.uid))) {
      return Response.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    if (typeof body !== "object" || body === null) {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const { orderId } = body as { orderId?: unknown };

    if (typeof orderId !== "string" || !orderId || orderId.length > 200) {
      return Response.json({ error: "A valid orderId is required." }, { status: 400 });
    }

    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);

    // Authorization is decided against the order as it exists NOW, read
    // inside the transaction rather than beforehand — which also makes the
    // double-cancel guard race-proof: two concurrent calls cannot both
    // observe a non-Cancelled status and both restore stock.
    const outcome = await db.runTransaction<CancelOutcome>(
      async (tx: Transaction) => {
        const orderSnap = await tx.get(orderRef);

        if (!orderSnap.exists) {
          return { kind: "error", status: 404, error: "Order not found." };
        }

        const order = orderSnap.data() as OrderRecord;

        // Idempotent: already cancelled means nothing to undo. Checked
        // before authorization's status test so a repeat call returns a
        // clean success rather than a confusing 409.
        if (order.status === "Cancelled") {
          return { kind: "already" };
        }

        const authz = authorize(order, requester);
        if (!authz.ok) {
          return { kind: "error", status: authz.status, error: authz.error };
        }

        // ---- ALL READS FIRST (Firestore transaction requirement) ----
        const items = Array.isArray(order.items)
          ? (order.items as OrderItem[])
          : [];

        // Aggregate restock per PRODUCT (one write per product doc), capturing
        // per-variant restore quantities when the order line carries a
        // variantId — Strategy 1. A product read once; the same snapshot's
        // variants[] are restored and product.stock re-derived together at
        // write time so the two ledgers cannot drift. A historical line with no
        // variantId (or a product with no variants) keeps the product-level
        // restore, and a variantId no longer present on the product falls back
        // to product-level for that quantity rather than inventing a variant.
        type RestockPlan = {
          ref: FirebaseFirestore.DocumentReference;
          variants: VariantStockEntry[] | null;
          productLevelQty: number; // restored via product.stock increment
          variantRestore: Map<string, number>; // variantId -> qty (variant path)
        };
        const restockByProduct = new Map<string, RestockPlan>();

        for (const item of items) {
          // Prefer `productId` (mobile's real product reference) over `id`
          // (mobile's `id` is the cart document, not a product; web has no
          // separate productId and uses `id` as the product id directly —
          // see the OrderItem type comment above).
          const id =
            typeof item?.productId === "string" && item.productId
              ? item.productId
              : item?.id;
          const qty = Number(item?.qty ?? item?.quantity);
          if (typeof id !== "string" || !id || !Number.isFinite(qty) || qty <= 0) {
            continue;
          }
          let plan = restockByProduct.get(id);
          if (!plan) {
            const ref = db.collection("products").doc(id);
            const snap = await tx.get(ref);
            // Skip products that no longer exist rather than aborting the whole
            // cancellation — matches the previous best-effort tolerance.
            if (!snap.exists) continue;
            const data = snap.data() as { variants?: VariantStockEntry[] };
            const variants = Array.isArray(data.variants) ? data.variants : null;
            plan = { ref, variants, productLevelQty: 0, variantRestore: new Map() };
            restockByProduct.set(id, plan);
          }

          const variantId =
            typeof item?.variantId === "string" ? item.variantId : "";
          const variantExists =
            !!variantId &&
            !!plan.variants &&
            plan.variants.some((v) => v?.id === variantId);

          if (variantExists) {
            plan.variantRestore.set(
              variantId,
              (plan.variantRestore.get(variantId) || 0) + qty
            );
          } else {
            // No variantId, product has no variants, or the variant was
            // deleted since purchase: restore at product level, never guess.
            plan.productLevelQty += qty;
          }
        }

        // Inventory + Order Consistency V1 — if this order had a stock
        // shortfall at creation (lib/onlineOrder.ts's stockDeductedQty),
        // items[].qty summed above is the customer's ORIGINAL request, which
        // can exceed what was actually taken from inventory. Restoring the
        // requested amount would create phantom stock that was never
        // removed. Trust the recorded actual figure instead — but ONLY for
        // the plain product-level bucket (variantRestore empty): a per-
        // variant shortfall is not attributable back to one variant from
        // this aggregate total alone, so that rarer combination is left as
        // the existing (pre-this-fix) behavior rather than risking a wrong
        // per-variant split.
        const stockDeductedQty =
          order.stockDeductedQty && typeof order.stockDeductedQty === "object"
            ? (order.stockDeductedQty as Record<string, unknown>)
            : null;
        if (stockDeductedQty) {
          for (const [productId, plan] of restockByProduct) {
            if (plan.variantRestore.size > 0) continue;
            const actual = Number(stockDeductedQty[productId]);
            if (Number.isFinite(actual) && actual >= 0 && actual !== plan.productLevelQty) {
              plan.productLevelQty = actual;
            }
          }
        }

        const orderUserId =
          typeof order.userId === "string" ? order.userId : null;

        // Same formula the customer path used: earnedPoints isn't persisted
        // on the order, so it is recomputed with checkout's own
        // Math.floor(finalTotal / 100) against the order's stored total.
        //
        // DEFERRED CREDITING: reverse an earn only if one actually happened.
        // Points are no longer granted at creation — an order carries
        // rewardPointsStatus "pending" until app/api/credit-reward-points
        // grants them, which cannot happen before its return window closes.
        // Cancelling a pending order must deduct NOTHING; subtracting
        // unconditionally would confiscate points the customer earned on
        // entirely unrelated orders. Orders with no status field predate the
        // rule, were credited at creation, and are still reversed as before.
        const earnedPoints = shouldReverseEarnedPoints(order)
          ? Math.floor(Number(order.finalTotal || 0) / 100)
          : 0;
        const redeemedValue = Number(order.rewardValue || 0);
        const adjustsPoints =
          !!orderUserId && (earnedPoints > 0 || redeemedValue > 0);

        const userRef = orderUserId
          ? db.collection("users").doc(orderUserId)
          : null;
        const userSnap = adjustsPoints && userRef ? await tx.get(userRef) : null;

        // F010 gives redemptions a deterministic id, so the claim can be
        // read inside the transaction instead of queried (transactions
        // cannot run queries). Legacy random-id claims are swept up
        // best-effort after the transaction.
        const code =
          typeof order.couponCode === "string"
            ? order.couponCode.trim().toUpperCase()
            : "";
        const couponRef =
          code && orderUserId
            ? db.collection("couponRedemptions").doc(`${orderUserId}_${code}`)
            : null;
        const couponSnap = couponRef ? await tx.get(couponRef) : null;

        // Delivery Engine integration (Payment Lifecycle V1): "Confirmed" and
        // "Packed" are BOTH cancellable (CANCELLABLE_STATUSES above) AND
        // materializable (jobFactory.ts's MATERIALIZABLE_STATUSES) — so a
        // DeliveryJob can already exist for an order being cancelled here.
        // Without this, a rider/company dispatcher could keep physically
        // executing a shipment (pickup, hub handoff, out-for-delivery,
        // delivery) for a sale that no longer exists. This does NOT touch
        // payment/refund state (owesRefund below is the only payment-side
        // effect of cancellation) — it only halts further physical execution.
        // Every delivery-engine transition already rejects job.status
        // "Cancelled"/"Returned" (see lib/deliveryEngine/execution.ts,
        // hubIntake.ts, transit.ts, destinationHub.ts, finalMileAssign.ts,
        // destinationHandover.ts, codPayment.ts, deliveryException.ts) — this
        // is simply the first and only writer of that value.
        const deliveryJobsSnap = await tx.get(
          db.collection("deliveryJobs").where("orderId", "==", orderId)
        );
        const DELIVERY_TERMINAL = new Set(["Delivered", "Cancelled", "Returned"]);
        type HaltPlan = {
          jobRef: FirebaseFirestore.DocumentReference;
          orderNumber: string;
          shipmentNumber: string;
          personRef: FirebaseFirestore.DocumentReference | null;
          personUid: string | null;
          personWasBusy: boolean;
        };
        const deliveryJobsToHalt: HaltPlan[] = [];
        for (const jobDoc of deliveryJobsSnap.docs) {
          const jobData = jobDoc.data() as {
            status?: string;
            assignedPersonId?: string | null;
            orderNumber?: string;
            shipmentNumber?: string;
          };
          if (jobData.status && DELIVERY_TERMINAL.has(jobData.status)) continue;

          // Free the assigned delivery person (Busy -> Available only — never
          // clobber a manual Offline) and get their uid for a courtesy
          // notification. Read before any write, same discipline the
          // delivery engine itself uses (see lib/deliveryEngine/
          // assignment.ts's own freeIfBusy).
          let personRef: FirebaseFirestore.DocumentReference | null = null;
          let personUid: string | null = null;
          let personWasBusy = false;
          if (typeof jobData.assignedPersonId === "string" && jobData.assignedPersonId) {
            const pRef = db.collection("deliveryPersons").doc(jobData.assignedPersonId);
            const pSnap = await tx.get(pRef);
            if (pSnap.exists) {
              const pData = pSnap.data() as { availability?: string; uid?: string };
              personRef = pRef;
              personUid = typeof pData.uid === "string" ? pData.uid : null;
              personWasBusy = pData.availability === "Busy";
            }
          }

          deliveryJobsToHalt.push({
            jobRef: jobDoc.ref,
            orderNumber: typeof jobData.orderNumber === "string" ? jobData.orderNumber : "",
            shipmentNumber: typeof jobData.shipmentNumber === "string" ? jobData.shipmentNumber : "",
            personRef,
            personUid,
            personWasBusy,
          });
        }

        // Cancelling a captured ONLINE payment creates an obligation to return
        // real money. Cancellation records that obligation; it deliberately
        // does NOT execute the refund — no Razorpay call happens here, and
        // paymentStatus stays "Paid" until money has actually been returned.
        //
        // Without this the obligation was invisible: an order could be
        // Cancelled while paymentStatus remained "Paid" with nothing anywhere
        // indicating a refund was owed (see order pay_TTvsOzR88T5Ed7).
        //
        // ONLINE + Paid only. A Pay-on-Delivery / COD order is cancelled
        // before any money is collected, so there is nothing to refund and
        // none of these fields are written.
        //
        // refundAmountDue is the full finalTotal, shipping included, because
        // cancellation happens before dispatch. A partial-return refund is a
        // different calculation and belongs to the return flow, not here.
        //
        // refundedAmount and refundTransactionId are deliberately NOT written
        // yet — absent means "nothing refunded", the same convention
        // needsReview uses. Writing 0 would read as "refunded ₹0".
        const owesRefund =
          order.paymentMethod === "ONLINE" && order.paymentStatus === "Paid";

        // ---- WRITES ----
        tx.update(orderRef, {
          status: "Cancelled",
          updatedAt: Timestamp.now(),
          ...(owesRefund
            ? {
                refundStatus: "Required",
                refundAmountDue: Number(order.finalTotal || 0),
                refundRequestedAt: Timestamp.now(),
              }
            : {}),
        });

        // Halt any non-terminal DeliveryJob(s) for this order (see the read
        // phase above for why this can exist at all). Never touches
        // payment/refund fields — those are owned entirely by owesRefund
        // above; this only stops further physical execution.
        const cancelledAt = Timestamp.now();
        for (const plan of deliveryJobsToHalt) {
          tx.set(plan.jobRef, { status: "Cancelled", updatedAt: cancelledAt }, { merge: true });
          if (plan.personRef && plan.personWasBusy) {
            tx.set(plan.personRef, { availability: "Available", updatedAt: cancelledAt }, { merge: true });
          }
          if (plan.personUid) {
            emitDeliveryNotification(tx, db, {
              type: "DELIVERY_STATE_CHANGED",
              recipient: { role: "delivery_person", userId: plan.personUid },
              eventId: `${plan.jobRef.id}__order_cancelled`,
              title: "Delivery cancelled",
              message: `The order for shipment ${plan.shipmentNumber || plan.jobRef.id} was cancelled — no further action is needed.`,
              orderId,
              orderNumber: plan.orderNumber || null,
              deliveryJobId: plan.jobRef.id,
              now: cancelledAt,
            });
          }
        }

        for (const plan of restockByProduct.values()) {
          if (plan.variants && plan.variantRestore.size > 0) {
            // Variant path: add each unit back to its own variant and DERIVE
            // product.stock from the new variant totals. Any product-level
            // remainder (a line whose variant was deleted since purchase) is
            // added on top rather than assigned to a nonexistent variant.
            const { newVariants, restoredToVariants } = applyVariantRestores(
              plan.variants,
              plan.variantRestore
            );
            const totalRestored = restoredToVariants + plan.productLevelQty;
            tx.update(plan.ref, {
              variants: newVariants,
              stock: sumVariantStock(newVariants) + plan.productLevelQty,
              sales: FieldValue.increment(-totalRestored),
            });
          } else if (plan.productLevelQty > 0) {
            // Product-level path (no variants, or historical line without a
            // variantId): unchanged — stock and sales move in equal and
            // opposite directions, conserving stock + sales as before.
            tx.update(plan.ref, {
              stock: FieldValue.increment(plan.productLevelQty),
              sales: FieldValue.increment(-plan.productLevelQty),
            });
          }
        }

        if (adjustsPoints && userRef) {
          const currentPoints = userSnap?.exists
            ? Number(userSnap.data()?.rewardPoints || 0)
            : 0;
          const newBalance = Math.max(
            0,
            currentPoints - earnedPoints + redeemedValue
          );
          tx.set(userRef, { rewardPoints: newBalance }, { merge: true });
        }

        // Only release a claim that belongs to THIS order.
        if (couponRef && couponSnap?.exists) {
          const claimedOrderId = (couponSnap.data() as { orderId?: unknown })
            ?.orderId;
          if (claimedOrderId === orderId) {
            tx.delete(couponRef);
          }
        }

        return {
          kind: "cancelled",
          restockedItems: restockByProduct.size,
          earnedPoints,
          redeemedValue,
          orderUserId,
          orderUserEmail:
            typeof order.userEmail === "string" ? order.userEmail : null,
        };
      }
    );

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    if (outcome.kind === "already") {
      return Response.json({
        success: true,
        alreadyCancelled: true,
        restockedItems: 0,
      });
    }

    // ---- Best-effort, outside the transaction ----
    // None of these may fail the cancellation, which has already committed.

    // Reward ledger entries, mirroring the customer path's wording.
    if (outcome.orderUserId) {
      const ledger: { type: string; points: number }[] = [];
      if (outcome.earnedPoints > 0) {
        ledger.push({
          type: "Cancelled - Points Reversed",
          points: outcome.earnedPoints,
        });
      }
      if (outcome.redeemedValue > 0) {
        ledger.push({
          type: "Cancelled - Points Restored",
          points: outcome.redeemedValue,
        });
      }
      for (const entry of ledger) {
        try {
          await db.collection("rewardTransactions").add({
            userId: outcome.orderUserId,
            userEmail: outcome.orderUserEmail,
            type: entry.type,
            points: entry.points,
            orderId,
            createdAt: Timestamp.now(),
          });
        } catch (error) {
          console.error("cancel-order: reward ledger write failed:", error);
        }
      }
    }

    // Customer notification — centralised here so every caller (the website's
    // own pages AND the Customer App, once migrated to this same route) gets
    // the identical, consistent behavior this route's own header comment
    // describes; previously only the Customer App's own client-side
    // cancellation wrote this, and the website pages wrote none at all.
    // Reuses the EXISTING shared `notifications` collection — no new system.
    if (outcome.orderUserId) {
      try {
        await db.collection("notifications").add({
          userId: outcome.orderUserId,
          role: "customer",
          title: "Order Cancelled",
          message: "Your order has been cancelled.",
          type: "order",
          read: false,
          createdAt: Timestamp.now(),
        });
      } catch (error) {
        console.error("cancel-order: customer notification failed:", error);
      }
    }

    // Legacy sweep: redemptions created before F010's deterministic ids
    // can only be found by query, which a transaction cannot run.
    try {
      const legacy = await db
        .collection("couponRedemptions")
        .where("orderId", "==", orderId)
        .get();
      for (const doc of legacy.docs) {
        await doc.ref.delete();
      }
    } catch (error) {
      console.error("cancel-order: legacy coupon sweep failed:", error);
    }

    return Response.json({
      success: true,
      restockedItems: outcome.restockedItems,
    });
  } catch (error) {
    console.error("cancel-order: unexpected failure:", error);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  }
}
