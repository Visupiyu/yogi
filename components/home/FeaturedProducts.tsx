"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import { collection, getDocs, limit, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  vendorId?: string;
};

export default function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  // Tracked separately from an empty result — a genuinely empty
  // (successful) fetch and a failed one used to look identical to the
  // customer ("No Featured Products Found" either way), with no way to
  // tell them apart or retry a real failure.
  const [error, setError] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      // Wasn't actually filtering by `featured` at all before — just
      // "first 8 products in Firestore's default order," regardless of
      // curation. Paired with a real admin toggle in app/admin/products
      // to set the flag (it always defaulted false with no way to
      // change it).
      const q = query(
        collection(db, "products"),
        where("featured", "==", true),
        limit(8)
      );
      const snapshot = await getDocs(q);

      const items: Product[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
          id: doc.id,
          name: data.shortTitle || data.title || data.name || "",
        price: Number(
  data.sellingPrice ??
  data.price ??
  0
),

image:
  data.thumbnail ||
  data.images?.[0] ||
  data.image ||
  "",
          stock: Number(data.stock || 0),
          vendorId: data.vendorId,
        });
      });

      setProducts(items);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return (
    <section className="py-2 px-2">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-2xl md:text-2xl font-bold">
            Featured Products
          </h2>
          <Link
            href="/search"
            className="text-green-600 font-semibold text-sm hover:underline"
          >
            View All →
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {[...Array(8)].map((_, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl overflow-hidden shadow-sm animate-pulse"
              >
                <div className="h-40 bg-gray-200" />
                <div className="p-3 space-y-2">
                  <div className="h-3 bg-gray-200 rounded w-3/4" />
                  <div className="h-3 bg-gray-200 rounded w-1/2" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="text-center py-10 bg-red-50 rounded-2xl border border-red-200">
            <p className="text-red-600 font-semibold">
              Unable to load featured products.
            </p>
            <button
              onClick={fetchProducts}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-xl font-semibold transition"
            >
              Retry
            </button>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            No Featured Products Found
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
            {products.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                price={product.price}
                image={product.image}
                stock={product.stock}
                vendorId={product.vendorId}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
