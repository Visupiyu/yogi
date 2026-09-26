"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
  updateDoc,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { productModerationStatus, type ModerationStatus } from "@/lib/products/visibility";
import type { ModerationAction } from "@/lib/products/moderation";
import { toast } from "sonner";
import Image from "next/image";

type Product = {
  id: string;
  name: string;
  image: string;
  category: string;
  vendorName: string;
  price: number;
  stock: number;
  sales: number;
  status?: string;
  moderation: ModerationStatus;
  rejectionReason?: string | null;
  featured?: boolean;
};

// Labels for the moderation state from lib/products/visibility.ts. "Active"
// is kept as the label for live products so the existing stats/CSV read the
// same as before.
const STATUS_LABEL: Record<ModerationStatus, string> = {
  live: "Active",
  pending: "Pending",
  rejected: "Rejected",
  blocked: "Blocked",
};

const STATUS_BADGE_CLASS: Record<ModerationStatus, string> = {
  live: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  rejected: "bg-red-100 text-red-700",
  blocked: "bg-gray-200 text-gray-700",
};

const MODERATION_TOAST: Record<ModerationAction, string> = {
  approve: "Product approved and live.",
  reject: "Product rejected.",
  block: "Product blocked.",
  unblock: "Product unblocked.",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, "products"), orderBy("createdAt", "desc"))
      );
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        items.push({
          id: docSnap.id,
          name: data.title || data.name || "Product",
          image:
            data.thumbnail ||
            (Array.isArray(data.images) ? data.images[0] : "") ||
            data.image ||
            "",
          category: data.categoryId || data.category || "Others",
          vendorName: data.vendorName || "Unknown",
          price: typeof data.sellingPrice === "number" ? data.sellingPrice : data.price || 0,
          stock: data.stock || 0,
          sales: data.sales || 0,
          // Moderation state from the shared publication rule
          // (lib/products/visibility.ts): pending / rejected / blocked / live.
          moderation: productModerationStatus(data),
          status: STATUS_LABEL[productModerationStatus(data)],
          rejectionReason:
            typeof data.rejectionReason === "string" ? data.rejectionReason : null,
          featured: data.featured === true,
        });
      });
      setProducts(items);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  // Approve / reject / block / unblock go through the server moderation
  // route (app/api/admin/products/[id]/moderation), which checks the admin,
  // validates the transition and stamps moderatedAt/moderatedBy. The browser
  // no longer writes approval or visibility fields directly.
  const moderate = async (product: Product, action: ModerationAction) => {
    let reason: string | undefined;
    if (action === "reject") {
      const input = window.prompt(
        `Reason for rejecting "${product.name}" (shown to the seller):`
      );
      if (input === null) return;
      reason = input.trim();
      if (!reason) {
        toast.error("A rejection reason is required.");
        return;
      }
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in again.");
        return;
      }
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(product.id)}/moderation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error || "Failed to update product.");
        return;
      }
      toast.success(MODERATION_TOAST[action]);
      loadProducts();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update product.");
    }
  };

  // The homepage's "Featured Products" section filters on this field, but
  // nothing anywhere ever set it to true — it always defaulted false at
  // creation (app/seller/components/ProductForm.tsx) with no toggle
  // anywhere in the app.
  const toggleFeatured = async (product: Product) => {
    try {
      await updateDoc(doc(db, "products", product.id), {
        featured: !product.featured,
      });
      toast.success(
        product.featured ? "Removed from Featured." : "Marked as Featured."
      );
      loadProducts();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update product.");
    }
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Delete this product?")) return;
    try {
      await deleteDoc(doc(db, "products", id));
      toast.success("Product deleted.");
      loadProducts();
    } catch (error) {
      console.error(error);
      toast.error("Delete failed.");
    }
  };

  const filtered = products.filter((item) => {
    const searchMatch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.vendorName.toLowerCase().includes(search.toLowerCase());
    const categoryMatch =
      categoryFilter === "All" || item.category === categoryFilter;
    const vendorMatch =
      vendorFilter === "All" || item.vendorName === vendorFilter;
    const statusMatch =
      statusFilter === "All" || item.status === statusFilter;
    return searchMatch && categoryMatch && vendorMatch && statusMatch;
  });

  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.status === "Active").length;
  const pendingProducts = products.filter((p) => p.moderation === "pending").length;
  const outOfStock = products.filter((p) => p.stock <= 0).length;
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length;

  const categories = ["All", ...new Set(products.map((p) => p.category))];
  const vendors = ["All", ...new Set(products.map((p) => p.vendorName))];

  const exportCSV = () => {
    const rows = [
      ["Product", "Vendor", "Category", "Price", "Stock", "Sales", "Status"],
      ...filtered.map((p) => [
        p.name,
        p.vendorName,
        p.category,
        p.price,
        p.stock,
        p.sales,
        p.status,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">📦 Marketplace Products</h1>
          <p className="mt-2 opacity-90">Manage all marketplace products</p>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5 mb-8">
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Total Products</p>
            <h2 className="text-3xl font-bold">{totalProducts}</h2>
          </div>
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Active</p>
            <h2 className="text-3xl font-bold text-green-600">
              {activeProducts}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("Pending")}
            className="bg-white rounded-2xl shadow p-6 text-left hover:ring-2 hover:ring-yellow-400 transition"
          >
            <p>Pending Review</p>
            <h2 className="text-3xl font-bold text-yellow-600">
              {pendingProducts}
            </h2>
          </button>
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Low Stock</p>
            <h2 className="text-3xl font-bold text-yellow-600">{lowStock}</h2>
          </div>
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Out Of Stock</p>
            <h2 className="text-3xl font-bold text-red-600">{outOfStock}</h2>
          </div>
        </div>

        <div className="flex justify-end mb-5">
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 transition text-white px-6 py-3 rounded-xl"
          >
            📥 Export CSV
          </button>
        </div>

        {/* FILTERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <input
            placeholder="Search product or vendor..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border rounded-xl p-4"
          />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-xl p-4"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="border rounded-xl p-4"
          >
            {vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-xl p-4"
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending Review</option>
            <option value="Active">Active</option>
            <option value="Blocked">Blocked</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        {/* GRID */}
        {loading ? (
          <div className="bg-white rounded-2xl p-10 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-500">
            No products found.
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md transition p-3"
              >
                <div className="relative h-32">
                  <Image
                    src={product.image || "/no-image.png"}
                    alt={product.name}
                    onError={(e) => {
                      e.currentTarget.src = "/no-image.png";
                    }}
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>

                <h2 className="text-sm font-bold mt-2 line-clamp-1">
                  {product.name}
                </h2>
                <p className="text-gray-500 text-xs line-clamp-1">🏪 {product.vendorName}</p>
                <p className="text-gray-500 text-xs line-clamp-1">📂 {product.category}</p>
                <p className="font-bold text-sm mt-1">₹{Number(product.price).toLocaleString("en-IN")}</p>
                <p className="text-gray-500 text-xs">Stock: {product.stock} • Sales: {product.sales}</p>
                

                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      STATUS_BADGE_CLASS[product.moderation]
                    }`}
                  >
                    {product.status}
                  </span>

                  {product.stock <= 0 ? (
                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs">
                      Out Of Stock
                    </span>
                  ) : product.stock <= 5 ? (
                    <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs">
                      Low Stock
                    </span>
                  ) : null}
                </div>

                {product.moderation === "rejected" && product.rejectionReason ? (
                  <p className="text-xs text-red-600 mt-1 line-clamp-2">
                    Rejected: {product.rejectionReason}
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2 mt-3">
                  {(product.moderation === "pending" ||
                    product.moderation === "rejected") && (
                    <button
                      onClick={() => moderate(product, "approve")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-green-600 hover:bg-green-700"
                    >
                      Approve
                    </button>
                  )}

                  {product.moderation !== "rejected" && (
                    <button
                      onClick={() => moderate(product, "reject")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-orange-600 hover:bg-orange-700"
                    >
                      Reject
                    </button>
                  )}

                  {product.moderation === "live" && (
                    <button
                      onClick={() => moderate(product, "block")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-yellow-600 hover:bg-yellow-700"
                    >
                      Block
                    </button>
                  )}

                  {product.moderation === "blocked" && (
                    <button
                      onClick={() => moderate(product, "unblock")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-green-600 hover:bg-green-700"
                    >
                      Unblock
                    </button>
                  )}

                  <button
                    onClick={() => toggleFeatured(product)}
                    className={`flex-1 py-1.5 text-sm rounded-lg text-white transition ${
                      product.featured
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-gray-500 hover:bg-gray-600"
                    }`}
                  >
                    {product.featured ? "★ Featured" : "☆ Feature"}
                  </button>

                  <button
                    onClick={() => deleteProduct(product.id)}
                    className="flex-1 bg-red-600 hover:bg-red-700 transition text-white py-1.5 text-sm rounded-lg"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
