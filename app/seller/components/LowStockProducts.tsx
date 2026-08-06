"use client";

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

export default function LowStockProducts() {

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {

    const unsub = onAuthStateChanged(auth, async (user) => {

      if (!user) {
        setLoading(false);
        return;
      }

      try {

        const q = query(
          collection(db, "products"),
          where("vendorId", "==", user.uid)
        );

        const snapshot = await getDocs(q);

        const items: any[] = [];

        snapshot.forEach((docSnap) => {

          const product: any = {
  id: docSnap.id,
  ...docSnap.data(),
};

if ((product.stock ?? 0) <= 10) {
  items.push(product);
}

        });

        items.sort(
          (a, b) => (a.stock || 0) - (b.stock || 0)
        );

        setProducts(items);

      } catch (err) {

        console.error(err);

      } finally {

        setLoading(false);

      }

    });

    return () => unsub();

  }, []);
 return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        📦 Low Stock Products
      </h2>

      <Link
        href="/seller/inventory"
        className="text-blue-600 hover:underline"
      >
        Manage Inventory
      </Link>

    </div>

    {loading ? (

      <div className="py-10 text-center">
        Loading...
      </div>

    ) : products.length === 0 ? (

      <div className="py-10 text-center text-green-600 font-medium">
        🎉 All products have sufficient stock.
      </div>

    ) : (

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead>

            <tr className="border-b">

              <th className="p-3 text-left">
                Product
              </th>

              <th className="p-3 text-left">
                Stock
              </th>

              <th className="p-3 text-left">
                Status
              </th>

            </tr>

          </thead>

          <tbody>

            {products.map((product) => (

              <tr
                key={product.id}
                className="border-b hover:bg-gray-50"
              >

                <td className="p-3">
                  {product.name}
                </td>

                <td className="p-3 font-bold">
                  {product.stock}
                </td>

                <td className="p-3">

                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                    Low Stock
                  </span>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    )}

  </div>
);
}