"use client";

import { Suspense, useEffect, useState } from "react";

import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { auth, db } from "@/lib/firebase";
import { RETURN_WINDOW_DAYS } from "@/lib/returnEligibility";
import {
  REFUND_DESTINATION_LABEL,
  isTerminal,
  itemKeyForOrderIndex,
  itemRequestEligibility,
  refundableForOrderIndex,
  stagesFor,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";

// Unified item-level Return / Replace request form.
//
// Reached from the order page as /returns?orderId=<id>&item=<index>&type=<t>.
// It targets ONE order line (per-item, whole quantity), not the whole order.
// Eligibility is the item's own delivered state, read from /api/order-fulfilment
// (the customer cannot read sellerOrders directly). Everything is re-checked
// server-side by /api/item-request; nothing here is trusted.
//
// Refunds are YOMICO Reward Points only — the sole mechanism the backend has.
// No UPI / bank-transfer / original-payment wording appears in this flow.

const RETURN_REASONS = [
  "Damaged Product",
  "Wrong Item Received",
  "Quality Issue",
  "Product Not As Expected",
  "Other",
] as const;

const REPLACE_REASONS = [
  "Damaged Product",
  "Wrong Item Received",
  "Defective / Not Working",
  "Missing Parts / Accessories",
  "Other",
] as const;

const TONE_CLASS: Record<string, string> = {
  ok: "border-green-200 bg-green-50 text-green-800",
  bad: "border-red-200 bg-red-50 text-red-700",
  running: "border-blue-200 bg-blue-50 text-blue-800",
  idle: "border-amber-200 bg-amber-50 text-amber-800",
};

type FulfilmentItem = {
  itemKey: string | null;
  productId: string | null;
  status: string;
  deliveredAt: string | null;
};

type ItemRequestDoc = {
  type?: ItemRequestType;
  requestNumber?: string;
  status?: string;
  itemKey?: string;
  orderId?: string;
  reason?: string;
  refund?: { amount?: number; destination?: string; creditedAt?: unknown };
  pickup?: {
    scheduledAt?: unknown;
    requestedAt?: unknown;
    requestedBy?: unknown;
    partner?: unknown;
  };
};

type OrderItem = {
  name?: string;
  image?: string;
  qty?: number;
  price?: number;
  size?: string;
  color?: string;
  vendorName?: string;
  attributes?: Record<string, unknown>;
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">{children}</div>
    </div>
  );
}

function shortOrderRef(id: string): string {
  if (!id) return "";
  const tail = id.includes("_") ? id.slice(id.lastIndexOf("_") + 1) : id;
  return (tail || id).slice(0, 10).toUpperCase();
}

/** Firestore Timestamp | ISO string | epoch | {seconds} -> Date | null. */
function toDate(v: unknown): Date | null {
  if (!v) return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const c = v as { toDate?: () => Date; seconds?: number };
  if (typeof c.toDate === "function") {
    try {
      const d = c.toDate();
      return Number.isNaN(d.getTime()) ? null : d;
    } catch {
      return null;
    }
  }
  if (typeof c.seconds === "number") return new Date(c.seconds * 1000);
  return null;
}

function fmtDate(v: unknown): string {
  const d = toDate(v);
  return d
    ? d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })
    : "";
}

function fmtDateTime(v: unknown): string {
  const d = toDate(v);
  return d
    ? d.toLocaleString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
    : "";
}

/** The variant line: full attribute map if present, else size/color. */
function variantOf(item: OrderItem): string {
  const attrs = item.attributes;
  if (attrs && typeof attrs === "object" && Object.keys(attrs).length > 0) {
    return Object.entries(attrs)
      .map(([k, v]) => `${k}: ${String(v)}`)
      .join(" · ");
  }
  const parts: string[] = [];
  if (item.size) parts.push(`Size ${item.size}`);
  if (item.color) parts.push(String(item.color));
  return parts.join(" · ");
}

const ACTION_BADGE: Record<ItemRequestType, string> = {
  return: "bg-orange-100 text-orange-700 border-orange-300",
  replace: "bg-blue-100 text-blue-700 border-blue-300",
};

// A read-only lifecycle timeline for an existing request.
function Timeline({ type, status }: { type: ItemRequestType; status: string }) {
  if (isTerminal(status)) {
    const tone = statusTone(status);
    return (
      <div className={`rounded-2xl border p-4 text-sm ${TONE_CLASS[tone]}`}>
        <p className="font-semibold">{statusLabel(type, status)}</p>
      </div>
    );
  }

  const stages = stagesFor(type);
  const current = stages.indexOf(status);

  return (
    <ol className="space-y-2">
      {stages.map((stage, i) => {
        const done = current >= 0 && i < current;
        const active = i === current;
        return (
          <li key={stage} className="flex items-center gap-3">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                done
                  ? "bg-green-600 text-white"
                  : active
                  ? "bg-blue-600 text-white"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {done ? "✓" : i + 1}
            </span>
            <span
              className={`text-sm ${
                active
                  ? "font-semibold text-gray-900"
                  : done
                  ? "text-gray-600"
                  : "text-gray-400"
              }`}
            >
              {statusLabel(type, stage)}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RequestInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const orderId = searchParams.get("orderId") || "";
  const itemParam = searchParams.get("item");
  const parentIndex = itemParam !== null ? Number(itemParam) : -1;
  const rawType = searchParams.get("type");
  const type: ItemRequestType = rawType === "replace" ? "replace" : "return";

  const [order, setOrder] = useState<Record<string, unknown> | null>(null);
  const [orderLoading, setOrderLoading] = useState(true);
  const [fulfilment, setFulfilment] = useState<FulfilmentItem[]>([]);
  const [existing, setExisting] = useState<ItemRequestDoc | null>(null);

  const [reason, setReason] = useState("");
  const [comments, setComments] = useState("");
  // Customer's PREFERRED pickup datetime (datetime-local value) — a preference
  // only; admin confirms the actual appointment.
  const [preferredPickup, setPreferredPickup] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    // Missing params render the "choose an item" state before the loading gate,
    // so there's nothing to load or set here.
    if (!orderId || parentIndex < 0) return;

    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/login");
        return;
      }
      try {
        const snap = await getDoc(doc(db, "orders", orderId));
        const data =
          snap.exists() && snap.data().userId === user.uid ? snap.data() : null;
        setOrder(data);

        if (data) {
          const identity = itemKeyForOrderIndex(data, parentIndex);

          try {
            const token = await user.getIdToken();
            const res = await fetch("/api/order-fulfilment", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
              },
              body: JSON.stringify({ orderId }),
            });
            if (res.ok) {
              const payload = await res.json();
              setFulfilment(payload.items || []);
            }
          } catch {
            /* tracking is additive */
          }

          if (identity) {
            try {
              const rq = await getDocs(
                query(collection(db, "itemRequests"), where("userId", "==", user.uid))
              );
              const mine = rq.docs
                .map((d) => d.data() as ItemRequestDoc)
                .find(
                  (r) => r.orderId === orderId && r.itemKey === identity.itemKey
                );
              setExisting(mine || null);
            } catch {
              /* no-op */
            }
          }
        }
      } catch {
        setOrder(null);
      } finally {
        setOrderLoading(false);
      }
    });

    return () => unsub();
  }, [orderId, parentIndex, router]);

  const items = Array.isArray(order?.items)
    ? (order!.items as OrderItem[])
    : [];
  const selected = items[parentIndex];
  const identity = order ? itemKeyForOrderIndex(order, parentIndex) : null;
  const itemKey = identity?.itemKey ?? null;

  const entry = itemKey
    ? fulfilment.find((f) => f.itemKey === itemKey) || null
    : null;

  const eligibility = itemKey
    ? itemRequestEligibility(
        { itemFulfilment: entry ? { [itemKey]: entry } : {} },
        itemKey
      )
    : { eligible: false, needsReview: false, reason: "not-delivered" as const };

  const estRefund =
    order && type === "return"
      ? refundableForOrderIndex(order, parentIndex)
      : 0;

  const reasons = type === "replace" ? REPLACE_REASONS : RETURN_REASONS;
  const title = type === "replace" ? "Replacement Request" : "Return Request";
  const actionWord = type === "replace" ? "Replace" : "Return";

  const submit = async () => {
    setError("");
    if (!reason) {
      setError("Please select a reason.");
      return;
    }
    const user = auth.currentUser;
    if (!user) {
      router.push("/login");
      return;
    }
    try {
      setLoading(true);
      const token = await user.getIdToken();
      const res = await fetch("/api/item-request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          orderId,
          parentIndex,
          type,
          reason,
          comments,
          // Preferred pickup applies to returns only (a replacement is
          // delivered, not picked up). Optional.
          ...(type === "return" && preferredPickup
            ? { preferredPickupAt: new Date(preferredPickup).toISOString() }
            : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "Couldn't submit your request.");
        return;
      }
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  // ---- states ----
  if (!orderId || parentIndex < 0) {
    return (
      <Shell>
        <div className="bg-white rounded-3xl shadow-md p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Request a Return or Replacement</h1>
          <p className="text-gray-600 mb-6">
            Open the order and choose the item you&apos;d like to return or
            replace.
          </p>
          <Link
            href="/orders"
            className="inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold"
          >
            Go to My Orders
          </Link>
        </div>
      </Shell>
    );
  }

  if (orderLoading) {
    return (
      <Shell>
        <div className="bg-white rounded-3xl shadow-md p-8 animate-pulse space-y-4">
          <div className="h-7 w-1/3 bg-gray-200 rounded" />
          <div className="h-20 bg-gray-100 rounded-2xl" />
          <div className="h-24 bg-gray-100 rounded-2xl" />
          <div className="h-11 bg-gray-200 rounded-xl" />
        </div>
      </Shell>
    );
  }

  if (!order || !selected || !identity) {
    return (
      <Shell>
        <div className="bg-white rounded-3xl shadow-md p-8 text-center">
          <h1 className="text-2xl font-bold mb-2">Item not found</h1>
          <p className="text-gray-600 mb-6">
            We couldn&apos;t find this item on your order. Please pick it from
            your order again.
          </p>
          <Link
            href={order ? `/orders/${orderId}` : "/orders"}
            className="inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold"
          >
            {order ? "Back to Order" : "Go to My Orders"}
          </Link>
        </div>
      </Shell>
    );
  }

  const orderRef =
    (typeof order.orderNumber === "string" && order.orderNumber) ||
    shortOrderRef(orderId);
  const qty = selected.qty ?? 1;
  const variant = variantOf(selected);
  const lineTotal =
    typeof selected.price === "number" ? selected.price * qty : null;
  const address = typeof order.address === "string" ? order.address : "";
  const phone = typeof order.phone === "string" ? order.phone : "";

  // Product card (image, name, variant, qty, seller, item price) — req 1 & 6.
  const ProductCard = (
    <div className="rounded-2xl border p-4 flex items-start gap-4 mb-6">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={selected.image || "/no-image.png"}
        alt={selected.name || "Product"}
        className="w-16 h-16 rounded-xl object-cover bg-gray-100 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{selected.name || "Product"}</p>
        {variant && <p className="text-xs text-gray-500 mt-0.5">{variant}</p>}
        <p className="text-xs text-gray-500 mt-0.5">
          Qty {qty} (whole item)
          {selected.vendorName ? ` · Sold by ${selected.vendorName}` : ""}
        </p>
      </div>
      {lineTotal !== null && (
        <p className="font-semibold shrink-0">
          &#8377;{lineTotal.toLocaleString("en-IN")}
        </p>
      )}
    </div>
  );

  const ActionBadge = (
    <span
      className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${ACTION_BADGE[type]}`}
    >
      {actionWord}
    </span>
  );

  // Pickup / delivery address block — req 7 (shown where available).
  const AddressBlock = address ? (
    <div className="mb-6 rounded-2xl border p-4 text-sm">
      <p className="font-semibold mb-1">
        {type === "replace" ? "Replacement delivery address" : "Pickup address"}
      </p>
      <p className="text-gray-600">{address}</p>
      {phone && <p className="text-gray-500 text-xs mt-1">Phone: {phone}</p>}
      {type === "return" && (
        <p className="text-xs text-gray-400 mt-2">
          Our courier will collect the item from this address once the return is
          approved. You&apos;ll be contacted to arrange the pickup.
        </p>
      )}
    </div>
  ) : null;

  // ---- an existing request for this item -> tracking ----
  if (existing && !submitted) {
    const exType: ItemRequestType = existing.type === "replace" ? "replace" : "return";
    const exStatus = existing.status || "REQUESTED";
    const refundAmount =
      typeof existing.refund?.amount === "number" ? existing.refund.amount : 0;
    const creditedOn = fmtDateTime(existing.refund?.creditedAt);
    const pickupOn = fmtDateTime(existing.pickup?.scheduledAt); // admin-confirmed
    const pickupRequestedOn = fmtDateTime(existing.pickup?.requestedAt); // customer preference
    const pickupPartner =
      typeof existing.pickup?.partner === "string" ? existing.pickup.partner : "";

    return (
      <Shell>
        <div className="bg-white rounded-3xl shadow-md p-6 sm:p-8">
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-bold">
              {exType === "replace" ? "Replacement" : "Return"} status
            </h1>
            <span
              className={`inline-block px-3 py-1 rounded-full text-xs font-semibold border ${ACTION_BADGE[exType]}`}
            >
              {exType === "replace" ? "Replace" : "Return"}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-6">
            {existing.requestNumber ? `#${existing.requestNumber} · ` : ""}Order #
            {orderRef}
          </p>

          {ProductCard}

          <Timeline type={exType} status={exStatus} />

          {/* REFUNDED: actual credited reward points + date — req 11. */}
          {exType === "return" && exStatus === "REFUNDED" && refundAmount > 0 && (
            <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
              <p className="font-semibold text-green-800">
                &#8377;{refundAmount.toLocaleString("en-IN")} refunded as{" "}
                {REFUND_DESTINATION_LABEL}
              </p>
              {creditedOn && (
                <p className="text-gray-600 mt-1">Credited on {creditedOn}.</p>
              )}
            </div>
          )}

          {/* In-progress refund estimate. */}
          {exType === "return" &&
            !isTerminal(exStatus) &&
            exStatus !== "REFUNDED" &&
            refundAmount > 0 && (
              <p className="mt-4 text-sm text-gray-600">
                Refund of &#8377;{refundAmount.toLocaleString("en-IN")} will be
                credited as {REFUND_DESTINATION_LABEL} once the item is received
                and inspected.
              </p>
            )}

          {/* Pickup — shows the customer's PREFERRED time and, once the team
              sets it, the CONFIRMED appointment. The confirmed one is labelled
              clearly so the two are never confused. */}
          {exType === "return" &&
            !isTerminal(exStatus) &&
            (exStatus === "APPROVED" ||
              exStatus === "PICKUP_SCHEDULED" ||
              pickupRequestedOn) && (
              <div className="mt-4 rounded-2xl border p-4 text-sm">
                <p className="font-semibold mb-1">Pickup</p>

                {pickupRequestedOn && (
                  <p className="text-gray-600">
                    Your preferred time: {pickupRequestedOn}
                    {!pickupOn && " (awaiting confirmation)"}
                  </p>
                )}

                {pickupOn ? (
                  <p className="text-green-700 font-semibold mt-1">
                    ✓ Confirmed pickup: {pickupOn}
                    {pickupPartner ? ` · ${pickupPartner}` : ""}
                  </p>
                ) : (
                  <p className="text-gray-600 mt-1">
                    {exStatus === "PICKUP_SCHEDULED"
                      ? "A pickup has been scheduled — our courier will contact you to confirm the time."
                      : "A pickup will be arranged shortly."}
                  </p>
                )}
                {address && <p className="text-gray-500 mt-1">{address}</p>}
              </div>
            )}

          {/* Reason + quantity, mirroring the order-detail summary. */}
          <div className="mt-4 rounded-2xl border p-4 text-sm">
            <p className="font-semibold mb-1">
              Reason for {exType === "replace" ? "replacement" : "return"}
            </p>
            <p className="text-gray-600">{existing.reason || "—"}</p>
            <p className="text-gray-500 mt-2">
              {exType === "replace" ? "Replacement" : "Return"} quantity: {qty}
            </p>
          </div>

          <Link
            href="/profile/refunds"
            className="mt-6 inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold"
          >
            View all my requests
          </Link>
        </div>
      </Shell>
    );
  }

  // ---- expired window — exact approved message + dates (req 9) ----
  if (!submitted && !eligibility.eligible && eligibility.reason === "window-closed") {
    const deliveredOn = fmtDate(entry?.deliveredAt);
    const windowEnd = entry?.deliveredAt
      ? new Date(
          (toDate(entry.deliveredAt) as Date).getTime() +
            RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000
        )
      : null;
    return (
      <Shell>
        <div className="bg-white rounded-3xl shadow-md p-6 sm:p-8">
          <h1 className="text-2xl sm:text-3xl font-bold mb-4">
            Return / Exchange
          </h1>
          {ProductCard}
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm">
            <p className="font-semibold text-red-700">
              Return / Exchange not available
            </p>
            <p className="text-gray-700 mt-1">
              You cannot return or exchange this item because the{" "}
              {RETURN_WINDOW_DAYS}-day period has expired.
            </p>
            <div className="mt-3 text-gray-600 space-y-0.5">
              {deliveredOn && <p>Delivered on {deliveredOn}.</p>}
              {windowEnd && (
                <p>Return window ended {fmtDate(windowEnd)}.</p>
              )}
            </div>
          </div>
          <Link
            href={`/orders/${orderId}`}
            className="mt-6 inline-flex px-6 py-3 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold"
          >
            Back to Order
          </Link>
        </div>
      </Shell>
    );
  }

  // ---- the request form ----
  return (
    <Shell>
      <div className="bg-white rounded-3xl shadow-md p-6 sm:p-8">
        <div className="flex items-center gap-3 mb-1">
          <h1 className="text-2xl sm:text-3xl font-bold">{title}</h1>
          {ActionBadge}
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Order #{orderRef} · this request is for the item below only
        </p>

        {ProductCard}

        {submitted && (
          <div className="mb-6 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm">
            <p className="font-semibold text-green-800">
              {type === "replace"
                ? "Replacement request submitted"
                : "Return request submitted"}
            </p>
            <p className="text-gray-700 mt-1">
              Our team will review it shortly.{" "}
              <Link href="/profile/refunds" className="underline font-medium">
                Track it under Profile &rarr; Refunds
              </Link>
              .
            </p>
          </div>
        )}

        {!submitted && !eligibility.eligible && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="font-semibold text-red-700">Not eligible yet</p>
            <p className="text-gray-700 mt-1">
              This item must be delivered before it can be returned or replaced.
            </p>
          </div>
        )}

        {!submitted && eligibility.eligible && eligibility.needsReview && (
          <div className="mb-6 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm">
            <p className="font-semibold text-amber-800">Eligible</p>
            <p className="text-gray-700 mt-1">
              We don&apos;t have a recorded delivery date for this item, so our
              team will confirm the {RETURN_WINDOW_DAYS}-day window before
              approving.
            </p>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm">
            <p className="text-red-700 font-semibold">{error}</p>
          </div>
        )}

        {!submitted && (
          <>
            {/* What you're doing — whole-line quantity model (req 2 & 6). */}
            <div className="mb-6 rounded-2xl bg-gray-50 border p-4 text-sm">
              <p className="text-gray-700">
                You&apos;re requesting a{" "}
                <span className="font-semibold">
                  {type === "replace" ? "replacement" : "return"}
                </span>{" "}
                for{" "}
                <span className="font-semibold">
                  all {qty} unit{qty === 1 ? "" : "s"}
                </span>{" "}
                of this item.
              </p>
            </div>

            <div className="mb-6">
              <label className="block mb-2 font-semibold">Select Reason</label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={!eligibility.eligible}
                className="w-full border p-3 rounded-xl disabled:bg-gray-100"
              >
                <option value="">Choose a reason</option>
                {reasons.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>

            <div className="mb-6">
              <label className="block mb-2 font-semibold">
                Additional Comments{" "}
                <span className="text-xs font-normal text-gray-400">
                  (optional)
                </span>
              </label>
              <textarea
                value={comments}
                onChange={(e) => setComments(e.target.value)}
                disabled={!eligibility.eligible}
                rows={4}
                placeholder="Describe the issue..."
                className="w-full border p-3 rounded-xl disabled:bg-gray-100"
              />
            </div>

            {/* Preferred pickup — returns only, and a PREFERENCE (our team
                confirms the actual appointment). */}
            {type === "return" && (
              <div className="mb-6">
                <label className="block mb-2 font-semibold">
                  Preferred pickup date &amp; time{" "}
                  <span className="text-xs font-normal text-gray-400">
                    (optional)
                  </span>
                </label>
                <input
                  type="datetime-local"
                  value={preferredPickup}
                  onChange={(e) => setPreferredPickup(e.target.value)}
                  disabled={!eligibility.eligible}
                  className="w-full border p-3 rounded-xl disabled:bg-gray-100"
                />
                <p className="text-xs text-gray-400 mt-1">
                  We&apos;ll try to honour this; our team confirms the final
                  pickup time.
                </p>
              </div>
            )}

            {/* Address (req 7). */}
            {AddressBlock}

            {/* Truthful outcome explainer — reward points only (req 3,4,5). */}
            <div className="mb-6 rounded-2xl bg-gray-50 border p-4 text-sm">
              {type === "replace" ? (
                <>
                  <p className="font-semibold mb-1">If approved</p>
                  <p className="text-gray-600">
                    A replacement of the same item will be shipped to you. No
                    refund is issued for a replacement.
                  </p>
                </>
              ) : (
                <>
                  <p className="font-semibold mb-1">Estimated refund</p>
                  <p className="text-gray-600">
                    {estRefund > 0 ? (
                      <>
                        <span className="font-semibold text-gray-800">
                          &#8377;{estRefund.toLocaleString("en-IN")}
                        </span>{" "}
                        will be credited as {REFUND_DESTINATION_LABEL}
                      </>
                    ) : (
                      <>Your refund will be credited as {REFUND_DESTINATION_LABEL}</>
                    )}{" "}
                    after the item is received and inspected. This is an estimate;
                    the final amount is confirmed by our team.
                  </p>
                </>
              )}
            </div>

            <button
              onClick={submit}
              disabled={loading || !eligibility.eligible}
              className="w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 rounded-xl font-semibold disabled:opacity-50"
            >
              {loading
                ? "Submitting..."
                : type === "replace"
                ? "Submit Replacement Request"
                : "Submit Return Request"}
            </button>

            {eligibility.eligible && (
              <div className="mt-6 rounded-2xl bg-gray-50 border p-4">
                <p className="font-semibold text-sm mb-2">What happens next</p>
                <ol className="text-sm text-gray-600 space-y-1 list-decimal list-inside">
                  <li>You submit this request.</li>
                  <li>Our team reviews it and confirms eligibility.</li>
                  {type === "replace" ? (
                    <>
                      <li>Once approved, the seller prepares a replacement.</li>
                      <li>The replacement is shipped and delivered to you.</li>
                    </>
                  ) : (
                    <>
                      <li>Once approved, a pickup is arranged for the item.</li>
                      <li>
                        Your {REFUND_DESTINATION_LABEL} refund is credited after
                        we receive and inspect it.
                      </li>
                    </>
                  )}
                </ol>
                <p className="text-xs text-gray-400 mt-2">
                  Track the status any time under Profile &rarr; Refunds.
                </p>
              </div>
            )}
          </>
        )}

        {submitted && (
          <Link
            href="/profile/refunds"
            className="mt-2 inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold"
          >
            Track my requests
          </Link>
        )}
      </div>
    </Shell>
  );
}

export default function RequestPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <div className="bg-white rounded-3xl shadow-md p-8 animate-pulse space-y-4">
            <div className="h-7 w-1/3 bg-gray-200 rounded" />
            <div className="h-24 bg-gray-100 rounded-2xl" />
          </div>
        </Shell>
      }
    >
      <RequestInner />
    </Suspense>
  );
}
