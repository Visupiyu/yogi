"use client";

"use client";

import { useMemo } from "react";
import Link from "next/link";

// Products are provided by the parent dashboard (app/seller/page.tsx), which
// loads the seller's products ONCE and shares them. This component no longer
// queries Firestore itself; the low-stock threshold (<= 10) filter and
// ascending sort below are unchanged from when it fetched its own copy.
type LowStockProductsProps = {
  products: any[];
  loading: boolean;
};

export default function LowStockProducts({ products: allProducts, loading }: LowStockProductsProps) {

  const products = useMemo(() => {
    const items = (allProducts || []).filter(
      (product: any) => (product.stock ?? 0) <= 10
    );

    return [...items].sort(
      (a, b) => (a.stock || 0) - (b.stock || 0)
    );
  }, [allProducts]);
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
                    Low Stock
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