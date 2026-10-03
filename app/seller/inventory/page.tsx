"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

import {
  collection,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { onAuthStateChanged } from "firebase/auth";

import { auth, db } from "@/lib/firebase";

import LoadErrorState from "@/components/LoadErrorState";

import type { Product } from "@/lib/products/product";
import ProductImage from "@/components/ProductImage";

export default function SellerInventoryPage() {
const [products, setProducts] = useState<Product[]>([]);
const [loading, setLoading] = useState(true);
const [search, setSearch] = useState("");
const [loadError, setLoadError] = useState<string | null>(null);

const loadProducts = useCallback(async (uid: string) => {
  setLoading(true);
  setLoadError(null);
  try {
    const q = query(
      collection(db, "products"),
      where("vendorId", "==", uid)
    );
    const snapshot = await getDocs(q);
    const list = snapshot.docs.map((doc) => ({
      ...doc.data(),
      id: doc.id,
    })) as Product[];
    setProducts(list);
  } catch (err) {
    console.error("Failed to load seller inventory:", err);
    setLoadError("We couldn't load your inventory. Please check your connection and try again.");
  } finally {
    setLoading(false);
  }
}, []);

useEffect(() => {
  const unsubscribe = onAuthStateChanged(auth, (user) => {
    if (!user) {
      // The seller layout owns the signed-out redirect.
      setLoading(false);
      return;
    }
    loadProducts(user.uid);
  });
  return () => unsubscribe();
}, [loadProducts]);

return (

  <div className="mx-auto max-w-7xl p-4 sm:p-6">

    <div className="mb-8 flex items-center justify-between">

      <div>

        <h1 className="text-3xl font-bold">
          Inventory
        </h1>

        <p className="mt-2 text-gray-600">
          Total Products : {products.length}
        </p>

      </div>

      <Link
        href="/seller/products/add"
        className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
      >
        + Add Product
      </Link>

    </div>

    <input
      type="text"
      placeholder="Search products..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="mb-6 w-full rounded-lg border p-3"
    />

    {loadError ? (
      <LoadErrorState
        message={loadError}
        onRetry={() => {
          if (auth.currentUser) loadProducts(auth.currentUser.uid);
        }}
      />
    ) : (
    <div className="overflow-hidden rounded-xl border bg-white shadow">
      <div className="overflow-x-auto">

      <table className="w-full min-w-[640px]">

        <thead className="bg-gray-100">

          <tr>

            <th className="p-4 text-left">Image</th>
            <th className="p-4 text-left">Product</th>
            <th className="p-4 text-left">Stock</th>
            <th className="p-4 text-left">Status</th>
            <th className="p-4 text-center">Action</th>

          </tr>

        </thead>

        <tbody>

          {loading ? (

            <tr>

              <td
                colSpan={5}
                className="p-10 text-center"
              >
                Loading...
              </td>

            </tr>

          ) : (

            products
             .filter((product) =>
  (product.title ?? "")
    .toLowerCase()
    .includes(search.toLowerCase())
)
              .map((product) => (

                <tr
                  key={product.id}
                  className="border-t"
                >

                  <td className="p-4">

                    <ProductImage
                      src={product}
                      alt={product.title}
                      className="h-16 w-16 rounded object-cover"
                    />

                  </td>

                  <td className="p-4">

                    {product.title}

                  </td>

                  <td className="p-4">

                    <span
                      className={
                        product.stock <= 5
                          ? "font-bold text-red-600"
                          : product.stock <= 20
                          ? "font-bold text-orange-600"
                          : "font-bold text-green-600"
                      }
                    >
                      {product.stock}
                    </span>

                  </td>

                  <td className="p-4">

                    {product.stock === 0 ? (

                      <span className="rounded-full bg-red-100 px-3 py-1 text-red-700">

                        Out of Stock

                      </span>

                    ) : product.stock <= 5 ? (

                      <span className="rounded-full bg-orange-100 px-3 py-1 text-orange-700">

                        Low Stock

                      </span>

                    ) : (

                      <span className="rounded-full bg-green-100 px-3 py-1 text-green-700">

                        In Stock

                      </span>

                    )}

                  </td>

                  <td className="p-4 text-center">

                    <Link
                      href={`/seller/products/edit/${product.id}`}
                      className="rounded bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                    >
                      Update
                    </Link>

                  </td>

                </tr>

              ))

          )}

        </tbody>

      </table>
      </div>

    </div>
    )}

  </div>
);

}