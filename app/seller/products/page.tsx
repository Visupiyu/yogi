"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  where,
} from "firebase/firestore";

import { db } from "@/lib/firebase";

import type { Product } from "@/lib/products/product";

export default function SellerProductsPage() {
  const [products, setProducts] =

  useState<Product[]>([]);

const [loading, setLoading] =

  useState(true);
useEffect(() => {

  const loadProducts = async () => {

    try {

      // Temporary seller ID
      // Later this will come from Firebase Auth

      const vendorId = "seller-demo";

      const q = query(

        collection(db, "products"),

        where("vendorId", "==", vendorId)

      );

      const snapshot = await getDocs(q);

      const list = snapshot.docs.map(doc => ({

        id: doc.id,

        ...doc.data(),

      })) as Product[];

      setProducts(list);

    }

    finally {

      setLoading(false);

    }

  };

  loadProducts();

}, []);
const handleDelete = async (id: string) => {

  const confirmDelete = window.confirm(
    "Are you sure you want to delete this product?"
  );

  if (!confirmDelete) return;

  try {

    await deleteDoc(doc(db, "products", id));

    setProducts((prev) =>
      prev.filter((product) => product.id !== id)
    );

    alert("Product deleted successfully.");

  } catch (error) {

    console.error(error);

    alert("Failed to delete product.");

  }

};
  return (

    <div className="mx-auto max-w-7xl p-6">

      {/* Header */}

      <div className="mb-8 flex items-center justify-between">

        <div>
          <h1 className="text-3xl font-bold">
  My Products
</h1>

          <p className="mt-2 text-gray-600">

  Total Products : <strong>{products.length}</strong>

</p>

          <p className="mt-2 text-gray-600">

            Manage all products in your store.

          </p>

        </div>

        <Link

          href="/seller/products/add"

          className="rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"

        >

          + Add Product

        </Link>

      </div>

      {/* Search & Filters */}

      <div className="mb-6 grid gap-4 md:grid-cols-3">

        <input

          type="text"

          placeholder="Search products..."

          className="rounded-lg border p-3"

        />

        <select className="rounded-lg border p-3">

          <option>All Categories</option>

        </select>

        <select className="rounded-lg border p-3">

          <option>All Status</option>

          <option>Active</option>

          <option>Inactive</option>

          <option>Out of Stock</option>

        </select>

      </div>

      {/* Table */}

      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">

        <table className="w-full">

          <thead className="bg-gray-100">

            <tr>

              <th className="p-4 text-left">Image</th>

              <th className="p-4 text-left">Product</th>

              <th className="p-4 text-left">Category</th>

              <th className="p-4 text-left">Price</th>

              <th className="p-4 text-left">Stock</th>

              <th className="p-4 text-left">Status</th>

              <th className="p-4 text-center">Actions</th>

            </tr>

          </thead>

          <tbody>

  {loading ? (

    <tr>
      <td
        colSpan={7}
        className="p-10 text-center"
      >
        Loading...
      </td>
    </tr>

  ) : products.length === 0 ? (

    <tr>
      <td
        colSpan={7}
        className="p-10 text-center"
      >

        <div className="py-12">

          <h3 className="text-xl font-semibold">
            No Products Yet
          </h3>

          <p className="mt-2 text-gray-500">
            Start by adding your first product.
          </p>

        </div>

      </td>
    </tr>

  ) : (

    products.map((product) => (

      <tr
        key={product.id}
        className="border-t"
      >

        <td className="p-4">

          {product.thumbnail ? (

            <img
              src={product.thumbnail}
              alt={product.title}
              className="h-16 w-16 rounded object-cover"
            />

          ) : (

            <div className="h-16 w-16 rounded bg-gray-200" />

          )}

        </td>

        <td className="p-4">
          {product.title}
        </td>

        <td className="p-4">
          {product.categoryId}
        </td>

        <td className="p-4">
          ₹{product.sellingPrice}
        </td>

        <td className="p-4">
          {product.stock}
        </td>

        <td className="p-4">
          {product.active ? "Active" : "Inactive"}
        </td>

        <td className="p-4">

          <div className="flex gap-2">

            <button className="rounded bg-blue-500 px-3 py-1 text-sm text-white">
              View
            </button>

            <button className="rounded bg-green-500 px-3 py-1 text-sm text-white">
              Edit
            </button>

           <button
  onClick={() => handleDelete(product.id)}
  className="rounded bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
>
  Delete
</button>

          </div>

        </td>

      </tr>

    ))

  )}

</tbody>

        </table>

      </div>

    </div>

  );

}