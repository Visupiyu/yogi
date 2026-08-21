"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { motion } from "framer-motion";

export default function TopVendors() {
  const [vendors, setVendors] = useState([]);

  useEffect(() => {
    const fetchVendors = async () => {
      try {
        const snapshot = await getDocs(collection(db, "vendors_public"));
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

  if (vendors.length === 0) {
  return (
    <section className="py-4 md:py-6 text-center">
      <h2 className="text-2xl font-bold">No Vendors Found</h2>
    </section>
  );
}
  return (
    <section className="py-4 md:py-6 px-2 bg-gray-50">
        <div className="max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center md:justify-start mb-3 md:mb-8 gap-1 md:gap-8">

  <div>

    <span className="inline-block bg-green-100 text-green-700 px-4 py-1 rounded-full text-sm font-semibold mb-3">
      🏪 TRUSTED SELLERS
    </span>

   <h2 className="text-xl sm:text-2xl md:text-2xl font-bold text-gray-900">
      Top Vendors
    </h2>

    <p className="text-sm sm:text-base text-gray-600 mt-2">
      Shop from trusted sellers delivering quality products across India.
    </p>

  </div>

  <Link
    href="/store"
    className="inline-flex items-center justify-center bg-green-600 hover:bg-green-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-2xl text-sm sm:text-lg font-semibold shadow-xl transition-all hover:scale-105"
  >
    View All Sellers →
  </Link>

</div>

        <motion.div
  initial={{ opacity: 0, y: 30 }}
  whileInView={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.6 }}
  viewport={{ once: true }}
 className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-1"
>
          {vendors.map((vendor) => (
            <Link key={vendor.id} href={`/store/${vendor.id}`}>
              <div className="bg-gradient-to-br from-white to-green-50 rounded-3xl shadow-lg hover:shadow-2xl hover:-translate-y-2 overflow-hidden transition duration-300 h-full">
                <div className="h-24 bg-gradient-to-r from-green-500 via-blue-500 to-purple-600" />

                <div className="p-4 md:p-5 text-center">
                  <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-gray-200 mx-auto -mt-14 border-4 border-white overflow-hidden shadow-lg">
                    <img
                      src={vendor.storeLogo || "/user.png"}
                    alt={vendor.storeName || vendor.businessName || "Vendor Store"}
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
                  <div className="inline-block mt-3 bg-green-100 text-green-700 px-3 py-1 rounded-full text-xs font-semibold">
  ✔ Trusted Seller
</div>

  <div className="mt-4 w-full bg-gradient-to-r from-green-600 to-blue-600 text-white py-2 sm:py-3 rounded-2xl text-sm sm:text-base font-semibold text-center shadow-xl hover:from-green-500 hover:to-blue-500 transition-all hover:scale-105">
</div>
                </div>
              </div>
            </Link>
          ))}
  
     </motion.div>
       </div>
    </section>
  );
}
