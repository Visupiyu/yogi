"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";

// Back-in-stock requests for this seller's products, from the server
// (app/api/seller/stock-notifications): a COUNT of waiting customers per
// product. Customers' names and emails are no longer shown to sellers — this
// page used to read the request documents, emails included, straight from
// Firestore. "Notify waiting customers" sends each of them an in-app YOMICO
// notification (once the product is back in stock) and clears the requests.

type WaitingProduct = {
  productId: string;
  productName: string;
  waiting: number;
  stock: number;
};

async function authedFetch(url: string, init: RequestInit = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error("Please sign in again.");
  const token = await user.getIdToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(typeof body?.error === "string" ? body.error : "Something went wrong.");
  return body;
}

export default function SellerStockNotificationsPage() {
  const router = useRouter();

  const [items, setItems] = useState<WaitingProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const body = await authedFetch("/api/seller/stock-notifications");
      setItems(Array.isArray(body?.items) ? body.items : []);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push("/vendor-login");
        return;
      }
      load();
    });
    return () => unsubscribe();
  }, [router, load]);

  const notifyWaiting = async (item: WaitingProduct) => {
    setBusy(item.productId);
    try {
      const body = await authedFetch("/api/seller/stock-notifications", {
        method: "POST",
        body: JSON.stringify({ productId: item.productId }),
      });
      alert(`Notified ${body.notified ?? 0} waiting customer(s).`);
      await load();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h2 className="text-2xl font-bold">Loading...</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-3xl p-5 md:p-8 mb-8">
          <h1 className="text-3xl md:text-4xl font-bold">🔔 Stock Notifications</h1>
          <p className="mt-2">Customers waiting for your products to return in stock</p>
        </div>

        {error && (
          <div className="mb-6 rounded-2xl bg-red-50 p-4 text-red-700">{error}</div>
        )}

        {items.length === 0 ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">
            <h2 className="text-2xl font-bold">🎉 No Waiting Customers</h2>
            <p className="text-gray-500 mt-2">Nobody has requested stock alerts.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {items.map((item) => (
              <div key={item.productId} className="bg-white rounded-3xl shadow p-6">
                <div className="flex flex-wrap justify-between items-start gap-4">
                  <div className="min-w-0">
                    <h2 className="text-2xl font-bold break-words">{item.productName || "Product"}</h2>
                    <p className="text-gray-500 mt-2">
                      Waiting Customers :{" "}
                      <span className="font-bold text-green-600">{item.waiting}</span>
                    </p>
                    <p className="text-gray-500 mt-1">
                      Current stock : <span className="font-semibold">{item.stock}</span>
                    </p>
                  </div>

                  <button
                    onClick={() => notifyWaiting(item)}
                    disabled={busy === item.productId || item.stock <= 0}
                    title={item.stock <= 0 ? "Restock this product first" : undefined}
                    className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl font-semibold disabled:opacity-50"
                  >
                    {busy === item.productId ? "Notifying..." : "🔔 Notify waiting customers"}
                  </button>
                </div>
                {item.stock <= 0 && (
                  <p className="mt-3 text-sm text-orange-700">
                    Restock this product, then notify the waiting customers.
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
