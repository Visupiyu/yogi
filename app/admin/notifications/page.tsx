"use client";

import { useEffect, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Notification = {
  id: string;
  title: string;
  message: string;
  type?: string;
  read: boolean;
  createdAt?: any;
};

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [filter, setFilter] = useState<"all" | "unread">("all");

  useEffect(() => {
    // Admin notifications only (role == "admin"). No orderBy → no composite index.
    const q = query(
      collection(db, "notifications"),
      where("role", "==", "admin")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const items: Notification[] = [];
        snapshot.forEach((docSnap) =>
          items.push({
            id: docSnap.id,
            ...(docSnap.data() as Omit<Notification, "id">),
          })
        );
        items.sort(
          (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );
        setNotifications(items);
      },
      (error) => {
        console.error(error);
      }
    );

    return () => unsubscribe();
  }, []);

  const markRead = async (id: string) => {
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      console.error(error);
    }
  };

  const markAllRead = async () => {
    for (const item of notifications) {
      if (!item.read) {
        try {
          await updateDoc(doc(db, "notifications", item.id), { read: true });
        } catch (error) {
          console.error(error);
        }
      }
    }
  };

  const unreadCount = notifications.filter((n) => !n.read).length;
  const shown =
    filter === "unread"
      ? notifications.filter((n) => !n.read)
      : notifications;

  const icon = (type?: string) =>
    type === "order"
      ? "🛒"
      : type === "delivery"
      ? "🚚"
      : type === "vendor"
      ? "🏬"
      : "🔔";

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-4xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">🔔 Notifications</h1>
          <p className="mt-2 opacity-90">
            {unreadCount} unread of {notifications.length}
          </p>
        </div>

        <div className="flex items-center justify-between mb-6">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter("all")}
              className={`px-5 py-2 rounded-xl font-semibold transition ${
                filter === "all"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter("unread")}
              className={`px-5 py-2 rounded-xl font-semibold transition ${
                filter === "unread"
                  ? "bg-green-600 text-white"
                  : "bg-white text-gray-700"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="text-green-600 font-semibold hover:underline"
            >
              Mark all read
            </button>
          )}
        </div>

        {shown.length === 0 ? (
          <div className="bg-white rounded-3xl p-12 text-center text-gray-500 shadow">
            <div className="text-4xl mb-2">🔔</div>
            No notifications.
          </div>
        ) : (
          <div className="space-y-3">
            {shown.map((note) => (
              <div
                key={note.id}
                className={`rounded-2xl p-5 shadow-sm border flex items-start gap-4 ${
                  note.read ? "bg-white" : "bg-green-50 border-green-200"
                }`}
              >
                <div className="text-2xl">{icon(note.type)}</div>
                <div className="flex-1">
                  <h3 className="font-bold">{note.title}</h3>
                  <p className="text-gray-600 text-sm mt-1">{note.message}</p>
                  {note.createdAt?.seconds && (
                    <p className="text-xs text-gray-400 mt-2">
                      {new Date(
                        note.createdAt.seconds * 1000
                      ).toLocaleString()}
                    </p>
                  )}
                </div>
                {!note.read && (
                  <button
                    onClick={() => markRead(note.id)}
                    className="text-sm text-green-600 font-semibold shrink-0"
                  >
                    Mark read
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
