"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  deriveFulfilmentStage,
  fulfilmentActionLabel,
  fulfilmentStageLabel,
  nextItemStage,
  type ItemFulfilmentMap,
} from "@/lib/itemFulfilment";
import { requestItemAdvance } from "@/lib/sellerFulfilmentClient";
import { deliveryTiming, formatIst, relativeToNow } from "@/lib/orderTiming";
import { shortOrderLabel } from "@/lib/orderSla";

// Seller fulfilment — one card per confirmed order, one row per PRODUCT.
//
// Every product advances on its own. Packing one line does nothing to the
// others, which is why each row carries its own button rather than the card
// carrying a single status control.
//
// Records only exist for orders an admin has confirmed (app/api/confirm-order
// creates them in the confirmation transaction), so a Pending order simply has
// nothing here — no filtering required. The query is a plain equality on
// vendorId, and firestore.rules independently restricts every record to its
// own vendor.

type FulfilmentItem = {
  itemKey?: string;
  id?: string;
  name?: string;
  qty?: number;
  price?: number;
  size?: string;
  color?: string;
};

type SellerOrderRecord = {
  id: string;
  orderId: string;
  vendorId: string;
  items: FulfilmentItem[];
  itemFulfilment: ItemFulfilmentMap;
  itemCount?: number;
  vendorEarning?: number;
  customerName?: string;
  courierPartner?: string;
  trackingNumber?: string;
  dispatchDate?: string;
  expectedDelivery?: string;
  confirmedAt?: unknown;
  deliveryDeadlineAt?: unknown;
};

export default function SellerFulfilmentPage() {
  const router = useRouter();
  const [records, setRecords] = useState<SellerOrderRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/vendor-login");
        return;
      }

      try {
        // Plain equality — no composite index, and no way to address another
        // vendor's records even by accident.
        const snapshot = await getDocs(
          query(collection(db, "sellerOrders"), where("vendorId", "==", user.uid))
        );

        const list: SellerOrderRecord[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() } as SellerOrderRecord);
        });

        setRecords(list);
      } catch (error) {
        console.error("Failed to load fulfilment records:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [router]);

  // Server-side, so the parent order's derived status moves in the same
  // transaction as the item. firestore.rules refuses a direct write to
  // itemFulfilment, which is what stops the roll-up being skipped.
  const advanceItem = async (
    record: SellerOrderRecord,
    itemKey: string
  ) => {
    const current = record.itemFulfilment?.[itemKey]?.status;

    if (!nextItemStage(String(current))) return;

    const user = auth.currentUser;
    if (!user) return;

    setBusyKey(`${record.id}:${itemKey}`);

    try {
      const result = await requestItemAdvance({
        idToken: await user.getIdToken(),
        recordId: record.id,
        itemKey,
      });

      if (!result.ok) {
        toast.error(result.error || "Could not update this product.");
        return;
      }

      setRecords((prev) =>
        prev.map((r) =>
          r.id === record.id
            ? {
                ...r,
                itemFulfilment: {
                  ...r.itemFulfilment,
                  [itemKey]: {
                    status: String(result.itemStatus),
                    updatedAt: new Date(),
                  },
                },
              }
            : r
        )
      );

      toast.success(
        `Marked ${fulfilmentStageLabel(result.itemStatus)} · order is now ` +
          fulfilmentStageLabel(result.parentStatus)
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="p-6">Loading fulfilment...</div>;
  }

  return (
    <div className="p-4 sm:p-6">
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 rounded-3xl mb-6">
        <h1 className="text-3xl sm:text-4xl font-bold">Fulfilment</h1>
        <p className="opacity-90 text-sm mt-1">
          Each product moves through Confirmed → Accept → Ready for Delivery →
          Handed Over to Courier → Final Delivery on its own.
        </p>
      </div>

      {records.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl text-center shadow">
          <p className="text-gray-500">
            Nothing to fulfil yet. Orders appear here once an admin confirms
            them.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {records.map((record) => {
            const stage = deriveFulfilmentStage(record.itemFulfilment) ?? "—";
            const timing = deliveryTiming({
              status: stage,
              confirmedAt: record.confirmedAt,
              deliveryDeadlineAt: record.deliveryDeadlineAt,
            });

            return (
              <div
                key={record.id}
                className="bg-white border rounded-2xl p-4 sm:p-5 shadow"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-bold">
                      Order{" "}
                      <span className="font-mono text-sm" title={record.orderId}>
                        {shortOrderLabel(record.orderId)}
                      </span>
                    </p>
                    <p className="text-sm text-gray-600">
                      {record.customerName || "Customer"} ·{" "}
                      {record.itemCount ?? record.items?.length ?? 0} item(s) · ₹
                      {Number(record.vendorEarning || 0).toLocaleString("en-IN")}{" "}
                      earnings
                    </p>
                  </div>

                  <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-700 border">
                    Overall: {fulfilmentStageLabel(stage)}
                  </span>
                </div>

                <div className="mt-3 text-sm">
                  <span className="text-gray-500">Deliver by: </span>
                  {formatIst(record.deliveryDeadlineAt)}
                  {timing.deadlineAt && (
                    <span
                      className={
                        timing.state === "overdue"
                          ? "text-red-700 font-semibold ml-1"
                          : "text-gray-600 ml-1"
                      }
                    >
                      ({relativeToNow(timing.deadlineAt)})
                    </span>
                  )}
                </div>

                {(record.courierPartner || record.trackingNumber) && (
                  <p className="text-xs text-gray-500 mt-1">
                    {record.courierPartner || "Courier not set"}
                    {record.trackingNumber ? ` · ${record.trackingNumber}` : ""}
                  </p>
                )}

                <div className="mt-4 space-y-2">
                  {(record.items || []).map((item, index) => {
                    const key = item.itemKey || `i${index}`;
                    const status =
                      record.itemFulfilment?.[key]?.status ?? "Confirmed";
                    const next = nextItemStage(String(status));
                    const busy = busyKey === `${record.id}:${key}`;

                    return (
                      <div
                        key={key}
                        className="flex flex-wrap items-center justify-between gap-3 border rounded-xl p-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold text-sm truncate">
                            {item.name || "Item"}
                          </p>
                          <p className="text-xs text-gray-500">
                            Qty {item.qty ?? 1}
                            {item.size ? ` · ${item.size}` : ""}
                            {item.color ? ` · ${item.color}` : ""}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${
                              status === "Delivered"
                                ? "bg-green-100 text-green-800 border-green-300"
                                : "bg-blue-100 text-blue-800 border-blue-300"
                            }`}
                          >
                            {fulfilmentStageLabel(status)}
                          </span>

                          {next ? (
                            <button
                              onClick={() => advanceItem(record, key)}
                              disabled={busy}
                              className="bg-green-600 hover:bg-green-700 disabled:opacity-60 transition text-white px-3 py-1.5 rounded-lg text-xs font-semibold"
                            >
                              {busy ? "Saving..." : fulfilmentActionLabel(next)}
                            </button>
                          ) : (
                            <span className="text-xs text-gray-400">
                              Complete
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
