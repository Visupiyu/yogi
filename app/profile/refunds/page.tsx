"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { auth, db } from "@/lib/firebase";
import {
  REFUND_DESTINATION_LABEL,
  isTerminal,
  stagesFor,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";

// Customer refund/request history.
//
// Primary: the new per-item itemRequests (return + replace), read by the owner
// (firestore.rules: userId == uid). Secondary: the legacy order-level `returns`
// records, so older requests still show. Both are read-only here.

const TONE_BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700 border-green-300",
  bad: "bg-red-100 text-red-700 border-red-300",
  running: "bg-blue-100 text-blue-700 border-blue-300",
  idle: "bg-amber-100 text-amber-700 border-amber-300",
};

type ItemRequest = {
  id: string;
  requestNumber?: string;
  type?: ItemRequestType;
  status?: string;
  orderId?: string;
  reason?: string;
  item?: { name?: string; image?: string; qty?: number };
  refund?: { amount?: number };
  createdAt?: { seconds?: number };
};

export default function RefundsPage() {
  const [requests, setRequests] = useState<ItemRequest[]>([]);
  const [legacy, setLegacy] = useState<{ id: string; [k: string]: unknown }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setLoading(false);
        return;
      }
      try {
        const reqSnap = await getDocs(
          query(collection(db, "itemRequests"), where("userId", "==", user.uid))
        );
        const items: ItemRequest[] = [];
        reqSnap.forEach((d) => items.push({ id: d.id, ...(d.data() as object) }));
        items.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
        setRequests(items);

        // Legacy order-level returns, matched by email as before.
        if (user.email) {
          const legacySnap = await getDocs(
            query(collection(db, "returns"), where("userEmail", "==", user.email))
          );
          const legacyItems: { id: string; [k: string]: unknown }[] = [];
          legacySnap.forEach((d) => legacyItems.push({ id: d.id, ...d.data() }));
          setLegacy(legacyItems);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    });
    return () => unsub();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-red-500 to-orange-500 text-white p-6 sm:p-8 rounded-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">My Returns & Refunds</h1>
          <p className="opacity-90">Track your return and replacement requests</p>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">
            Loading...
          </div>
        ) : requests.length === 0 && legacy.length === 0 ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center text-gray-500">
            <p className="mb-4">You have no return or replacement requests yet.</p>
            <Link
              href="/orders"
              className="inline-flex px-6 py-3 rounded-xl bg-gradient-to-r from-green-600 to-blue-600 text-white font-semibold"
            >
              View My Orders
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {requests.map((r) => {
              const type: ItemRequestType =
                r.type === "replace" ? "replace" : "return";
              const status = r.status || "REQUESTED";
              const tone = statusTone(status);
              const stages = stagesFor(type);
              const idx = stages.indexOf(status);
              return (
                <div key={r.id} className="bg-white rounded-3xl shadow p-5">
                  <div className="flex items-center gap-4">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={r.item?.image || "/no-image.png"}
                      alt={r.item?.name || "Product"}
                      className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">
                        {r.item?.name || "Product"}
                      </p>
                      <p className="text-xs text-gray-500">
                        <span className="capitalize">{type}</span>
                        {r.requestNumber ? ` #${r.requestNumber}` : ""} · Order{" "}
                        {r.orderId?.slice(0, 8) || "-"} · Qty {r.item?.qty ?? 1}
                      </p>
                    </div>
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold border ${TONE_BADGE[tone]} shrink-0`}
                    >
                      {statusLabel(type, status)}
                    </span>
                  </div>

                  {!isTerminal(status) && idx >= 0 && (
                    <p className="mt-3 text-xs text-gray-500">
                      Step {idx + 1} of {stages.length}
                      {type === "return" &&
                      typeof r.refund?.amount === "number" &&
                      r.refund.amount > 0
                        ? ` · Refund ₹${r.refund.amount.toLocaleString(
                            "en-IN"
                          )} as ${REFUND_DESTINATION_LABEL}`
                        : type === "replace"
                        ? " · Replacement in progress"
                        : ""}
                    </p>
                  )}

                  {r.reason && (
                    <p className="mt-2 text-sm text-gray-600">
                      Reason: {r.reason}
                    </p>
                  )}
                </div>
              );
            })}

            {legacy.length > 0 && (
              <div className="pt-4">
                <h2 className="text-sm font-bold text-gray-500 mb-3 uppercase tracking-wide">
                  Earlier requests
                </h2>
                <div className="space-y-3">
                  {legacy.map((item) => (
                    <div key={item.id} className="bg-white rounded-2xl shadow p-4">
                      <p className="font-semibold text-sm">
                        Order: {String(item.orderId || "-").slice(0, 8)}
                      </p>
                      <p className="text-sm text-gray-600">
                        Reason: {String(item.reason || "-")}
                      </p>
                      <p className="text-sm mt-1">
                        Status:{" "}
                        <span
                          className={
                            item.status === "Refunded"
                              ? "text-green-600 font-semibold"
                              : item.status === "Rejected"
                              ? "text-red-600 font-semibold"
                              : "text-blue-600 font-semibold"
                          }
                        >
                          {String(item.status || "Pending")}
                        </span>
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
