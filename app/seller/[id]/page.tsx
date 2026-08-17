"use client";

import { useEffect, useState } from "react";

import {
  collection,
  getDocs,
  query,
  where,
  doc,
  getDoc,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog";

// "Men Fashion"/"Women Fashion" are display-only labels; the catalog tree
// itself just has "Men"/"Women" nested under "Fashion".
const CATEGORY_NAME_ALIASES: Record<string, string> = {
  "Men Fashion": "Men",
  "Women Fashion": "Women",
};

function resolveCategoryNode(displayName: string) {
  return findNodeByName(CATEGORY_NAME_ALIASES[displayName] || displayName);
}

import { useParams } from "next/navigation";
import Link from "next/link";

export default function SellerStorePage() {

  const { id } = useParams();

  const [seller, setSeller] = useState<any>(null);

  const [products, setProducts] = useState<any[]>([]);

  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

const [category, setCategory] = useState("All");
  useEffect(() => {
    
  }, [seller]);

  useEffect(() => {

    if (!id) return;

    async function loadSeller() {

      try {

        // Public-safe vendor mirror (vendors/ itself holds banking/KYC PII
        // and is locked to owner/admin only)
        const vendorDoc = await getDoc(doc(db, "vendors_public", String(id)));

        if (vendorDoc.exists()) {
          setSeller(vendorDoc.data());
        }

        const productQuery = query(
          collection(db, "products"),
          where("vendorId", "==", id)
        );

        const productSnap = await getDocs(productQuery);

        const items: any[] = [];

        productSnap.forEach((docSnap) => {

          items.push(toLegacyProduct(docSnap.id, docSnap.data()));

        });

        setProducts(items);

      } catch (error) {

        console.error(error);

      } finally {

        setLoading(false);

      }

    }

    loadSeller();

  }, [id]);

  if (loading) {

    return (
      <div className="min-h-screen flex items-center justify-center">
        Loading Seller...
      </div>
    );
  }

  
if (!seller) {

  return (
    <div className="min-h-screen flex items-center justify-center">
      Seller not found.
    </div>
  );

}
  return (
    <section className="min-h-screen bg-gray-50 py-10">

      <div className="max-w-7xl mx-auto px-5">

       <div className="rounded-3xl overflow-hidden shadow-lg mb-8 bg-white">

  {/* Store Banner */}
  <div className="relative h-64 bg-gradient-to-r from-green-600 via-blue-600 to-indigo-600">

    {seller.storeBanner && (

      <img
        src={seller.storeBanner}
        alt="Store Banner"
        className="w-full h-full object-cover"
      />

    )}

  </div>

  <div className="px-8 pb-8">

    <div className="-mt-16 flex flex-col md:flex-row md:items-end md:justify-between gap-6">

      <div className="flex items-end gap-6">

        <img
          src={seller.storeLogo || "/logo.png"}
          alt={seller.businessName}
          className="w-32 h-32 rounded-full border-4 border-white bg-white object-cover shadow-lg"
        />

        <div>

          <h1 className="text-4xl font-bold">
            {seller.businessName}
          </h1>

          <p className="text-gray-500 mt-2">
            👤 {seller.fullName}
          </p>

          <p className="text-gray-500">
            📍 {seller.city}, {seller.state}
          </p>

          <p className="text-yellow-600 font-semibold mt-2">
            ⭐ {seller.rating || 0} Seller Rating
          </p>

        </div>

      </div>

      <div className="text-right">

        <p className="text-gray-500">
          Vendor Status
        </p>

        <span className="inline-block mt-2 bg-green-100 text-green-700 px-4 py-2 rounded-full font-semibold">

          {seller.status}

        </span>

      </div>

    </div>

  </div>

</div>
<div className="bg-white rounded-2xl shadow-md p-6 mt-8">
  <h2 className="text-2xl font-bold mb-4">
    Store Information
  </h2>

  <div className="space-y-3 text-gray-700">
    <p>
      🏪 <strong>Store Name:</strong> {seller.businessName}
    </p>

    <p>
      📂 <strong>Business Type:</strong> {seller.businessType || "General Store"}
    </p>

    <p>
      🌍 <strong>City:</strong> {seller.city}
    </p>

    <p>
      🗺️ <strong>State:</strong> {seller.state}
    </p>
  </div>
</div>
<div className="grid grid-cols-2 md:grid-cols-4 gap-5 mb-8">

 <div className="bg-white rounded-2xl shadow p-6 text-center">

  <h2 className="text-3xl font-bold text-blue-600">
    {products.length}
  </h2>

  <p className="text-gray-600 mt-2">
    Products Available
  </p>

</div>
  <div className="bg-white rounded-2xl shadow p-5">

    <p className="text-gray-500 text-sm">
      Orders
    </p>

    <h2 className="text-3xl font-bold text-green-600">
      {seller.totalOrders || 0}
    </h2>

  </div>

  <div className="bg-white rounded-2xl shadow p-5">

    <p className="text-gray-500 text-sm">
      Sales
    </p>

    <h2 className="text-3xl font-bold text-orange-600">
      {seller.totalSales || 0}
    </h2>

  </div>

  <div className="bg-white rounded-2xl shadow p-5">

    <p className="text-gray-500 text-sm">
      Revenue
    </p>

    <h2 className="text-3xl font-bold text-purple-600">
      ₹{(seller.totalRevenue || 0).toLocaleString("en-IN")}
    </h2>

  </div>

</div>

        <h2 className="text-3xl font-bold mb-6">
          Products
        </h2>

        <div className="bg-white rounded-2xl shadow p-5 mb-6">

  <div className="flex flex-col md:flex-row gap-4">

    <input
      type="text"
      placeholder="Search products..."
      value={search}
      onChange={(e) => setSearch(e.target.value)}
      className="flex-1 border rounded-xl p-3"
    />

    <select
      value={category}
      onChange={(e) => setCategory(e.target.value)}
      className="border rounded-xl p-3"
    >
      <option>All</option>
      <option>Grocery</option>
      <option>Electronics</option>
      <option>Mobiles</option>
      <option>Beauty</option>
      <option>Furniture</option>
      <option>Books</option>
      <option>Men Fashion</option>
      <option>Women Fashion</option>
      <option>Kids Fashion</option>
    </select>

  </div>

</div>
<div className="bg-white rounded-2xl shadow-md p-6 mt-8">
  <h2 className="text-2xl font-bold mb-4">About Seller</h2>

  <div className="space-y-3 text-gray-700">
    <p>
      <strong>Business Name:</strong> {seller.businessName}
    </p>

    <p>
      <strong>Owner:</strong> {seller.fullName}
    </p>

    <p>
      <strong>Location:</strong> {seller.city}, {seller.state}
    </p>

    <p>
      <strong>Member Since:</strong>{" "}
      {seller.createdAt?.toDate?.().toLocaleDateString() || "N/A"}
    </p>

    <p>
      <strong>Status:</strong> {seller.status}
    </p>
  </div>
</div>
<div className="bg-white rounded-2xl shadow-md p-6 mt-8">
  <h2 className="text-2xl font-bold mb-4">
    Contact Seller
  </h2>

  <div className="space-y-3 text-gray-700">
    <p>
      📧 <strong>Email:</strong> {seller.email}
    </p>

    <p>
      📞 <strong>Phone:</strong> {seller.businessPhone}
    </p>

    <p>
      📍 <strong>Location:</strong> {seller.city}, {seller.state}
    </p>
  </div>
</div>
<div className="bg-white rounded-2xl shadow-md p-6 mt-8">
  <h2 className="text-2xl font-bold mb-4">
    Store Policies
  </h2>

  <div className="space-y-3 text-gray-700">

    <p>✅ Genuine & quality products</p>

    <p>🚚 Fast and secure shipping</p>

    <p>🔄 Easy return according to YOMICO policy</p>

    <p>📞 Customer support available</p>

    <p>🔒 Safe and secure payments</p>

  </div>
</div>
        {products.length === 0 ? (

          <div className="bg-white rounded-3xl p-10 text-center">

            No products available.

          </div>

        ) : (

         <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">

  {products
    .filter((product) => {

      const matchesSearch =
        product.name
          ?.toLowerCase()
          .includes(search.toLowerCase());

      const categoryNode =
        category === "All" ? null : resolveCategoryNode(category);

      const matchesCategory =
        category === "All" ||
        (categoryNode &&
          (isTopLevelCategory(categoryNode)
            ? product.categoryId === categoryNode.id
            : product.subCategoryId === categoryNode.id ||
              product.leafCategoryId === categoryNode.id));

      return matchesSearch && matchesCategory;

    })
    .map((product) => (

      <Link
  key={product.id}
  href={`/product/${product.id}`}
  className="bg-white rounded-2xl shadow hover:shadow-lg transition overflow-hidden"
>

        <img
          src={product.image}
          alt={product.name}
          className="w-full h-56 object-cover"
        />

        <div className="p-4">

          <h3 className="font-bold line-clamp-2">
            {product.name}
          </h3>

          <p className="text-green-700 font-bold mt-2">
            ₹{product.price?.toLocaleString("en-IN")}
          </p>
          <p className="text-sm text-gray-500 mt-1">
  {product.category}
</p>

<div className="flex items-center justify-between flex-wrap gap-x-2 gap-y-1 mt-4">

  <span className="text-yellow-500">
    ⭐⭐⭐⭐⭐
  </span>

  <span className="text-blue-600 font-semibold">
    View Product →
  </span>

</div>

        </div>

     </Link>

    ))}

</div>

        )}

      </div>

    </section>

  );

}