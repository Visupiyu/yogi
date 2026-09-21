import { getAdminDb } from "@/lib/firebaseAdmin";
import { mintNumbers } from "@/lib/humanIds";
import { FieldValue, Timestamp, type Transaction } from "firebase-admin/firestore";
import { onlineOrderIdFor, type FinalizeResult } from "@/lib/onlineOrder";
import {
  planVariantDecrements,
  sumVariantStock,
  type VariantStockEntry,
} from "@/lib/products/inventory";

// SERVER-ONLY.
//
// Mobile-app twin of lib/onlineOrder.ts#finalizeOnlineOrder, for the Customer
// Mobile App's Razorpay ("Pay Online") flow. A SEPARATE function rather than a
// reuse of finalizeOnlineOrder, for the same reason app/api/mobile/place-order
// is a separate route from app/api/place-order: the mobile order document
// shape genuinely differs from the web's (see that route's own top comment) —
// `total` is the grand total here (web's `total` is the pre-shipping
// subtotal), there is a `gstAmount` concept the web pricing has none of, and
// `deliverySlot` exists only on the mobile shape. Reusing finalizeOnlineOrder
// as-is would write web-shaped totals that every mobile screen (OrdersScreen,
// OrderDetailsScreen) reads incorrectly.
//
// Called from exactly two places, so the two cannot drift:
//   app/api/mobile/finalize-payment  — the app's post-payment callback
//   app/api/razorpay/webhook         — Razorpay's own server-to-server event
//                                      (branches to this for a mobile-created
//                                      paymentIntents record; see that route)
//
// Shares the SAME money-safety rule as finalizeOnlineOrder: by the time this
// runs the customer's money is already captured, so this never refuses to
// create the order. A shortfall is recorded and flagged for review, never
// used as grounds to reject.
//
// Stock-bearing (Strategy 1) variant products are supported on the mobile
// ONLINE path exactly as on COD: create-payment-order validated the variantId
// and per-variant stock before charging, and stored the variantId + server-
// verified attributes on each intent item. This finalizer decrements the
// SELECTED variant (never product.stock directly) via planVariantDecrements,
// mirroring lib/onlineOrder.ts#finalizeOnlineOrder. Non-variant lines still
// decrement product.stock directly.

export type MobilePricedItem = {
  id: string;
  userId: string;
  productId: string;
  name: string;
  image: string;
  price: number;
  mrp: number;
  discountPercent: number;
  gstPercent: number;
  quantity: number;
  vendorId: string;
  vendorName: string;
  savedForLater: false;
  selectedVariants?: Record<string, string>;
  /** The seller's own id for this exact variant combination (Strategy 1),
   *  server-verified at create-payment-order time. Present only for a line on
   *  a stock-bearing variant product; drives per-variant stock decrement here. */
  variantId?: string;
};

/**
 * The order intent captured at /api/mobile/create-payment-order time, before
 * the customer saw the Razorpay sheet. Stored server-side in
 * paymentIntents/{razorpay_order_id}, keyed the same way the web's does, and
 * never round-tripped through the client beyond the identifiers Razorpay
 * itself returns.
 *
 * `platform: "mobile"` is the discriminator app/api/razorpay/webhook reads to
 * route a captured payment to this finalizer instead of
 * lib/onlineOrder.ts#finalizeOnlineOrder — every existing web-created intent
 * predates this field and is simply absent it, so the webhook's existing path
 * is untouched for them.
 */
export type MobilePaymentIntent = {
  platform: "mobile";
  uid: string;
  email: string | null;
  customerName: string;
  phone: string;
  address: string;
  deliverySlot: string;
  couponCode: string | null;
  /** cart doc ids to delete once the order is written — the caller's cart AT
   *  CHECKOUT TIME, not whatever the live cart holds when this settles. */
  cartItemIds: string[];
  items: MobilePricedItem[];
  vendorIds: string[];
  subtotal: number;
  gstAmount: number;
  shipping: number;
  deliveryCost: number;
  freeDeliveryApplied: boolean;
  discountAmount: number;
  finalTotal: number;
  expectedAmountPaise: number;
  razorpayOrderId: string;
  status: "created";
  createdAt: Timestamp;
};

type Shortfall = { id: string; name: string; wanted: number; available: number };

export async function finalizeMobileOnlineOrder(params: {
  razorpayPaymentId: string;
  razorpayOrderId: string;
  intent: MobilePaymentIntent;
  /** What Razorpay actually captured, in paise. */
  capturedAmountPaise: number;
  /** "mobile-app" | "webhook" — recorded on the order for reconciliation. */
  source: string;
}): Promise<FinalizeResult> {
  const { razorpayPaymentId, razorpayOrderId, intent, capturedAmountPaise, source } =
    params;

  const db = getAdminDb();
  // Same deterministic identity as the web ONLINE path (the Razorpay payment
  // id), imported rather than redefined, so a mobile and a web order can
  // never collide and both mean the exact same thing: "has this payment
  // already been finalised?"
  const orderId = onlineOrderIdFor(razorpayPaymentId);
  const orderRef = db.collection("orders").doc(orderId);

  const preexisting = await orderRef.get();
  if (preexisting.exists) {
    return {
      kind: "already",
      orderId,
      finalTotal: Number(preexisting.data()?.total || 0),
    };
  }

  const outcome = await db.runTransaction<FinalizeResult & { shortfalls?: Shortfall[] }>(
    async (tx: Transaction) => {
      // ---- ALL READS FIRST (Firestore transaction requirement) ----
      const orderSnap = await tx.get(orderRef);
      if (orderSnap.exists) {
        return {
          kind: "already",
          orderId,
          finalTotal: Number(orderSnap.data()?.total || 0),
        };
      }

      // Aggregate per PRODUCT — the same reason app/api/mobile/place-order
      // aggregates: two cart lines (one per variant combo) can share a
      // product, and each must be checked against the COMBINED demand.
      const qtyByProduct = new Map<string, number>();
      const nameByProduct = new Map<string, string>();
      // Per-(product, variant) demand — Strategy 1, the SAME shape
      // lib/onlineOrder.ts#finalizeOnlineOrder uses. Variant-authoritative only
      // when the product has variants AND every intent line for it carries a
      // variantId; otherwise the product-level path below is kept.
      const variantDemandByProduct = new Map<string, Map<string, number>>();
      const productHasNonVariantLine = new Set<string>();
      for (const item of intent.items) {
        qtyByProduct.set(item.productId, (qtyByProduct.get(item.productId) || 0) + item.quantity);
        if (!nameByProduct.has(item.productId)) nameByProduct.set(item.productId, item.name);
        if (item.variantId) {
          let m = variantDemandByProduct.get(item.productId);
          if (!m) { m = new Map(); variantDemandByProduct.set(item.productId, m); }
          m.set(item.variantId, (m.get(item.variantId) || 0) + item.quantity);
        } else {
          productHasNonVariantLine.add(item.productId);
        }
      }

      const productIds = [...qtyByProduct.keys()];
      const productRefs = productIds.map((id) => db.collection("products").doc(id));
      const productSnaps = await Promise.all(productRefs.map((ref) => tx.get(ref)));

      // ---- Assess, but never reject: the money is already taken ----
      // A product-level decrement (non-variant lines). A variant-path product
      // records its full decremented variants[] plan instead, applied at write
      // time — identical to lib/onlineOrder.ts#finalizeOnlineOrder.
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
          shortfalls.push({ id, name: label, wanted, available });
          if (available > 0) decrements.push({ ref: productRefs[i], qty: available });
          continue;
        }

        decrements.push({ ref: productRefs[i], qty: wanted });
      }

      // finalTotal is the amount Razorpay actually captured, not a
      // recomputed figure — matches finalizeOnlineOrder's own rule.
      const capturedRupees = Math.round(capturedAmountPaise) / 100;

      // Human-readable numbers, minted after all reads above and BEFORE the
      // first write below (mintNumbers itself does tx.get then tx.set).
      const [orderNumber, paymentNumber] = await mintNumbers(tx, db, [
        { kind: "daily", daily: "order", at: new Date() },
        { kind: "seq", counter: "payment" },
      ]);

      // ---- WRITES ----
      for (const { ref, qty } of decrements) {
        tx.update(ref, {
          stock: FieldValue.increment(-qty),
          sales: FieldValue.increment(qty),
        });
      }
      // Variant-path products: write the decremented variants[] and the derived
      // product.stock together, so the two ledgers stay consistent — never
      // decrement product.stock directly for a stock-bearing variant.
      for (const { ref, newVariants, taken } of variantWrites) {
        tx.update(ref, {
          variants: newVariants,
          stock: sumVariantStock(newVariants),
          sales: FieldValue.increment(taken),
        });
      }

      // Inventory + Order Consistency V1 — only present when a shortfall
      // happened, mirroring finalizeOnlineOrder's own stockDeductedQty.
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
        userId: intent.uid,
        customerName: intent.customerName,
        customerEmail: intent.email || "",
        phone: intent.phone,
        address: intent.address,
        vendorIds: intent.vendorIds,
        deliverySlot: intent.deliverySlot,
        items: intent.items,
        subtotal: intent.subtotal,
        shipping: intent.shipping,
        deliveryCost: intent.deliveryCost,
        freeDeliveryApplied: intent.freeDeliveryApplied,
        couponCode: intent.couponCode,
        discountAmount: intent.discountAmount,
        // Grand total, matching app/api/mobile/place-order's own meaning of
        // `total` (NOT web's pre-shipping-subtotal meaning) — what the
        // customer's card was actually charged.
        total: capturedRupees,
        paymentMethod: "ONLINE",
        paymentStatus: "Paid",
        status: "Pending",
        createdAt: Timestamp.now(),
        gstAmount: intent.gstAmount,

        // ---- Canonical web-schema aliases (same as place-order writes) ----
        finalTotal: capturedRupees,
        userEmail: intent.email || "",
        rewardPointsStatus: "pending",
        updatedAt: Timestamp.now(),

        // Payment provenance, for reconciliation against the Razorpay
        // dashboard — same field names finalizeOnlineOrder uses.
        razorpayPaymentId,
        razorpayOrderId,
        finalizedBy: source,

        ...(shortfalls.length > 0 ? { stockShortfall: shortfalls } : {}),
        ...(Object.keys(stockDeductedQty).length > 0 ? { stockDeductedQty } : {}),
        ...(shortfalls.length > 0 ? { needsReview: true } : {}),
      });

      // The cart AT CHECKOUT TIME (captured into the intent), not whatever
      // the live cart holds now — a webhook can settle minutes after the
      // customer resumed shopping.
      for (const cartItemId of intent.cartItemIds) {
        tx.delete(db.collection("cart").doc(cartItemId));
      }

      return { kind: "created", orderId, finalTotal: capturedRupees, shortfalls };
    }
  );

  if (outcome.kind !== "created") return outcome;

  if (outcome.shortfalls?.length) {
    try {
      await db.collection("notifications").add({
        title: "⚠ Paid mobile order needs review",
        message: `Order ${orderId.slice(0, 12)} was paid but oversold: ${outcome.shortfalls
          .map((s) => `${s.name} (wanted ${s.wanted}, had ${s.available})`)
          .join("; ")}. Payment was captured and the order was NOT rejected. Needs manual review.`,
        role: "admin",
        type: "order",
        read: false,
        createdAt: Timestamp.now(),
      });
    } catch (error) {
      console.error("finalizeMobileOnlineOrder: review notification failed:", error);
    }
  }

  return { kind: "created", orderId, finalTotal: outcome.finalTotal };
}
