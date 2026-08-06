"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

const notifications = [
  {
    title: "Welcome to YOMICO Seller Portal",
    message: "Your seller account is active and ready.",
    type: "success",
  },
  {
    title: "Complete Your Store Profile",
    message: "Add your logo, banner and business details.",
    type: "info",
  },
  {
    title: "Inventory Reminder",
    message: "Keep your stock updated to avoid cancelled orders.",
    type: "warning",
  },
];

export default function NotificationsPanel() {

  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (user) => {

      if (!user) {
        setLoading(false);
        return;
      }

      try {

        const q = query(
          collection(db, "notifications"),
          where("userId", "==", user.uid),
          orderBy("createdAt", "desc"),
          limit(5)
        );

        const snapshot = await getDocs(q);

        const items: any[] = [];

        snapshot.forEach((docSnap) => {

          items.push({
            id: docSnap.id,
            ...docSnap.data(),
          });

        });

        setNotifications(items);

      } catch (err) {

        console.error(err);

      } finally {

        setLoading(false);

      }

    });

    return () => unsub();

  }, []);
  return (
  
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        🔔 Notifications
      </h2>

      <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-medium text-blue-700">
        {notifications.length} New
      </span>

    </div>

    {loading ? (

      <div className="py-10 text-center text-gray-500">
        Loading...
      </div>

    ) : notifications.length === 0 ? (

      <div className="py-10 text-center text-gray-500">
        No notifications available.
      </div>

    ) : (

      <div className="space-y-4">

        {notifications.map((item) => (

          <div
            key={item.id}
            className="rounded-xl border border-gray-200 p-4 hover:bg-gray-50"
          >

            <h3 className="font-semibold text-gray-900">
              {item.title}
            </h3>

            <p className="mt-1 text-sm text-gray-600">
              {item.message}
            </p>

            <p className="mt-2 text-xs text-gray-400">
              {item.createdAt?.toDate
                ? item.createdAt.toDate().toLocaleString()
                : ""}
            </p>

          </div>

        ))}

      </div>

    )}

  </div>
);
}