"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import {
  collection,
  onSnapshot,
  query,
  where,
  updateDoc,
  doc,
} from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { auth, db } from "@/lib/firebase";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt?: any;
  type?: string;
  link?: string;
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;

    // The uid now comes from Firebase Auth rather than a localStorage copy,
    // which could be stale or edited — a mismatched uid produced a query the
    // security rules rejected, and with no error handler the bell just sat
    // silently empty. The seller/customer distinction still comes from the
    // "vendor" key, which is the only role signal available here; it is read
    // inside the callback so it stays in sync with the current session.
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = undefined;
      }

      if (!firebaseUser) {
        setNotifications([]);
        return;
      }

      const role = localStorage.getItem("vendor") ? "seller" : "customer";

      // No orderBy here → avoids a composite index. We sort in JS below.
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", firebaseUser.uid),
        where("role", "==", role)
      );

      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const list: Notification[] = [];
          snapshot.forEach((docSnap) => {
            list.push({
              id: docSnap.id,
              ...(docSnap.data() as Omit<Notification, "id">),
            });
          });
          list.sort(
            (a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
          );
          setNotifications(list);
        },
        (error) => {
          console.error("Failed to load notifications:", error);
        }
      );
    });

    return () => {
      unsubscribeAuth();
      if (unsubscribeSnapshot) unsubscribeSnapshot();
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

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

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(!open)} className="relative">
        <Bell className="w-6 h-6 text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 bg-white rounded-2xl shadow-xl border z-50">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-bold text-lg">Notifications</h3>
            <button
              onClick={markAllRead}
              className="text-sm text-green-600 font-semibold"
            >
              Mark All Read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                🔔 No Notifications
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 border-b ${
                    item.read ? "bg-white" : "bg-green-50"
                  }`}
                >
                  <h4 className="font-semibold">{item.title}</h4>
                  <p className="text-sm text-gray-600 mt-1">{item.message}</p>
                </div>
              ))
            )}
          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="block text-center py-3 text-green-600 font-semibold"
          >
            View All
          </Link>
        </div>
      )}
    </div>
  );
}
