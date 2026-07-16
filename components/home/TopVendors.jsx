"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function TopVendors() {
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const snapshot = await getDocs(collection(db, "vendors"));
        const items = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });

        // Prefer approved vendors, show up to 8
        const approved = items.filter((v) => v.status === "Approved");
        setVendors((approved.length ? approved : items).slice(0, 8));
      } catch (error) {
        console.error("Vendor Fetch Error:", error);
      }
    };

    fetchVendors();
  }, []);

  if (vendors.length === 0) return null;

  return (
    <section className="py-8 px-4 bg-gray-50">
      <div className="max-w-7xl mx-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-2xl md:text-3xl font-bold">Top Vendors</h2>
          <Link
            href="/stores"
            className="text-green-600 font-semibold text-sm hover:underline"
          >
            View All →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {vendors.map((vendor) => (
            <Link key={vendor.id} href={`/store/${vendor.id}`}>
              <div className="bg-gradient-to-br from-white to-green-50 rounded-3xl shadow-md hover:shadow-2xl overflow-hidden transition duration-300 h-full">
                <div className="h-24 bg-gradient-to-r from-green-500 via-blue-500 to-purple-600" />

                <div className="p-4 text-center">
                  <div className="w-20 h-20 rounded-full bg-gray-200 mx-auto -mt-14 border-4 border-white overflow-hidden shadow-lg">
                    <img
                      src={vendor.storeLogo || "/user.png"}
                      alt=""
                      onError={(e) => {
                        e.currentTarget.src = "/user.png";
                      }}
                      className="w-full h-full object-cover"
                    />
                  </div>

                  <h3 className="mt-3 font-bold text-base md:text-lg line-clamp-1">
                    {vendor.storeName || vendor.businessName || "Store"}
                  </h3>

                  <p className="text-xs text-gray-400 mt-1">
                    📍 {vendor.city || "India"}
                  </p>

                  <p className="text-yellow-500 font-semibold text-sm mt-1">
                    {vendor.rating ? `⭐ ${vendor.rating}` : "✨ New Seller"}
                  </p>

                  <button className="mt-4 w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-3 rounded-xl font-semibold hover:from-green-500 hover:to-blue-500 transition">
                    Visit Store
                  </button>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
