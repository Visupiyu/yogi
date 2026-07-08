"use client";

import { useEffect, useState } from "react";

import {
  collection,
  onSnapshot,
  query,
  where,
  orderBy,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

interface Notification {
  id: string;
  title: string;
  message: string;
  read: boolean;
  createdAt?: any;
  type?: string;
  link?: string;
}

export default function NotificationsPage() {

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

useEffect(() => {

  const user = JSON.parse(

    localStorage.getItem("user") || "{}"

  );

  if (!user.uid) return;

  const q = query(

    collection(db, "notifications"),

    where("userId", "==", user.uid),

    where("role", "==", "customer"),

    orderBy("createdAt", "desc")

  );

  const unsubscribe = onSnapshot(

    q,

    (snapshot) => {

      const list: Notification[] = [];

      snapshot.forEach((docSnap) => {

        list.push({

          id: docSnap.id,

          ...(docSnap.data() as Omit<Notification, "id">),

        });

      });

      setNotifications(list);

    }

  );

  return () => unsubscribe();

}, []);

  const markAllRead = () => {

    const updated =

      notifications.map((n) => ({

        ...n,

        read: true,

      }));

    setNotifications(updated);

    localStorage.setItem(

      "notifications",

      JSON.stringify(updated)

    );

  };

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-5xl mx-auto">

        <div
          className="
            bg-gradient-to-r
            from-green-600
            to-blue-600
            text-white
            rounded-3xl
            p-8
            mb-8
          "
        >

          <h1 className="text-4xl font-bold">

            🔔 Notifications

          </h1>

          <p className="mt-2">

            Stay updated with your latest activity

          </p>

        </div>

        <div className="flex justify-end mb-5">

          <button

            onClick={markAllRead}

            className="
              bg-green-600
              hover:bg-green-700
              text-white
              px-5
              py-2
              rounded-xl
            "

          >

            Mark All Read

          </button>

        </div>

        <div className="space-y-4">

          {notifications.length === 0 ? (

            <div
              className="
                bg-white
                rounded-3xl
                shadow
                p-10
                text-center
              "
            >

              <h2 className="text-2xl font-bold">

                🔔 No Notifications

              </h2>

              <p className="text-gray-500 mt-2">

                You're all caught up.

              </p>

            </div>

          ) : (

            notifications.map((item) => (

              <div

                key={item.id}

                className={`
                  rounded-3xl
                  shadow
                  p-6
                  border-l-4
                  ${
                    item.read
                      ? "bg-white border-gray-300"
                      : "bg-green-50 border-green-600"
                  }
                `}

              >

                <div className="flex justify-between">

                  <h2 className="text-xl font-bold">

                    {item.title}

                  </h2>

                  {!item.read && (

                    <span
                      className="
                        bg-green-600
                        text-white
                        px-3
                        py-1
                        rounded-full
                        text-xs
                      "
                    >

                      New

                    </span>

                  )}

                </div>

                <p className="mt-3 text-gray-600">

                  {item.message}

                </p>

              </div>

            ))

          )}

        </div>

      </div>

    </div>

  );

}