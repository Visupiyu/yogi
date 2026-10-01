"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import { auth } from "@/lib/firebase";
import {
  fetchNotifications,
  formatDate,
  markNotificationsRead,
  type CustomerNotification,
} from "@/lib/account/accountClient";
import { customerLoginUrl } from "@/lib/authRedirect";

// The customer notification centre. Everything comes from
// app/api/account/notifications — the signed-in customer's own customer
// notifications as fixed fields (opaque ids, server-derived links, no internal
// delivery or seller fields). Marking read goes through
// app/api/account/notifications/read, which only ever touches the caller's
// own notifications. This page no longer reads or writes Firestore directly.

const CATEGORY_ICON: Record<CustomerNotification["category"], string> = {
  order: "📦",
  delivery: "🚚",
  refund: "💸",
  support: "🎫",
  stock: "🔔",
  other: "🔔",
};

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<CustomerNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await fetchNotifications();
    setError(result.error);
    if (result.data) {
      setNotifications(result.data.notifications);
      setUnreadCount(result.data.unreadCount);
      setNextCursor(result.data.nextCursor);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user) {
        router.push(customerLoginUrl());
        return;
      }
      load();
    });
    return () => unsub();
  }, [router, load]);

  const loadMore = async () => {
    if (!nextCursor) return;
    setLoadingMore(true);
    const result = await fetchNotifications(nextCursor);
    setLoadingMore(false);
    if (result.data) {
      setNotifications((prev) => [...prev, ...result.data!.notifications]);
      setNextCursor(result.data.nextCursor);
      setUnreadCount(result.data.unreadCount);
    }
  };

  const markRead = async (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    await markNotificationsRead({ ids: [id] });
  };

  const markAllRead = async () => {
    const result = await markNotificationsRead({ all: true });
    if (!result.error) {
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnreadCount(0);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4 sm:p-6">
      <div className="max-w-5xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">🔔 Notifications</h1>
          <p className="mt-2">
            {unreadCount > 0 ? `${unreadCount} unread` : "Stay updated with your latest activity"}
          </p>
        </div>

        <div className="flex justify-end mb-5">
          <button
            onClick={markAllRead}
            disabled={unreadCount === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white px-5 py-2 rounded-xl"
          >
            Mark All Read
          </button>
        </div>

        {loading ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">Loading...</div>
        ) : error && notifications.length === 0 ? (
          <div className="bg-red-50 rounded-3xl p-6 text-red-700">{error}</div>
        ) : notifications.length === 0 ? (
          <div className="bg-white rounded-3xl shadow p-10 text-center">
            <h2 className="text-2xl font-bold">🔔 No Notifications</h2>
            <p className="text-gray-500 mt-2">You&apos;re all caught up.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {notifications.map((item) => (
              <div
                key={item.id}
                onClick={() => !item.read && markRead(item.id)}
                className={`rounded-3xl shadow p-6 border-l-4 ${
                  item.read ? "bg-white border-gray-300" : "bg-green-50 border-green-600 cursor-pointer"
                }`}
              >
                <div className="flex justify-between gap-3">
                  <h2 className="text-xl font-bold break-words">
                    <span className="mr-2">{CATEGORY_ICON[item.category]}</span>
                    {item.title}
                  </h2>
                  {!item.read && (
                    <span className="shrink-0 self-start bg-green-600 text-white px-3 py-1 rounded-full text-xs">New</span>
                  )}
                </div>
                <p className="mt-3 text-gray-600 break-words">{item.message}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="text-xs text-gray-400">{formatDate(item.createdAt, true)}</span>
                  {item.link && (
                    <Link
                      href={item.link}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (!item.read) void markRead(item.id);
                      }}
                      className="text-sm font-semibold text-green-700 hover:underline"
                    >
                      {item.orderNumber ? `View order #${item.orderNumber}` : "View details"} →
                    </Link>
                  )}
                </div>
              </div>
            ))}
            {nextCursor && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full rounded-2xl border bg-white py-3 font-semibold text-gray-700 disabled:opacity-60"
              >
                {loadingMore ? "Loading…" : "Show older notifications"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
