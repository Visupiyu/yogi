"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

type Notification = {
  id: string;
  title: string;
  message: string;
  read: boolean;
  role?: string;
  type?: string;
  userId?: string;
  createdAt?: any;
};

export default function SellerNotificationsPage() {

  const [notifications, setNotifications] =
    useState<Notification[]>([]);

  const [loading, setLoading] =
    useState(true);

  useEffect(() => {

    loadNotifications();

  }, []);

  const loadNotifications = async () => {

    try {

      const vendor = JSON.parse(

        localStorage.getItem("vendor") || "{}"

      );

      const snapshot = await getDocs(

        query(

          collection(db, "notifications"),

          where("userId", "==", vendor.uid),

          where("role", "==", "seller"),

          orderBy("createdAt", "desc")

        )

      );

      const items: Notification[] = [];

      snapshot.forEach((docSnap) => {

        items.push({

          id: docSnap.id,

          ...(docSnap.data() as Omit<Notification, "id">),

        });

      });

      setNotifications(items);

    } catch (error) {

      console.error(

        "Failed to load seller notifications:",

        error

      );

    } finally {

      setLoading(false);

    }

  };

  const markAsRead = async (id: string) => {

    await updateDoc(

      doc(db, "notifications", id),

      {

        read: true,

      }

    );

    setNotifications(

      notifications.map((item) =>

        item.id === id

          ? { ...item, read: true }

          : item

      )

    );

  };

  const deleteNotification = async (id: string) => {

    await deleteDoc(

      doc(db, "notifications", id)

    );

    setNotifications(

      notifications.filter(

        (item) => item.id !== id

      )

    );

  };

  if (loading) {

    return (

      <div className="min-h-screen flex items-center justify-center">

        <h2 className="text-2xl font-bold">

          Loading Notifications...

        </h2>

      </div>

    );

  }

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-6xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🔔 Seller Notifications

          </h1>

          <p className="mt-2">

            Orders, chats, reviews and payment updates

          </p>

        </div>

        {notifications.length === 0 ? (

          <div className="bg-white rounded-3xl shadow p-10 text-center">

            <h2 className="text-2xl font-bold">

              🎉 No Notifications

            </h2>

            <p className="text-gray-500 mt-2">

              Everything is up to date.

            </p>

          </div>

        ) : (

          <div className="space-y-4">

            {notifications.map((item) => (

              <div

                key={item.id}

                className={`bg-white rounded-3xl shadow p-6 border-l-4 ${
                  item.read
                    ? "border-gray-300"
                    : "border-green-600 bg-green-50"
                }`}

              >

                <span className="inline-block bg-green-100 text-green-700 text-xs px-3 py-1 rounded-full mb-2">

                  {item.type || "Info"}

                </span>

                <h2 className="text-xl font-bold">

                  {item.title}

                </h2>

                <p className="mt-2 text-gray-600">

                  {item.message}

                </p>

                <p className="text-sm text-gray-400 mt-2">

                  {item.createdAt?.seconds

                    ? new Date(

                        item.createdAt.seconds * 1000

                      ).toLocaleString()

                    : ""}

                </p>

                <div className="flex gap-3 mt-5">

                  {!item.read && (

                    <button

                      onClick={() => markAsRead(item.id)}

                      className="bg-green-600 text-white px-4 py-2 rounded-lg"

                    >

                      Mark Read

                    </button>

                  )}

                  <button

                    onClick={() => deleteNotification(item.id)}

                    className="bg-red-600 text-white px-4 py-2 rounded-lg"

                  >

                    Delete

                  </button>

                </div>

              </div>

            ))}

          </div>

        )}

      </div>

    </div>

  );

}