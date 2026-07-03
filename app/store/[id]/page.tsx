"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ProductCard from "@/components/ProductCard";

export default function StorePage() {
  const params = useParams();

  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [vendorName, setVendorName] = useState("");
  const [vendorInfo, setVendorInfo] = useState<any>(null);
  const [search, setSearch] = useState("");
  const [totalProducts, setTotalProducts] = useState(0);
  const [totalStock, setTotalStock] = useState(0);

  useEffect(() => {
    const fetchStore = async () => {
      try {
        // Products for this vendor (vendorId === uid in the URL)
        const q = query(
          collection(db, "products"),
          where("vendorId", "==", params.id)
        );
        const snapshot = await getDocs(q);
        const items: any[] = [];
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
        setProducts(items);

        // Vendor record (look up by uid to match the link)
        const vendorSnap = await getDocs(
          query(collection(db, "vendors"), where("uid", "==", params.id))
        );
        if (!vendorSnap.empty) {
          setVendorInfo(vendorSnap.docs[0].data());
        }

        setTotalProducts(items.length);
        setTotalStock(
          items.reduce((sum, item) => sum + (item.stock || 0), 0)
        );

        if (items.length > 0) {
          setVendorName(items[0].vendorName || "Vendor Store");
        } else if (!vendorSnap.empty) {
          setVendorName(vendorSnap.docs[0].data().businessName || "Vendor Store");
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

  const filteredProducts = products.filter((product) =>
    (product.name || "").toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <section className="py-10 px-4">
      <div className="max-w-7xl mx-auto">
        <Link
          href="/stores"
          className="inline-block mb-6 bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-xl"
        >
          ← Back to Stores
        </Link>

        {/* STORE HEADER */}
        <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-3xl p-6 md:p-12 text-white mb-10">
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
              <h1 className="text-2xl md:text-5xl font-bold mt-2">
                {vendorName}
              </h1>
              <p className="mt-3 opacity-90">
                Trusted marketplace seller serving customers across India
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

          <div className="flex flex-wrap gap-3 mt-6">
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
            <div className="bg-white/20 rounded-2xl p-4 min-w-[120px] text-center">
              <p>Products</p>
              <h3 className="text-3xl font-bold">{totalProducts}</h3>
            </div>

            <div className="bg-white/20 rounded-2xl p-4 min-w-[120px] text-center">
              <p>Stock</p>
              <h3 className="text-3xl font-bold">{totalStock}</h3>
            </div>

            {vendorInfo?.rating ? (
              <div className="bg-white/20 rounded-2xl p-4 min-w-[120px] text-center">
                <p>Rating</p>
                <h3 className="text-3xl font-bold">{vendorInfo.rating}⭐</h3>
              </div>
            ) : null}
          </div>
        </div>

        {/* STORE SEARCH */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="🔍 Search products in this store..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-2xl p-4 shadow-sm outline-none focus:ring-2 focus:ring-green-500"
          />
          <p className="text-gray-600 mt-3">
            Showing {filteredProducts.length} Products
          </p>
        </div>

        {/* PRODUCTS */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-3xl shadow-md p-8 text-center">
            <p className="text-gray-500 text-lg">
              {search
                ? "No matching products in this store."
                : "This store has not added products yet."}
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
    </section>
  );
}
