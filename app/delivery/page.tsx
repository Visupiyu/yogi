"use client";

import { useEffect, useState } from "react";

import Link from "next/link";

import {

  collection,
  getDocs,
  query,
  where,
  orderBy,

} from "firebase/firestore";

import { auth, db } from "@/lib/firebase";

type Delivery = {

  id: string;

  customerName: string;

  phone?: string;

  address?: string;

  courierPartner?: string;

  trackingNumber?: string;

  expectedDelivery?: string;

  status: string;

  createdAt?: any;

};

export default function DeliveryDashboardPage() {

  const [deliveries, setDeliveries] =
    useState<Delivery[]>([]);

  const [loading, setLoading] =
    useState(true);

  const [search, setSearch] =
    useState("");

  useEffect(() => {

    loadDeliveries();

  }, []);

  const loadDeliveries = async () => {

    try {

      const user = auth.currentUser;

      if (!user) {

        setLoading(false);

        return;

      }

      const snapshot = await getDocs(

        query(

          collection(db, "orders"),

          where("deliveryPartnerId", "==", user.uid),

          orderBy("createdAt", "desc")

        )

      );

      const items: Delivery[] = [];

      snapshot.forEach((docSnap) => {

        const data: any = docSnap.data();

        items.push({

          id: docSnap.id,

          customerName:
            data.customerName || "Customer",

          phone:
            data.phone || "",

          address:
            data.address || "",

          courierPartner:
            data.courierPartner || "",

          trackingNumber:
            data.trackingNumber || "-",

          expectedDelivery:
            data.expectedDelivery || "-",

          status:
            data.status || "Pending",

          createdAt:
            data.createdAt,

        });

      });

      setDeliveries(items);

    } catch (error) {

      console.error(error);

    } finally {

      setLoading(false);

    }

  };

  const filtered = deliveries.filter(

    (item) =>

      item.customerName
        .toLowerCase()
        .includes(search.toLowerCase())

      ||

      item.id
        .toLowerCase()
        .includes(search.toLowerCase())

  );

  return (

    <div className="min-h-screen bg-gray-100 p-6">

      <div className="max-w-7xl mx-auto">

        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">

          <h1 className="text-4xl font-bold">

            🚚 Delivery Dashboard

          </h1>

          <p className="mt-2 opacity-90">

            Assigned deliveries

          </p>

        </div>

        <div className="grid md:grid-cols-4 gap-5 mb-8">

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Assigned

            </p>

            <h2 className="text-3xl font-bold">

              {deliveries.length}

            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Pending

            </p>

            <h2 className="text-3xl font-bold text-yellow-600">

              {

                deliveries.filter(

                  d => d.status === "Pending"

                ).length

              }

            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Out For Delivery

            </p>

            <h2 className="text-3xl font-bold text-blue-600">

              {

                deliveries.filter(

                  d => d.status === "Out For Delivery"

                ).length

              }

            </h2>

          </div>

          <div className="bg-white rounded-2xl p-6 shadow">

            <p className="text-gray-500">

              Delivered

            </p>

            <h2 className="text-3xl font-bold text-green-600">

              {

                deliveries.filter(

                  d => d.status === "Delivered"

                ).length

              }

            </h2>

          </div>

        </div>

        <input

          placeholder="Search delivery..."

          value={search}

          onChange={(e) =>
            setSearch(e.target.value)
          }

          className="w-full border rounded-2xl p-4 mb-6"

        />

        {loading ? (

          <div className="bg-white rounded-3xl p-10 text-center">

            Loading...

          </div>

        ) : filtered.length === 0 ? (

          <div className="bg-white rounded-3xl p-10 text-center shadow">

            <h2 className="text-2xl font-bold">

              No Assigned Deliveries

            </h2>

            <p className="text-gray-500 mt-2">

              You don't have any deliveries assigned yet.

            </p>

          </div>

        ) : (

          <div className="space-y-4">

            {filtered.map((delivery) => (

              <Link

                key={delivery.id}

                href={`/delivery/${delivery.id}`}

                className="block bg-white rounded-3xl shadow hover:shadow-lg transition p-6"

              >

                <div className="flex justify-between items-center">

                  <div>

                    <h2 className="text-xl font-bold">

                      {delivery.customerName}

                    </h2>

                    <p className="text-gray-500">

                      Order #

                      {delivery.id.slice(0,8)}

                    </p>

                    <p className="mt-2">

                      📞 {delivery.phone}

                    </p>

                  </div>

                  <div className="text-right">

                    <p>

                      🚚 {delivery.status}

                    </p>

                    <p>

                      📦 {delivery.trackingNumber}

                    </p>

                    <p>

                      📅 {delivery.expectedDelivery}

                    </p>

                  </div>

                </div>

              </Link>

            ))}

          </div>

        )}

      </div>

    </div>

  );

}