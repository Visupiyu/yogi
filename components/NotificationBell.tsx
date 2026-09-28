"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import {
  fetchNotifications,
  fetchUnreadCount,
  markNotificationsRead,
} from "@/lib/account/accountClient";

// Header bell.
//
// CUSTOMER mode reads through the server (app/api/account/notifications*):
// fixed fields only, opaque ids, server-derived links, and mark-read that can
// only touch the caller's own notifications. The unread badge is polled every
// 60 seconds and whenever the window regains focus (inside the route's
// 60-per-10-minutes limit); the list itself is fetched when the bell opens.
//
// SELLER mode (a "vendor" session) is unchanged: it keeps its live Firestore
// listener on the seller's own notifications.

type BellItem = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  link: string | null;
  orderNumber: string | null;
};

const POLL_MS = 60 * 1000;
const DROPDOWN_ITEMS = 10;

export default function NotificationBell() {
  const [mode, setMode] = useState<"customer" | "seller" | null>(null);
  const [items, setItems] = useState<BellItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // ---------------- session / mode ----------------
  useEffect(() => {
    let unsubscribeSnapshot: (() => void) | undefined;
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (unsubscribeSnapshot) {
        unsubscribeSnapshot();
        unsubscribeSnapshot = undefined;
      }
      setItems([]);
      setUnreadCount(0);
      if (!firebaseUser) {
        setMode(null);
        return;
      }
      // The seller/customer distinction still comes from the "vendor" key,
      // the only role signal available here.
      if (!localStorage.getItem("vendor")) {
        setMode("customer");
        return;
      }
      setMode("seller");
      // Seller feed — unchanged: the seller's own notifications, live.
      const q = query(
        collection(db, "notifications"),
        where("userId", "==", firebaseUser.uid),
        where("role", "==", "seller")
      );
      unsubscribeSnapshot = onSnapshot(
        q,
        (snapshot) => {
          const list: (BellItem & { at: number })[] = [];
          snapshot.forEach((docSnap) => {
            const d = docSnap.data() as {
              title?: string;
              message?: string;
              read?: boolean;
              createdAt?: { seconds?: number };
              orderId?: string | null;
              orderNumber?: string | null;
            };
            list.push({
              id: docSnap.id,
              title: d.title || "",
              message: d.message || "",
              read: d.read === true,
              // As before: a notification carrying an order reference links to it.
              link: d.orderId ? `/orders/${d.orderId}` : null,
              orderNumber: d.orderNumber || null,
              at: d.createdAt?.seconds || 0,
            });
          });
          list.sort((a, b) => b.at - a.at);
          setItems(list);
          setUnreadCount(list.filter((n) => !n.read).length);
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

  // ---------------- customer: poll the badge ----------------
  const refreshUnread = useCallback(async () => {
    const result = await fetchUnreadCount();
    if (result.data) setUnreadCount(result.data.unreadCount);
  }, []);

  useEffect(() => {
    if (mode !== "customer") return;
    refreshUnread();
    const timer = setInterval(refreshUnread, POLL_MS);
    const onFocus = () => refreshUnread();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [mode, refreshUnread]);

  // ---------------- customer: load the list when opened ----------------
  useEffect(() => {
    if (!open || mode !== "customer") return;
    let cancelled = false;
    fetchNotifications().then((result) => {
      if (cancelled || !result.data) return;
      setUnreadCount(result.data.unreadCount);
      setItems(
        result.data.notifications.slice(0, DROPDOWN_ITEMS).map((n) => ({
          id: n.id,
          title: n.title,
          message: n.message,
          read: n.read,
          link: n.link,
          orderNumber: n.orderNumber,
        }))
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, mode]);

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

  const markRead = async (id: string) => {
    if (mode === "customer") {
      setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
      setUnreadCount((c) => Math.max(0, c - 1));
      await markNotificationsRead({ ids: [id] });
      return;
    }
    try {
      await updateDoc(doc(db, "notifications", id), { read: true });
    } catch (error) {
      console.error(error);
    }
  };

  const markAllRead = async () => {
    if (mode === "customer") {
      const result = await markNotificationsRead({ all: true });
      if (!result.error) {
        setItems((prev) => prev.map((n) => ({ ...n, read: true })));
        setUnreadCount(0);
      }
      return;
    }
    for (const item of items) {
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
      <button onClick={() => setOpen(!open)} className="relative" aria-label="Notifications">
        <Bell className="w-6 h-6 text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-3 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-xl border z-50">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-bold text-lg">Notifications</h3>
            <button onClick={markAllRead} className="text-sm text-green-600 font-semibold">
              Mark All Read
            </button>
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <div className="p-6 text-center text-gray-500">🔔 No Notifications</div>
            ) : (
              items.map((item) => {
                const body = (
                  <>
                    <h4 className="font-semibold break-words">{item.title}</h4>
                    <p className="text-sm text-gray-600 mt-1 break-words">{item.message}</p>
                    {item.link && (
                      <span className="mt-1 inline-block text-xs font-semibold text-green-600">
                        {item.link.startsWith("/orders/")
                          ? `View order${item.orderNumber ? ` #${item.orderNumber}` : ""}`
                          : "View details"}{" "}
                        →
                      </span>
                    )}
                  </>
                );
                const base = `block p-4 border-b ${item.read ? "bg-white" : "bg-green-50"}`;
                // A notification with a server-derived link (the customer's own
                // order, returns & refunds, tickets or account page) opens it,
                // marking it read on the way.
                return item.link ? (
                  <Link
                    key={item.id}
                    href={item.link}
                    onClick={() => {
                      void markRead(item.id);
                      setOpen(false);
                    }}
                    className={`${base} hover:bg-gray-100 transition`}
                  >
                    {body}
                  </Link>
                ) : (
                  <div
                    key={item.id}
                    className={`${base} ${item.read ? "" : "cursor-pointer"}`}
                    onClick={() => !item.read && void markRead(item.id)}
                  >
                    {body}
                  </div>
                );
              })
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
