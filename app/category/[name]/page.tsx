"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "@/components/ProductCard";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog/categoryUtils";
import { toLegacyProduct, isStorefrontVisible } from "@/lib/products/legacyDisplay";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  brand?: string;
  rating?: number;
  createdAt?: any;
  vendorId?: string;
};

export default function CategoryPage() {
  const params = useParams();
  const name = decodeURIComponent((params.name as string) || "");

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("default");
  const [priceFilter, setPriceFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);
      try {
        // categoryId/subCategoryId on product docs are the catalog node's
        // internal codes (e.g. "FASHION", "FASHION_MEN"), not display
        // names — resolve the URL's display name back to the right node
        // and field first. Supports both top-level categories (Fashion)
        // and sub-categories (Men, Women).
        const matchedNode = findNodeByName(name);
        const items: Product[] = [];

        if (matchedNode) {
          const snapshot = await getDocs(
            query(
              collection(db, "products"),
              isTopLevelCategory(matchedNode)
                ? where("categoryId", "==", matchedNode.id)
                : where("subCategoryId", "==", matchedNode.id)
            )
          );
          snapshot.forEach((docSnap) => {
            // Admin-blocked products must not appear on the storefront.
            if (!isStorefrontVisible(docSnap.data())) return;
            const legacy = toLegacyProduct(docSnap.id, docSnap.data());
            items.push({
              id: legacy.id,
              name: legacy.name,
              price: legacy.price,
              image: legacy.image,
              stock: legacy.stock,
              brand: legacy.brand || "Other",
              rating: Number((docSnap.data() as any).rating || 0),
              createdAt: (docSnap.data() as any).createdAt,
              vendorId: legacy.vendorId,
            });
          });
        }
        // unknown category name (matchedNode is null) -> items stays empty

        setProducts(items);
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }

    if (name) loadProducts();
  }, [name]);

  const resetFilters = () => {
    setPriceFilter("all");
    setBrandFilter("all");
    setRatingFilter("all");
    setSortBy("default");
  };

  const brands = [
    "all",
    ...Array.from(new Set(products.map((p) => p.brand || "Other").filter(Boolean))),
  ];

  const filteredProducts = products.filter((product) => {
    const matchesPrice = (() => {
      switch (priceFilter) {
        case "0-500":
          return product.price <= 500;
        case "500-1000":
          return product.price > 500 && product.price <= 1000;
        case "1000-5000":
          return product.price > 1000 && product.price <= 5000;
        case "5000+":
          return product.price > 5000;
        default:
          return true;
      }
    })();

    const matchesBrand =
      brandFilter === "all" || (product.brand || "Other") === brandFilter;

    const matchesRating =
      ratingFilter === "all" || (product.rating ?? 0) >= Number(ratingFilter);

    return matchesPrice && matchesBrand && matchesRating;
  });

  const sortedProducts = [...filteredProducts];
  switch (sortBy) {
    case "low":
      sortedProducts.sort((a, b) => a.price - b.price);
      break;
    case "high":
      sortedProducts.sort((a, b) => b.price - a.price);
      break;
    case "new":
      sortedProducts.sort(
        (a, b) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0)
      );
      break;
    default:
      break;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading Products...
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 p-6 md:p-10">
      <div className="max-w-7xl mx-auto">
        {/* HEADER */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-8 md:p-10 mb-8">
          <h1 className="text-4xl md:text-5xl font-bold capitalize">{name}</h1>
          <p className="mt-3 text-green-100 text-lg">
            Discover the best {name.toLowerCase()} products at great prices.
          </p>
          <div className="mt-5 inline-flex bg-white/20 px-4 py-2 rounded-full text-sm font-semibold">
            {products.length} Products Available
          </div>
        </div>

        {/* TOOLBAR */}
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-8">
          <p className="text-gray-600 font-medium">
            Showing {sortedProducts.length} products
          </p>

          <div className="flex flex-wrap gap-3">
            <select
              value={priceFilter}
              onChange={(e) => setPriceFilter(e.target.value)}
              className="border rounded-xl px-4 py-2 bg-white"
            >
              <option value="all">All Prices</option>
              <option value="0-500">₹0 - ₹500</option>
              <option value="500-1000">₹500 - ₹1000</option>
              <option value="1000-5000">₹1000 - ₹5000</option>
              <option value="5000+">₹5000+</option>
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="border rounded-xl px-4 py-2 bg-white"
            >
              <option value="default">Default</option>
              <option value="low">Price: Low to High</option>
              <option value="high">Price: High to Low</option>
              <option value="new">Newest First</option>
            </select>

            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="border rounded-xl px-4 py-2 bg-white"
            >
              {brands.map((brand) => (
                <option key={brand} value={brand}>
                  {brand === "all" ? "All Brands" : brand}
                </option>
              ))}
            </select>

            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              className="border rounded-xl px-4 py-2 bg-white"
            >
              <option value="all">All Ratings</option>
              <option value="4">★★★★☆ &amp; Up</option>
              <option value="3">★★★☆☆ &amp; Up</option>
              <option value="2">★★☆☆☆ &amp; Up</option>
            </select>

            <button
              onClick={resetFilters}
              className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-xl font-medium transition"
            >
              Clear Filters
            </button>
          </div>
        </div>

        {/* RESULTS */}
        {sortedProducts.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-12 text-center border">
            <div className="text-6xl mb-5">📦</div>
            <h2 className="text-3xl font-bold mb-3">No Products Found</h2>
            <p className="text-gray-500 mb-6">
              {products.length === 0
                ? "No products available in this category yet."
                : "Try changing your filters."}
            </p>
            {products.length > 0 && (
              <button
                onClick={resetFilters}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold"
              >
                Reset Filters
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-5">
            {sortedProducts.map((product) => (
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
    </main>
  );
}
