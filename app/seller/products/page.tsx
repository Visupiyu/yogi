"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, deleteDoc, doc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useVendor } from "@/hooks/useVendor";
import { useRouter } from "next/navigation";

import type { Product } from "@/lib/products/product";

export default function SellerProductsPage() {
  const router = useRouter();
  const { vendorId, loading: vendorLoading, approved } = useVendor();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("All");
  const [status, setStatus] = useState("All");

  const loadProducts = async () => {
    if (!vendorId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);

      const q = query(
        collection(db, "products"),
        where("vendorId", "==", vendorId)
      );

      const snap = await getDocs(q);

      const data: Product[] = snap.docs.map((productDoc) => {
        const product = productDoc.data() as Partial<Product>;

        return {
          ...(product as Product),
          id: productDoc.id,
          sku: product.sku || "",
          slug: product.slug || "",
          title: product.title || "Untitled Product",
          // Concise customer-facing name, if the seller set one. Same field the
          // storefront cards already display via toLegacyProduct; the seller
          // table adopts the same precedence so long marketplace titles don't
          // blow out the column. The full `title` is left untouched.
          shortTitle: product.shortTitle || "",
          description: product.description || "",
          brand: product.brand || "",
          categoryId: product.categoryId || "",
          leafCategoryId: product.leafCategoryId || "",
          mrp: Number(product.mrp || 0),
          sellingPrice: Number(product.sellingPrice || 0),
          currency: product.currency || "INR",
          stock: Number(product.stock || 0),
          minStock: Number(product.minStock || 0),
          maxStock: Number(product.maxStock || 0),
          thumbnail: product.thumbnail || "",
          images: product.images || [],
          specifications: product.specifications || {},
          variants: Array.isArray(product.variants)? product.variants : [],
          vendorId: product.vendorId || vendorId,
          active: product.active !== false,
          featured: product.featured === true,
          approved: product.approved === true,
          createdAt: product.createdAt || (new Date() as any),
          updatedAt: product.updatedAt || (new Date() as any),
        };
      });

      setProducts(data);
    } catch (error) {
      console.error("Failed to load seller products:", error);
      alert("Failed to load products.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!vendorLoading) {
      loadProducts();
    }
  }, [vendorId, vendorLoading]);

  const categories = useMemo(() => {
    const values = products
      .map((product) => product.categoryId)
      .filter(Boolean);

    return ["All", ...Array.from(new Set(values))];
  }, [products]);

  const filteredProducts = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return products.filter((product) => {
      const matchesSearch =
        !searchText ||
        product.title.toLowerCase().includes(searchText) ||
        product.sku.toLowerCase().includes(searchText) ||
        product.brand.toLowerCase().includes(searchText);

      const matchesCategory =
        category === "All" || product.categoryId === category;

      let matchesStatus = true;

      if (status === "Active") {
        matchesStatus = product.active === true;
      }

      if (status === "Inactive") {
        matchesStatus = product.active === false;
      }

      if (status === "Approved") {
        matchesStatus = product.approved === true;
      }

      if (status === "Pending") {
        matchesStatus = product.approved === false;
      }

      if (status === "Out of Stock") {
        matchesStatus = product.stock <= 0;
      }

      return matchesSearch && matchesCategory && matchesStatus;
    });
  }, [products, search, category, status]);

  const deleteProduct = async (productId: string) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this product?"
    );

    if (!confirmed) return;

    try {
      await deleteDoc(doc(db, "products", productId));

      setProducts((current) =>
        current.filter((product) => product.id !== productId)
      );

      alert("Product deleted successfully.");
    } catch (error) {
      console.error("Delete product error:", error);
      alert("Failed to delete product.");
    }
  };

  const getStockLabel = (stock: number) => {
    if (stock <= 0) {
      return {
        text: "Out of Stock",
        className: "bg-red-100 text-red-700",
      };
    }

    if (stock <= 5) {
      return {
        text: "Low Stock",
        className: "bg-orange-100 text-orange-700",
      };
    }

    return {
      text: "In Stock",
      className: "bg-green-100 text-green-700",
    };
  };

  if (vendorLoading || loading) {
    return (
      <div className="flex min-h-[400px] items-center justify-center">
        <p className="text-gray-500">Loading products...</p>
      </div>
    );
  }

  if (!vendorId) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-gray-800">
          Seller account not found
        </h2>

        <p className="mt-2 text-gray-500">
          Please log in with your seller account.
        </p>
      </div>
    );
  }

  if (!approved) {
    return (
      <div className="rounded-2xl bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-bold text-orange-600">
          Seller Account Pending Approval
        </h2>

        <p className="mt-2 text-gray-500">
          Your seller account must be approved before managing products.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-indigo-600">
            Seller Engine
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            My Products
          </h1>

          <p className="mt-1 text-gray-500">
            Manage your products, stock and product status.
          </p>
        </div>

        <button
          type="button"
          onClick={() => router.push("/seller/products/add")}
          className="rounded-xl bg-indigo-600 px-5 py-3 font-semibold text-white transition hover:bg-indigo-700"
        >
          + Add Product
        </button>
      </div>

      {/* SUMMARY */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Total Products</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">
            {products.length}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Active</p>
          <p className="mt-2 text-3xl font-bold text-green-600">
            {products.filter((product) => product.active).length}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Low Stock</p>
          <p className="mt-2 text-3xl font-bold text-orange-600">
            {
              products.filter(
                (product) =>
                  product.stock > 0 &&
                  product.stock <= 5
              ).length
            }
          </p>
        </div>

        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <p className="text-sm text-gray-500">Out of Stock</p>
          <p className="mt-2 text-3xl font-bold text-red-600">
            {products.filter((product) => product.stock <= 0).length}
          </p>
        </div>
      </div>

      {/* FILTERS */}
      <div className="rounded-2xl bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {/* SEARCH */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Search
            </label>

            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search by product, SKU or brand..."
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-indigo-500"
            />
          </div>

          {/* CATEGORY */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Category
            </label>

            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-indigo-500"
            >
              {categories.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          {/* STATUS */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Status
            </label>

            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:border-indigo-500"
            >
              <option value="All">All Status</option>
              <option value="Active">Active</option>
              <option value="Inactive">Inactive</option>
              <option value="Approved">Approved</option>
              <option value="Pending">Pending</option>
              <option value="Out of Stock">Out of Stock</option>
            </select>
          </div>
        </div>
      </div>

      {/* PRODUCT TABLE */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="border-b bg-gray-50">
              <tr>
                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Product
                </th>

                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  SKU
                </th>

                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Price
                </th>

                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Stock
                </th>

                <th className="px-6 py-4 text-left text-sm font-semibold text-gray-700">
                  Status
                </th>

                <th className="px-6 py-4 text-right text-sm font-semibold text-gray-700">
                  Actions
                </th>
              </tr>
            </thead>

            <tbody className="divide-y">
              {filteredProducts.map((product) => {
                const stock = getStockLabel(product.stock);

                return (
                  <tr
                    key={product.id}
                    className="transition hover:bg-gray-50"
                  >
                    {/* PRODUCT */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <div className="h-14 w-14 overflow-hidden rounded-xl bg-gray-100">
                          {product.thumbnail ? (
                            <img
                              src={product.thumbnail}
                              alt={product.title}
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
                              No Image
                            </div>
                          )}
                        </div>

                        <div className="min-w-0 max-w-[240px]">
                          {/* Prefer the concise shortTitle (same precedence the
                              storefront cards use); fall back to the full title.
                              Width-capped + truncated so a long marketplace title
                              can't widen the column, with the full title on hover. */}
                          <p
                            className="truncate font-semibold text-gray-900"
                            title={product.title}
                          >
                            {product.shortTitle || product.title}
                          </p>

                          <p className="mt-1 text-xs text-gray-500">
                            {product.brand || "No Brand"}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* SKU */}
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {product.sku || "—"}
                    </td>

                    {/* PRICE */}
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">
                        ₹{Number(product.sellingPrice || 0).toLocaleString(
                          "en-IN"
                        )}
                      </p>

                      {product.mrp > product.sellingPrice && (
                        <p className="text-xs text-gray-400 line-through">
                          ₹{Number(product.mrp || 0).toLocaleString("en-IN")}
                        </p>
                      )}
                    </td>

                    {/* STOCK */}
                    <td className="px-6 py-4">
                      <p className="font-semibold text-gray-900">
                        {product.stock}
                      </p>

                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-1 text-xs font-semibold ${stock.className}`}
                      >
                        {stock.text}
                      </span>
                    </td>

                    {/* STATUS */}
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <span
                          className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                            product.active
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-700"
                          }`}
                        >
                          {product.active ? "Active" : "Inactive"}
                        </span>

                        <div>
                          <span
                            className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                              product.approved
                                ? "bg-blue-100 text-blue-700"
                                : "bg-yellow-100 text-yellow-700"
                            }`}
                          >
                            {product.approved ? "Approved" : "Pending"}
                          </span>
                        </div>
                      </div>
                    </td>

                    {/* ACTIONS */}
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            router.push(
                              `/seller/products/edit/${product.id}`
                            )
                          }
                          className="rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          onClick={() => deleteProduct(product.id)}
                          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredProducts.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-16 text-center"
                  >
                    <p className="text-lg font-semibold text-gray-700">
                      No products found
                    </p>

                    <p className="mt-1 text-sm text-gray-500">
                      Try changing your search or filters.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* RESULT COUNT */}
      <p className="text-sm text-gray-500">
        Showing {filteredProducts.length} of {products.length} products
      </p>
    </div>
  );
}