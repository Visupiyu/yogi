"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import ProductCard from "@/components/ProductCard";
import {
  FEATURED_LIMIT,
  fetchFeatured,
  shouldShowFeatured,
  type HomepageProduct,
} from "@/lib/storefront/homepageMerchandising";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  vendorId?: string;
  mrp?: number;
};

function toProduct(data: HomepageProduct): Product {
  return {
    id: data.id,
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
    mrp: typeof data.mrp === "number" ? data.mrp : undefined,
  };
}

// Admin-curated only — products an admin marked ★ Featured in
// app/admin/products. There is deliberately NO fallback: a "Featured" row
// filled from sales or views would just repeat Best Sellers under a label that
// implies curation. The whole section stays hidden until at least
// MIN_FEATURED_TO_SHOW visible products are featured
// (lib/storefront/homepageMerchandising.ts).
export default function FeaturedProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const fetchProducts = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const featured = await fetchFeatured();
      setProducts(
        shouldShowFeatured(featured)
          ? featured.slice(0, FEATURED_LIMIT).map(toProduct)
          : []
      );
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

  // Nothing is rendered while loading or when too few products are featured:
  // the section is usually hidden, so a skeleton would only flash and vanish.
  if (loading) return null;
  if (!error && products.length === 0) return null;

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

        {error ? (
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
                mrp={product.mrp}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
