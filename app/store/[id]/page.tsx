"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "@/components/ProductCard";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";

export default function StorePage() {const params = useParams(); const router = useRouter();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorName, setVendorName] = useState("");
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalStock, setTotalStock] = useState(0);
  const [sortBy, setSortBy] = useState("default");
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [priceRange, setPriceRange] = useState("All");
  const [availability, setAvailability] = useState("All");
  const [following, setFollowing] = useState(false);

  useEffect(() => { const fetchStore = async () => {
      try {      
        const q = query(
          collection(db, "products"),
          where("vendorId", "==", params.id)
        );
        const snapshot = await getDocs(q);
        const items: any[] = [];
        snapshot.forEach((docSnap) => {
          items.push(toLegacyProduct(docSnap.id, docSnap.data()));
        });
        setProducts(items);

        // Public-safe vendor mirror (vendors/ itself holds banking/KYC PII
        // and is locked to owner/admin only)
        const vendorDoc = await getDoc(doc(db, "vendors_public", String(params.id)));
        const vendorData = vendorDoc.exists() ? vendorDoc.data() : null;
        if (vendorData) {
          setVendorInfo(vendorData);
        }

        setTotalProducts(items.length);
        setTotalStock(
          items.reduce((sum, item) => sum + (item.stock || 0), 0)
        );

        if (items.length > 0) {
          setVendorName(items[0].vendorName || "Vendor Store");
        } else if (vendorData) {
          setVendorName(vendorData.businessName || "Vendor Store");
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    };

    if (params?.id) {
      fetchStore();
    }
  }, [params]);

  if (loading) {
    return <div className="py-20 text-center">Loading store...</div>;
  }
  const categories = [
  "All",
  ...new Set(
    products
      .map((product: any) => product.category)
      .filter(Boolean)
  ),
];

 const filteredProducts = [...products]
  .filter((product) => {
    const matchesSearch = (product.name || "")
      .toLowerCase()
      .includes(search.trim().toLowerCase());

    const matchesCategory =
      selectedCategory === "All" ||
      product.category === selectedCategory;

    const price = Number(product.price || 0);

    const matchesPrice =
      priceRange === "All" ||
      (priceRange === "0-500" && price >= 0 && price <= 500) ||
      (priceRange === "500-1000" && price > 500 && price <= 1000) ||
      (priceRange === "1000-5000" && price > 1000 && price <= 5000) ||
      (priceRange === "5000+" && price > 5000);

      const stock = Number(product.stock || 0);

      const matchesAvailability =
  availability === "All" ||
  (availability === "In Stock" && stock > 0) ||
  (availability === "Low Stock" && stock > 0 && stock < 10) ||
  (availability === "Out of Stock" && stock === 0);

    return (
      matchesSearch &&
      matchesCategory &&
      matchesPrice &&
      matchesAvailability
    );
  })
  .sort((a, b) => {
    switch (sortBy) {
      case "priceLow":
        return (a.price || 0) - (b.price || 0);

      case "priceHigh":
        return (b.price || 0) - (a.price || 0);

      case "nameAZ":
        return (a.name || "").localeCompare(b.name || "");

      case "nameZA":
        return (b.name || "").localeCompare(a.name || "");

      case "stock":
        return (b.stock || 0) - (a.stock || 0);

      default:
        return 0;
    }
  });
  const handleShareStore = async () => {
  const shareData = {
    title: vendorName,
    text: `Check out ${vendorName} on YOMICO!`,
    url: window.location.href,
  };

  try {
    if (navigator.share) {
      await navigator.share(shareData);
    } else {
      await navigator.clipboard.writeText(window.location.href);
      alert("Store link copied to clipboard!");
    }
  } catch (error) {
    console.error("Share cancelled:", error);
  }
};
   return (
    <section className="py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <button
  onClick={() => {
    if (window.history.length > 1) {
      router.back();
    } else {
      router.push("/stores");
    }
  }}
  className="
    inline-flex
    items-center
    gap-2
    mb-6
    bg-white
    border
    border-gray-300
    hover:bg-green-50
    hover:border-green-500
    text-gray-700
    hover:text-green-700
    px-5
    py-3
    rounded-xl
    shadow-sm
    transition
  "
>
  ← Back
</button>

        {/* STORE HEADER */}
        <div className="bg-gradient-to-r from-green-600 via-green-500 to-blue-600 rounded-[32px] p-8 md:p-14 text-white mb-10 shadow-xl">
          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="w-24 h-24 rounded-full bg-white overflow-hidden border-4 border-white shadow-lg shrink-0">
              <img
                src={vendorInfo?.storeLogo || "/user.png"}
                alt="Vendor Logo"
                className="w-full h-full object-cover"
              />
            </div>

            <div>
              <p className="uppercase tracking-widest text-sm opacity-80">
                Verified Seller
              </p>
             <h1 className="text-4xl md:text-6xl font-extrabold mt-2">
                {vendorName}
              </h1>
              <p className="mt-3 opacity-90">
                Trusted marketplace seller serving customers across India
              </p>
              <p className="mt-3 text-white/90">
              Premium quality products with fast shipping and trusted customer service.
             </p>
            </div>
          </div>

          {vendorInfo && (
            <div className="mt-6 space-y-1">
              <p>👤 {vendorInfo.fullName}</p>
              <p>✅ Verified Marketplace Seller</p>
              <p>📞 {vendorInfo.businessPhone}</p>
              <p>
                📍 {vendorInfo.city}, {vendorInfo.state}
              </p>
            </div>
          )}
<div className="flex flex-wrap gap-3 mt-8">

 <button
  onClick={() => setFollowing(!following)}
  className={`
    px-6
    py-3
    rounded-xl
    font-semibold
    shadow
    transition

    ${
      following
        ? "bg-green-700 text-white"
        : "bg-white text-green-700 hover:bg-gray-100"
    }
  `}
>
  {following ? "✅ Following" : "❤️ Follow Store"}
</button>

  <button
  onClick={handleShareStore}
  className="
    bg-white/20
    hover:bg-white/30
    border
    border-white/40
    text-white
    px-6
    py-3
    rounded-xl
    font-semibold
  "
>
  📤 Share Store
</button>

  <button
    className="
      bg-yellow-400
      hover:bg-yellow-300
      text-black
      px-6
      py-3
      rounded-xl
      font-semibold
    "
  >
    ⭐ Write Review
  </button>

</div>
          <div className="flex flex-wrap gap-3 mt-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-8">
<div className="bg-white/15 rounded-2xl p-4 text-center">
🚚
<p className="mt-2">
Fast Delivery
</p>
</div>
<div className="bg-white/15 rounded-2xl p-4 text-center">
🛡
<p className="mt-2">
Buyer Protection
</p>
</div>
<div className="bg-white/15 rounded-2xl p-4 text-center">
⭐
<p className="mt-2">
Top Rated
</p>
</div>
<div className="bg-white/15 rounded-2xl p-4 text-center">
🔒
<p className="mt-2">
Secure Shopping
</p>
</div>
</div>
<div className="mb-8">

  <h2 className="text-2xl font-bold mb-4">
    Shop by Category
  </h2>

  <div className="flex flex-wrap gap-3">

    {[...new Set(products.map((p: any) => p.category).filter(Boolean))].map(
      (category: any) => (
        <span
          key={category}
          className="
            px-5
            py-2
            rounded-full
            bg-green-100
            text-green-700
            font-medium
          "
        >
          {category}
        </span>
      )
    )}
</div>

</div>

            <span className="bg-white/20 px-4 py-2 rounded-full text-sm">
              ✅ Verified Store
            </span>
            <span className="bg-white/20 px-4 py-2 rounded-full text-sm">
              🚚 Fast Delivery
            </span>
            <span className="bg-white/20 px-4 py-2 rounded-full text-sm">
              🔒 Secure Seller
            </span>
          </div>

          <div className="flex flex-wrap gap-4 mt-6">
            <div className="bg-white/20 backdrop-blur rounded-3xl p-5 min-w-[140px] text-center shadow-lg">
              <p>Products</p>
              <h3 className="text-3xl font-bold">{totalProducts}</h3>
            </div>

            <div className="bg-white/20 backdrop-blur rounded-3xl p-5 min-w-[140px] text-center shadow-lg">
              <p>Stock</p>
              <h3 className="text-3xl font-bold">{totalStock}</h3>
            </div>

            {vendorInfo?.rating ? (
              <div className="bg-white/20 backdrop-blur rounded-3xl p-5 min-w-[140px] text-center shadow-lg">
                <p>Rating</p>
                <h3 className="text-3xl font-bold">{vendorInfo.rating}⭐</h3>
              </div>
            ) : null}
          </div>
        </div>
        {/* STORE COUPONS */}

<div className="mb-12">

  <h2 className="text-3xl font-bold mb-6">
    🎁 Store Coupons
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

    <div className="rounded-3xl border-2 border-dashed border-green-500 bg-green-50 p-6">

      <h3 className="text-2xl font-bold text-green-700">
        SAVE10
      </h3>

      <p className="mt-2 text-gray-600">
        Get 10% OFF on orders above ₹999
      </p>

      <button className="mt-5 bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-xl">
        Copy Code
      </button>

    </div>

    <div className="rounded-3xl border-2 border-dashed border-blue-500 bg-blue-50 p-6">

      <h3 className="text-2xl font-bold text-blue-700">
        FREESHIP
      </h3>

      <p className="mt-2 text-gray-600">
        Free Delivery on selected products
      </p>

      <button className="mt-5 bg-blue-600 hover:bg-blue-700 text-white px-5 py-2 rounded-xl">
        Copy Code
      </button>

    </div>

    <div className="rounded-3xl border-2 border-dashed border-purple-500 bg-purple-50 p-6">

      <h3 className="text-2xl font-bold text-purple-700">
        BUYMORE
      </h3>

      <p className="mt-2 text-gray-600">
        ₹500 OFF on orders above ₹5000
      </p>

      <button className="mt-5 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2 rounded-xl">
        Copy Code
      </button>

    </div>

  </div>

</div>
        {/* FEATURED PRODUCTS */}

<div className="mb-12">

  <div className="flex items-center justify-between mb-6">

    <h2 className="text-3xl font-bold">
      🔥 Featured Products
    </h2>

    <span className="text-green-600 font-semibold">
      Seller's Top Picks
    </span>

  </div>

  {products.length === 0 ? (

    <div className="bg-white rounded-2xl p-8 text-center shadow">
      No featured products available.
    </div>

  ) : (

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

      {products
        .slice(0, 4)
        .map((product) => (

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

{/* NEW ARRIVALS */}

<div className="mb-12">

  <div className="flex items-center justify-between mb-6">

    <h2 className="text-3xl font-bold">
      🆕 New Arrivals
    </h2>

    <span className="text-blue-600 font-semibold">
      Latest Products
    </span>

  </div>

  {products.length === 0 ? (

    <div className="bg-white rounded-2xl shadow p-8 text-center">
      No new arrivals available.
    </div>

  ) : (

    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

      {[...products]
        .sort((a: any, b: any) => {
          const aTime = a.createdAt?.seconds || 0;
          const bTime = b.createdAt?.seconds || 0;
          return bTime - aTime;
        })
        .slice(0, 4)
        .map((product: any) => (

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

        {/* STORE SEARCH */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="🔍 Search products in this store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-3xl p-5 shadow-lg outline-none focus:ring-2 focus:ring-green-500"
          />
          <p className="text-gray-600 mt-3">
           📦 Showing {filteredProducts.length} Products
          </p>
        </div>

        <div className="mb-8">

  <h2 className="text-2xl font-bold mb-4">
    🛍 Shop by Category
  </h2>

  <div className="flex flex-wrap gap-3">

    {[...new Set(products.map((p: any) => p.category).filter(Boolean))].map(
      (category: any) => (
        <span
          key={category}
          className="
            px-5
            py-2
            rounded-full
            bg-green-100
            text-green-700
            font-medium
            border
            border-green-200
          "
        >
          {category}
        </span>
      )
    )}

  </div>
  <div className="flex justify-end mb-6">

  <select
    value={sortBy}
    onChange={(e) => setSortBy(e.target.value)}
    className="border rounded-xl px-4 py-3 shadow-sm focus:ring-2 focus:ring-green-500"
  >
    <option value="default">Sort By</option>
    <option value="priceLow">Price: Low to High</option>
    <option value="priceHigh">Price: High to Low</option>
    <option value="nameAZ">Name: A - Z</option>
    <option value="nameZA">Name: Z - A</option>
    <option value="stock">Stock Available</option>
  </select>

</div>
<select
  value={selectedCategory}
  onChange={(e) => setSelectedCategory(e.target.value)}
  className="border rounded-xl px-4 py-3 shadow-sm focus:ring-2 focus:ring-green-500"
>
  {categories.map((category) => (
    <option key={category} value={category}>
      {category}
    </option>
  ))}
</select>
<select
  value={priceRange}
  onChange={(e) => setPriceRange(e.target.value)}
  className="border rounded-xl px-4 py-3 shadow-sm focus:ring-2 focus:ring-green-500"
>
  <option value="All">All Prices</option>
  <option value="0-500">₹0 - ₹500</option>
  <option value="500-1000">₹500 - ₹1,000</option>
  <option value="1000-5000">₹1,000 - ₹5,000</option>
  <option value="5000+">₹5,000+</option>
</select>
<select
  value={availability}
  onChange={(e) => setAvailability(e.target.value)}
  className="border rounded-xl px-4 py-3 shadow-sm focus:ring-2 focus:ring-green-500"
>
  <option value="All">All Products</option>
  <option value="In Stock">In Stock</option>
  <option value="Low Stock">Low Stock (&lt;10)</option>
  <option value="Out of Stock">Out of Stock</option>
</select>

</div>
<h2 className="text-3xl font-bold mb-6">
  🛍 All Products
</h2>

        {/* PRODUCTS */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-8 text-center">
            <p className="text-gray-500 text-lg">
              {search
                ? "🔍 No matching products found in this store."
                : "🏪 This seller hasn't listed any products yet."}
            </p>
          </div>
          
        ) : ( 
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
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
      {/* ABOUT STORE */}

<div className="mt-14 bg-white rounded-3xl shadow-lg p-8">

  <h2 className="text-3xl font-bold mb-8">
    🏪 About This Store
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

    <div className="space-y-4">

      <p>
        <span className="font-semibold">👤 Owner:</span>{" "}
        {vendorInfo?.fullName || "Not Available"}
      </p>

      <p>
        <span className="font-semibold">🏢 Business:</span>{" "}
        {vendorInfo?.businessName || vendorName}
      </p>

      <p>
        <span className="font-semibold">📞 Phone:</span>{" "}
        {vendorInfo?.businessPhone || "Not Available"}
      </p>

      <p>
        <span className="font-semibold">📧 Email:</span>{" "}
        {vendorInfo?.email || "Not Available"}
      </p>

    </div>

    <div className="space-y-4">

      <p>
        <span className="font-semibold">📍 Location:</span>{" "}
        {vendorInfo?.city}, {vendorInfo?.state}
      </p>

      <p>
        <span className="font-semibold">🛡 Status:</span>{" "}
        Verified Marketplace Seller
      </p>

      <p>
        <span className="font-semibold">📦 Products:</span>{" "}
        {totalProducts}
      </p>

      <p>
        <span className="font-semibold">📦 Total Stock:</span>{" "}
        {totalStock}
      </p>

    </div>

  </div>
  {/* SELLER ACHIEVEMENTS */}

<div className="mt-12 bg-white rounded-3xl shadow-lg p-8">

  <h2 className="text-3xl font-bold mb-6">
    🏆 Seller Achievements
  </h2>

  <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-center">

    <div>
      🛡
      <p className="mt-2 font-semibold">
        Verified Seller
      </p>
    </div>

    <div>
      🚚
      <p className="mt-2 font-semibold">
        Fast Shipping
      </p>
    </div>

    <div>
      ⭐
      <p className="mt-2 font-semibold">
        Top Rated
      </p>
    </div>

    <div>
      🎖
      <p className="mt-2 font-semibold">
        Trusted Partner
      </p>
    </div>

  </div>

</div>
  {/* CONTACT SELLER */}

<div className="mt-12 bg-white rounded-3xl shadow-lg p-8">

  <h2 className="text-3xl font-bold mb-6">
    📞 Contact Seller
  </h2>

  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

    <div>
      <p className="font-semibold">Business Phone</p>
      <p className="text-gray-600">
        {vendorInfo?.businessPhone || "Not Available"}
      </p>
    </div>

    <div>
      <p className="font-semibold">Email</p>
      <p className="text-gray-600">
        {vendorInfo?.email || "Not Available"}
      </p>
    </div>

    <div>
      <p className="font-semibold">Location</p>
      <p className="text-gray-600">
        {vendorInfo?.city}, {vendorInfo?.state}
      </p>
    </div>

    <div>
      <p className="font-semibold">Seller Status</p>
      <p className="text-green-600 font-semibold">
        ✅ Verified Marketplace Seller
      </p>
    </div>

  </div>

</div>
  {/* STORE REVIEWS */}

<div className="mt-12 bg-white rounded-3xl shadow-lg p-8">

  <div className="flex items-center justify-between mb-8">

    <h2 className="text-3xl font-bold">
      ⭐ Customer Reviews
    </h2>

    <button
      className="
        bg-green-600
        hover:bg-green-700
        text-white
        px-5
        py-2
        rounded-xl
        font-semibold
      "
    >
      Write a Review
    </button>

  </div>

  <div className="space-y-6">

    <div className="border-b pb-5">

      <div className="flex items-center justify-between">

        <h3 className="font-semibold text-lg">
          Rahul Sharma
        </h3>

        <span className="text-yellow-500">
          ⭐⭐⭐⭐⭐
        </span>

      </div>

      <p className="text-gray-600 mt-2">
        Great seller. Fast delivery and excellent product quality.
      </p>

    </div>

    <div className="border-b pb-5">

      <div className="flex items-center justify-between">

        <h3 className="font-semibold text-lg">
          Priya Patel
        </h3>

        <span className="text-yellow-500">
          ⭐⭐⭐⭐☆
        </span>

      </div>

      <p className="text-gray-600 mt-2">
        Packaging was good and customer support was responsive.
      </p>

    </div>

    <div>

      <div className="flex items-center justify-between">

        <h3 className="font-semibold text-lg">
          Amit Kumar
        </h3>

        <span className="text-yellow-500">
          ⭐⭐⭐⭐⭐
        </span>

      </div>

      <p className="text-gray-600 mt-2">
        Highly recommended. Will definitely purchase again.
      </p>

    </div>

  </div>

</div>

</div>
      <div className="text-center py-10 text-gray-400">
Looking for another seller?
<Link
href="/stores"
className="text-green-600 ml-2 hover:underline"
>
Browse All Stores
</Link>
</div>
    </section>
  );
}
