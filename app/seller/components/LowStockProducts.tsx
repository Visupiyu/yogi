"use client";

import Link from "next/link";
import type { SellerProductStat } from "@/lib/sellerAnalytics/sellerAnalytics";

// The restock list comes from the server (app/api/seller/analytics): this
// seller's own products that are not archived, at or below the restock
// threshold, lowest stock first — allow-listed product stats, not documents.

type LowStockProductsProps = {
  products: SellerProductStat[];
  loading: boolean;
};

export default function LowStockProducts({ products, loading }: LowStockProductsProps) {
 return (
  <div className="rounded-2xl border bg-white p-6 shadow-sm">

    <div className="mb-6 flex items-center justify-between">

      <h2 className="text-xl font-bold">
        📦 Low Stock Products
      </h2>

      <Link
        href="/seller/inventory"
        className="text-blue-600 hover:underline"
      >
        Manage Inventory
      </Link>

    </div>

    {loading ? (

      <div className="py-10 text-center">
        Loading...
      </div>

    ) : products.length === 0 ? (

      <div className="py-10 text-center text-green-600 font-medium">
        🎉 All products have sufficient stock.
      </div>

    ) : (

      <div className="overflow-x-auto">

        <table className="w-full">

          <thead>

            <tr className="border-b">

              <th className="p-3 text-left">
                Product
              </th>

              <th className="p-3 text-left">
                Stock
              </th>

              <th className="p-3 text-left">
                Status
              </th>

            </tr>

          </thead>

          <tbody>

            {products.map((product) => (

              <tr
                key={product.id}
                className="border-b hover:bg-gray-50"
              >

                <td className="p-3">
                  {product.title}
                </td>

                <td className="p-3 font-bold">
                  {product.stock}
                </td>

                <td className="p-3">

                  <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-sm font-medium">
                    {product.stock <= 0 ? "Out of Stock" : "Low Stock"}
                  </span>

                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    )}

  </div>
);
}
