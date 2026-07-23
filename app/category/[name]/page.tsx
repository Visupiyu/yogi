"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "@/components/ProductCard";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
   brand?: string;
  rating?: number;
createdAt?: any;
};

export default function CategoryPage() {

  const params = useParams();

  const name = decodeURIComponent(params.name as string);
  const [products, setProducts] = useState<Product[]>([]);
  const [category, setCategory] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("default");
  const [priceFilter, setPriceFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [ratingFilter, setRatingFilter] = useState("all");

  useEffect(() => {
    async function loadProducts() {
      setLoading(true);

     setCategory(name);

      const q = query(
  collection(db, "products"),
  where("category", "==", name),
  );

      const snapshot = await getDocs(q);
      const items: Product[] = [];

      snapshot.forEach((doc) => {
        const data = doc.data();
        items.push({
  id: doc.id,
  name: data.name,
  price: Number(data.price),
  image: data.image,
  stock: Number(data.stock),
    brand: data.brand || "Other",
      rating: Number(data.rating || 0),
  createdAt: data.createdAt,
});
      });

      setProducts(items);
      setLoading(false);
    }

    loadProducts();
   }, [name]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading Products...
      </div>
    );
  }
  const brands = [
  "all",
  ...Array.from(
    new Set(
      products
        .map((p) => p.brand || "Other")
        .filter(Boolean)
    )
  ),
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
    brandFilter === "all" ||
    (product.brand || "Other") === brandFilter;

    const matchesRating =
  ratingFilter === "all" ||
  (product.rating ?? 0) >= Number(ratingFilter);

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
    sortedProducts.sort((a, b) => {
      const aTime = a.createdAt?.seconds ?? 0;
      const bTime = b.createdAt?.seconds ?? 0;
      return bTime - aTime;
    });
    break;

  default:
    break;
}

  return (
    <main className="min-h-screen bg-gray-100 p-10">
      <div className="max-w-7xl mx-auto">
       <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl text-white p-10 mb-8">

  <h1 className="text-4xl md:text-5xl font-bold capitalize">
    {category}
  </h1>

  <p className="mt-3 text-green-100 text-lg">
    Discover the best {category.toLowerCase()} products at great prices.
  </p>

  <div className="mt-5 inline-flex bg-white/20 px-4 py-2 rounded-full text-sm font-semibold">
    {products.length} Products Available
  </div>

</div>
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
  <option value="4">★★★★☆ & Up</option>
  <option value="3">★★★☆☆ & Up</option>
  <option value="2">★★☆☆☆ & Up</option>
</select>
<button
  onClick={() => {
    setPriceFilter("all");
    setBrandFilter("all");
    setRatingFilter("all");
    setSortBy("default");
  }}
  className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-xl font-medium transition"
>
  Clear Filters
</button>

  </div>

</div>

        {products.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-10 text-center">
            <div className="bg-white rounded-3xl shadow-md p-12 text-center border">

  <div className="text-6xl mb-5">
    📦
  </div>

  <h2 className="text-3xl font-bold mb-3">
    No Products Found
  </h2>

  <p className="text-gray-500 mb-6">
    Try changing your filters or check back later for new products.
  </p>

  <button
    onClick={() => {
      setPriceFilter("all");
      setBrandFilter("all");
      setRatingFilter("all");
      setSortBy("default");
    }}
    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-semibold"
  >
    Reset Filters
  </button>

</div>
            <p className="text-gray-500">
              No products available in this category.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-8">
            {sortedProducts.map((product) => (
              <ProductCard
                key={product.id}
                id={product.id}
                name={product.name}
                price={product.price}
                image={product.image}
                stock={product.stock}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
