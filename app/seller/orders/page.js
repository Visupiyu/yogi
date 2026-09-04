"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  ITEM_FULFILMENT_STAGES,
  deriveFulfilmentStage,
  fulfilmentActionLabel,
  fulfilmentStageLabel,
  isStageComplete,
  nextItemStage,
} from "@/lib/itemFulfilment";
import { requestItemAdvance } from "@/lib/sellerFulfilmentClient";
import { deliveryTiming, formatIst, relativeToNow } from "@/lib/orderTiming";
import { shortOrderLabel } from "@/lib/orderSla";

// Seller Orders — backed by the seller's own `sellerOrders` records.
//
// Fulfilment is per LINE ITEM, held in each record's itemFulfilment map, and
// that map is the source of truth. The parent orders.status is not consulted
// here at all: it is the customer-facing order state, not this seller's work.
//
// Two consequences worth knowing:
//
//   * Pending orders cannot appear. A record only exists once an admin has
//     confirmed the order (app/api/confirm-order creates it in the
//     confirmation transaction), so there is nothing to filter out.
//
//   * The query is a plain equality on vendorId. The old
//     array-contains + status != 'Pending' query against `orders` needed a
//     composite index; this one needs none, and firestore.rules independently
//     restricts every record to its own vendor.
//
// Customer contact details (phone, email, address) live on the parent order
// and are shown on the order detail page, which still reads it.

export default function SellerOrdersPage() {
  const router = useRouter();
  const [records, setRecords] = useState([]);
  // Delivery assignment per record, keyed by sellerOrder record id. The
  // assignment (Delivery Company/Person + shipmentNumber) lives ONLY on the
  // parent order, never on sellerOrders, so it is fetched from there — see the
  // load effect. Only the delivery fields are kept; customer PII is discarded.
  const [deliveryByRecord, setDeliveryByRecord] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [busyKey, setBusyKey] = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/vendor-login");
        return;
      }

      try {
        const snapshot = await getDocs(
          query(
            collection(db, "sellerOrders"),
            where("vendorId", "==", firebaseUser.uid)
          )
        );

        const list = [];
        snapshot.forEach((docSnap) => {
          list.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Newest first. Sorted in code so no orderBy index is needed.
        list.sort(
          (a, b) =>
            (b.confirmedAt?.seconds || 0) - (a.confirmedAt?.seconds || 0)
        );

        setRecords(list);

        // The real delivery assignment (Delivery Company, Delivery Person,
        // YOMICO tracking number) is written by Admin -> Delivery onto the
        // PARENT order, never onto sellerOrders. Read it from there for each
        // record — the seller is already authorized to read every confirmed
        // parent order (uid in vendorIds && status != 'Pending'), which every
        // listed record satisfies. Only the delivery fields are copied into
        // state; the order's customer details are never stored or shown here.
        // Per-order try/catch so one failed read can't blank the whole list,
        // and only fields that exist are kept, so legacy orders are unaffected.
        const deliveryMap = {};
        await Promise.all(
          list.map(async (record) => {
            if (!record.orderId) return;
            try {
              const orderSnap = await getDoc(doc(db, "orders", record.orderId));
              if (!orderSnap.exists()) return;
              const o = orderSnap.data();
              if (
                o.deliveryCompanyName ||
                o.deliveryPartnerName ||
                o.shipmentNumber
              ) {
                deliveryMap[record.id] = {
                  deliveryCompanyName: o.deliveryCompanyName || "",
                  deliveryPartnerName: o.deliveryPartnerName || "",
                  shipmentNumber: o.shipmentNumber || "",
                };
              }
            } catch {
              // Non-fatal — the row still renders without delivery info.
            }
          })
        );
        setDeliveryByRecord(deliveryMap);
      } catch (error) {
        console.error("Failed to load seller orders:", error);
      } finally {
        setLoading(false);
      }
    });

    return () => unsub();
  }, [router]);

  // Advancing goes through the server so the parent order's derived status is
  // recalculated in the same transaction. A direct write is refused by the
  // rules — itemFulfilment is server-only.
  const advanceItem = async (record, itemKey) => {
    if (!nextItemStage(String(record.itemFulfilment?.[itemKey]?.status))) return;

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
        alert(result.error);
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
                    status: result.itemStatus,
                    updatedAt: new Date(),
                  },
                },
              }
            : r
        )
      );

      alert(
        `Marked ${fulfilmentStageLabel(result.itemStatus)} · order is now ` +
          fulfilmentStageLabel(result.parentStatus)
      );
    } finally {
      setBusyKey(null);
    }
  };

  if (loading) {
    return <div className="p-5">Loading...</div>;
  }

  const filtered = records.filter(
    (record) =>
      record.orderId?.toLowerCase().includes(search.toLowerCase()) ||
      record.customerName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-5">
      <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 rounded-3xl mb-6">
        <h1 className="text-4xl font-bold">Seller Orders</h1>
        <p className="opacity-90">
          Each product moves through Confirmed → Accept → Ready for Delivery →
          Handed Over to Courier → Final Delivery on its own.
        </p>
      </div>

      <div className="mb-6 bg-white p-4 rounded-2xl shadow">
        <p className="text-lg font-semibold">Total Orders: {records.length}</p>
      </div>

      <input
        type="text"
        placeholder="Search Order ID / Customer..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full border p-4 rounded-2xl mb-6"
      />

      {records.length === 0 ? (
        <div className="bg-white p-10 rounded-3xl text-center shadow">
          <p className="text-gray-500 text-lg">
            No orders available yet. Orders appear here once an admin confirms
            them.
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {filtered.map((record) => {
            // Derived summary only — the per-product rows below are the truth.
            const stage = deriveFulfilmentStage(record.itemFulfilment) ?? "—";
            const timing = deliveryTiming({
              status: stage,
              confirmedAt: record.confirmedAt,
              deliveryDeadlineAt: record.deliveryDeadlineAt,
            });

            return (
              <div
                key={record.id}
                className="bg-white border rounded-xl p-5 shadow"
              >
                <h2 className="font-bold text-lg" title={record.orderId}>
                  Order ID: {record.orderNumber || shortOrderLabel(record.orderId || "")}
                </h2>

                <p>Customer: {record.customerName || "Customer"}</p>

                <p>Confirmed: {formatIst(record.confirmedAt)}</p>

                <p>
                  Deliver by: {formatIst(record.deliveryDeadlineAt)}
                  {timing.deadlineAt && (
                    <span
                      className={
                        timing.state === "overdue"
                          ? " text-red-700 font-semibold"
                          : " text-gray-600"
                      }
                    >
                      {" "}
                      ({relativeToNow(timing.deadlineAt)})
                    </span>
                  )}
                </p>

                <p className="mt-1">
                  Your earnings: ₹
                  {Number(record.vendorEarning || 0).toLocaleString("en-IN")}
                </p>

                {/* Real YOMICO delivery assignment, read from the parent order
                    (order-level info only — no other seller's data, no customer
                    PII). Shown only when assigned/available, so legacy orders
                    are unaffected. Full detail remains on the order page. */}
                {(() => {
                  const d = deliveryByRecord[record.id];
                  if (
                    !d ||
                    (!d.deliveryCompanyName &&
                      !d.deliveryPartnerName &&
                      !d.shipmentNumber)
                  ) {
                    return null;
                  }
                  const who = [d.deliveryCompanyName, d.deliveryPartnerName]
                    .filter(Boolean)
                    .join(" · ");
                  return (
                    <p className="mt-1 text-sm">
                      <span className="text-gray-500">Delivery: </span>
                      {who || "Assigned"}
                      {d.shipmentNumber ? (
                        <span> · Tracking {d.shipmentNumber}</span>
                      ) : null}
                    </p>
                  );
                })()}

                <p className="mt-2 text-sm">
                  <span className="text-gray-500">Overall (summary): </span>
                  <span className="font-semibold">
                    {fulfilmentStageLabel(stage)}
                  </span>
                </p>

                <hr className="my-4" />

                {/* One row per product. Advancing one never touches another. */}
                <div className="space-y-2">
                  {(record.items || []).map((item, index) => {
                    const key = item.itemKey || `i${index}`;
                    const status =
                      record.itemFulfilment?.[key]?.status ?? "Confirmed";
                    const next = nextItemStage(String(status));
                    const busy = busyKey === `${record.id}:${key}`;

                    return (
                      <div
                        key={key}
                        className="border rounded-xl p-3 flex flex-wrap items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-semibold">{item.name}</p>
                          <p className="text-sm text-gray-600">
                            ₹{item.price} × {item.qty} = ₹
                            {(item.price || 0) * (item.qty || 0)}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {/* Stage strip, per product. Starts at Confirmed —
                              Pending is not a seller stage — and Confirmed
                              stays neutral because the seller has not done
                              anything yet. */}
                          <div className="flex flex-wrap gap-1">
                            {ITEM_FULFILMENT_STAGES.map((step) => (
                              <span
                                key={step}
                                className={`px-2 py-1 rounded-full text-[11px] ${
                                  isStageComplete(step, status)
                                    ? "bg-green-600 text-white"
                                    : "bg-gray-200"
                                }`}
                              >
                                {fulfilmentStageLabel(step)}
                              </span>
                            ))}
                          </div>

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

                <div className="mt-4">
                  <Link
                    href={`/seller/orders/${record.orderId}`}
                    className="bg-blue-600 hover:bg-blue-700 transition text-white px-4 py-2 rounded-lg inline-block"
                  >
                    View Details
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
