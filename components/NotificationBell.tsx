"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";

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

  const [notifications,
    setNotifications] =
    useState<Notification[]>([]);

  const [open,
    setOpen] =
    useState(false);

 useEffect(() => {

  const loadNotifications =
    () => {

      try {

        const stored =
          JSON.parse(
            localStorage.getItem(
              "notifications"
            ) || "[]"
          );

        setNotifications(
          stored
        );

      } catch {

        setNotifications([]);

      }

    };

  loadNotifications();

  window.addEventListener(
    "notificationUpdated",
    loadNotifications
  );

  return () => {

    window.removeEventListener(
      "notificationUpdated",
      loadNotifications
    );

  };

}, []);

  const unreadCount =
    notifications.filter(
      (n) => !n.read
    ).length;

  const markAllRead = () => {

    const updated =
      notifications.map(
        (n) => ({
          ...n,
          read: true,
        })
      );

    setNotifications(updated);

    localStorage.setItem(
      "notifications",
      JSON.stringify(updated)
    );

  };

  return (

    <div className="relative">

      <button
        onClick={() =>
          setOpen(!open)
        }
        className="relative"
      >

        <Bell
          className="
            w-6
            h-6
            text-gray-700
          "
        />

        {unreadCount > 0 && (

          <span className="
            absolute
            -top-2
            -right-2
            bg-red-500
            text-white
            text-xs
            w-5
            h-5
            rounded-full
            flex
            items-center
            justify-center
          ">
           {unreadCount > 99
  ? "99+"
  : unreadCount}
          </span>

        )}

      </button>

      {open && (

        <div className="
          absolute
          right-0
          mt-3
          w-80
          bg-white
          rounded-2xl
          shadow-xl
          border
          z-50
        ">

          <div className="
            flex
            justify-between
            items-center
            p-4
            border-b
          ">

            <h3 className="
              font-bold
              text-lg
            ">
              Notifications
            </h3>

            <button
              onClick={markAllRead}
              className="
                text-sm
                text-green-600
              "
            >
              Mark All Read
            </button>

          </div>

          <div className="
            max-h-96
            overflow-y-auto
          ">

            {notifications.length === 0 ? (

              <div className="
                p-6
                text-center
                text-gray-500
              ">
               🔔 No Notifications
              </div>

            ) : (

              notifications.map(
                (item) => (

                <div
                  key={item.id}
                  className={`
                    p-4
                    border-b

                    ${
                      item.read
                      ? "bg-white"
                      : "bg-green-50"
                    }
                  `}
                >

                  <h4 className="
                    font-semibold
                  ">
                    {item.title}
                  </h4>

                  <p className="
                    text-sm
                    text-gray-600
                    mt-1
                  ">
                    {item.message}
                  </p>

                </div>

              ))

            )}

          </div>

          <Link
            href="/notifications"
            onClick={() => setOpen(false)}
            className="
              block
              text-center
              py-3
              text-green-600
              font-semibold
            "
          >
            View All
          </Link>

        </div>

      )}

    </div>

  );

}