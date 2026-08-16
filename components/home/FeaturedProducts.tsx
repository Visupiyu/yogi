"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  vendorId?: string;
};

const FEATURED_LIMIT = 8;
// Candidate pool for the fallback ranking below — bounded regardless of
// catalog size, and large enough to have real active/in-stock products
// left after filtering.
const FALLBACK_CANDIDATE_LIMIT = 30;

function toProduct(doc: any): Product {
  const data = doc.data();
  return {
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
  };
}

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
      // Admin-curated Featured products always take priority — set via
      // the real ★ Featured toggle in app/admin/products, untouched here.
      const featuredQuery = query(
        collection(db, "products"),
        where("featured", "==", true),
        limit(FEATURED_LIMIT)
      );
      const featuredSnapshot = await getDocs(featuredQuery);

      if (!featuredSnapshot.empty) {
        setProducts(featuredSnapshot.docs.map(toProduct));
        return;
      }

      // No product has ever been marked Featured yet — rather than show
      // an empty section, fall back to the best-performing active,
      // in-stock products. Single-field orderBy (same shape as
      // BestSellers.jsx's orderBy("sales","desc")) needs no new composite
      // index; the active/in-stock filter and the views/rating blend into
      // the ranking both happen client-side after the fetch instead, so
      // this stays compatible with the indexes already deployed. The
      // moment an admin marks a real product Featured, this whole branch
      // stops running.
      const fallbackQuery = query(
        collection(db, "products"),
        orderBy("sales", "desc"),
        limit(FALLBACK_CANDIDATE_LIMIT)
      );
      const fallbackSnapshot = await getDocs(fallbackQuery);

      const ranked = fallbackSnapshot.docs
        .filter((doc) => {
          const data = doc.data();
          return data.active !== false && Number(data.stock || 0) > 0;
        })
        .map((doc) => {
          const data = doc.data();
          const score =
            Number(data.sales || 0) * 3 +
            Number(data.views || 0) +
            Number(data.rating || 0) * 10;
          return { doc, score };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, FEATURED_LIMIT)
        .map(({ doc }) => toProduct(doc));

      setProducts(ranked);
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
