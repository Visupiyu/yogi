"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { collection, getDocs, query, where } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import {
  isTerminal,
  sellerNextReplaceStage,
  statusLabel,
  statusTone,
  type ItemRequestType,
} from "@/lib/itemRequests";

// Seller Returns & Replacements.
//
// Two clearly separated jobs:
//   - REPLACEMENT TASKS: once an admin approves a replacement, the seller
//     prepares and ships it, advancing it through SELLER_PREPARING ->
//     READY_FOR_DELIVERY -> HANDED_OVER_TO_COURIER -> DELIVERED via the
//     transition route (the ONLY writer — firestore.rules denies client writes,
//     and the route authorizes the item's own vendor for exactly these stages).
//   - RETURN REQUESTS: shown for the seller's awareness (their stock is coming
//     back), but NOT actionable here — admin drives pickup/refund.
//
// The query is a plain equality on vendorId; firestore.rules independently
// restricts every itemRequests read to the owning vendor (or the customer or an
// admin), so a seller can never load another seller's request. Replacement
// fulfilment lives entirely on the itemRequests document — it never touches the
// original order's sellerOrders roll-up or SLA.

const TONE_BADGE: Record<string, string> = {
  ok: "bg-green-100 text-green-700 border-green-300",
  bad: "bg-red-100 text-red-700 border-red-300",
  running: "bg-blue-100 text-blue-700 border-blue-300",
  idle: "bg-amber-100 text-amber-700 border-amber-300",
};

type ItemRequest = {
  id: string;
  type?: ItemRequestType;
  status?: string;
  orderId?: string;
  customerName?: string;
  reason?: string;
  item?: { name?: string; image?: string; qty?: number };
  createdAt?: { seconds?: number };
};

export default function SellerReturnsPage() {
  const router = useRouter();
  const [requests, setRequests] = useState<ItemRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push("/vendor-login");
        return;
      }
      try {
        const snap = await getDocs(
          query(collection(db, "itemRequests"), where("vendorId", "==", user.uid))
        );
        if (!active) return;
        const list: ItemRequest[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as object) }));
        list.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
        setRequests(list);
      } catch (error) {
        console.error("Failed to load requests:", error);
      } finally {
        if (active) setLoading(false);
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [router, reloadKey]);

  const advance = async (requestId: string, toStatus: string) => {
    const user = auth.currentUser;
    if (!user) {
      router.push("/vendor-login");
      return;
    }
    try {
      setBusyId(requestId);
      const token = await user.getIdToken();
      const res = await fetch("/api/item-request/transition", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ requestId, toStatus }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error || "Could not update the replacement.");
        return;
      }
      toast.success("Replacement updated.");
      setReloadKey((k) => k + 1);
    } catch (error) {
      console.error(error);
      toast.error("Something went wrong.");
    } finally {
      setBusyId(null);
    }
  };

  const replaceTasks = requests.filter((r) => r.type === "replace");
  const returnRequests = requests.filter((r) => (r.type || "return") === "return");

  const Card = ({ r, actionable }: { r: ItemRequest; actionable: boolean }) => {
    const type: ItemRequestType = r.type === "replace" ? "replace" : "return";
    const status = r.status || "REQUESTED";
    const tone = statusTone(status);
    const sellerNext = sellerNextReplaceStage(type, status);
    const busy = busyId === r.id;
    const awaitingAdmin =
      type === "replace" &&
      !isTerminal(status) &&
      !sellerNext &&
      status !== "DELIVERED";

    return (
      <div className="bg-white rounded-3xl shadow p-5 flex flex-col sm:flex-row gap-4">
        <div className="flex items-center gap-3 sm:w-1/2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={r.item?.image || "/no-image.png"}
            alt={r.item?.name || "Product"}
            className="w-14 h-14 rounded-xl object-cover bg-gray-100 shrink-0"
          />
          <div className="min-w-0">
            <p className="font-semibold truncate">{r.item?.name || "Product"}</p>
            <p className="text-xs text-gray-500">
              Qty {r.item?.qty ?? 1} · Order {r.orderId?.slice(0, 8) || "-"}
            </p>
            <p className="text-xs text-gray-500">
              {r.customerName || "Customer"} · Reason: {r.reason || "-"}
            </p>
          </div>
        </div>

        <div className="sm:flex-1 flex flex-col sm:items-end gap-2">
          <span
            className={`self-start sm:self-end px-3 py-1 rounded-full text-xs font-semibold border ${TONE_BADGE[tone]}`}
          >
            {statusLabel(type, status)}
          </span>

          {actionable && sellerNext && (
            <button
              disabled={busy}
              onClick={() => advance(r.id, sellerNext)}
              className="text-sm font-semibold px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 disabled:opacity-60 text-white"
            >
              {busy ? "Saving..." : `Mark ${statusLabel(type, sellerNext)}`}
            </button>
          )}
          {actionable && awaitingAdmin && (
            <p className="text-xs text-gray-400">Awaiting admin approval</p>
          )}
          {actionable && status === "DELIVERED" && (
            <p className="text-xs text-green-600 font-semibold">
              Replacement delivered
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white p-6 sm:p-8 rounded-3xl mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold">Returns & Replacements</h1>
          <p className="opacity-90">
            Prepare approved replacements; track returns on your items
          </p>
        </div>

        {loading ? (
          <div className="bg-white p-10 rounded-3xl text-center">Loading...</div>
        ) : (
          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-bold mb-4">
                🔁 Replacement tasks
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({replaceTasks.length})
                </span>
              </h2>
              {replaceTasks.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl text-center text-gray-500">
                  No replacement tasks right now.
                </div>
              ) : (
                <div className="space-y-4">
                  {replaceTasks.map((r) => (
                    <Card key={r.id} r={r} actionable />
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="text-xl font-bold mb-4">
                ↩️ Return requests
                <span className="ml-2 text-sm font-normal text-gray-500">
                  ({returnRequests.length}) · handled by admin
                </span>
              </h2>
              {returnRequests.length === 0 ? (
                <div className="bg-white p-8 rounded-3xl text-center text-gray-500">
                  No return requests on your items.
                </div>
              ) : (
                <div className="space-y-4">
                  {returnRequests.map((r) => (
                    <Card key={r.id} r={r} actionable={false} />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
