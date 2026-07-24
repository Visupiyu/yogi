"use client";

import { useEffect, useMemo, useState } from "react";

import {
  collection,
  onSnapshot,
  query,
  where,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type StockNotification = {
  id: string;
  productId: string;
  productName: string;
  userName: string;
  userEmail: string;
  vendorId: string;
  createdAt?: any;
};

export default function SellerStockNotificationsPage() {
  const [requests, setRequests] = useState<
    StockNotification[]
  >([]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const vendor = JSON.parse(
      localStorage.getItem("vendor") || "{}"
    );

    if (!vendor.uid) {
      setLoading(false);
      return;
    }

    const q = query(
      collection(db, "stockNotifications"),
      where("vendorId", "==", vendor.uid)
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const data: StockNotification[] = [];

        snapshot.forEach((docSnap) => {
          data.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<
              StockNotification,
              "id"
            >),
          });
        });

        setRequests(data);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const groupedProducts = useMemo(() => {
    const groups: Record<
      string,
      {
        productName: string;
        customers: StockNotification[];
      }
    > = {};

    requests.forEach((item) => {
      if (!groups[item.productId]) {
        groups[item.productId] = {
          productName: item.productName,
          customers: [],
        };
      }

      groups[item.productId].customers.push(item);
    });

    return Object.entries(groups);
  }, [requests]);

  const markAsNotified = async (
    customers: StockNotification[]
  ) => {
    for (const customer of customers) {
      await deleteDoc(
        doc(
          db,
          "stockNotifications",
          customer.id
        )
      );
    }

    alert(
      "Notification requests cleared."
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <h2 className="text-2xl font-bold">
          Loading...
        </h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-orange-500 to-red-500 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">
            🔔 Stock Notifications
          </h1>

          <p className="mt-2">
            Customers waiting for products to
            return in stock
          </p>

        </div>

        {groupedProducts.length === 0 ? (

          <div className="bg-white rounded-3xl shadow p-10 text-center">

            <h2 className="text-2xl font-bold">
              🎉 No Waiting Customers
            </h2>

            <p className="text-gray-500 mt-2">
              Nobody has requested stock alerts.
            </p>

          </div>

        ) : (

          <div className="space-y-6">

            {groupedProducts.map(
              ([productId, group]) => (

                <div
                  key={productId}
                  className="bg-white rounded-3xl shadow p-6"
                >

                  <div className="flex justify-between items-start">

                    <div>

                      <h2 className="text-2xl font-bold">
                        {group.productName}
                      </h2>

                      <p className="text-gray-500 mt-2">
                        Waiting Customers :
                        {" "}
                        <span className="font-bold text-green-600">
                          {
                            group.customers.length
                          }
                        </span>
                      </p>

                    </div>

                    <button
                      onClick={() =>
                        markAsNotified(
                          group.customers
                        )
                      }
                      className="bg-green-600 hover:bg-green-700 text-white px-5 py-3 rounded-xl"
                    >
                      ✔ Mark as Notified
                    </button>

                  </div>

                  <div className="mt-6 space-y-4">

                    {group.customers.map(
                      (customer) => (

                        <div
                          key={customer.id}
                          className="border rounded-2xl p-4 flex justify-between items-center"
                        >

                          <div>

                            <h3 className="font-bold">
                              👤{" "}
                              {customer.userName}
                            </h3>

                            <p className="text-gray-600">
                              📧{" "}
                              {customer.userEmail}
                            </p>

                          </div>

                          <div className="text-sm text-gray-400">

                            {customer.createdAt?.seconds
                              ? new Date(
                                  customer.createdAt.seconds *
                                    1000
                                ).toLocaleDateString()
                              : ""}

                          </div>

                        </div>

                      )
                    )}

                  </div>

                </div>

              )
            )}

          </div>

        )}

      </div>

    </div>
  );
}