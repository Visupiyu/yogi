"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";

export default function ComparePage() {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const saved = JSON.parse(
      localStorage.getItem("compareProducts") || "[]"
    );
    setProducts(saved);
  }, []);

  const removeProduct = (id: string) => {
    const updated = products.filter((item) => item.id !== id);

    setProducts(updated);

    localStorage.setItem(
      "compareProducts",
      JSON.stringify(updated)
    );
  };

  const clearAll = () => {
    localStorage.removeItem("compareProducts");
    setProducts([]);
  };

  if (products.length === 0) {
    return (
      <section className="min-h-screen flex flex-col justify-center items-center px-4">
        <h1 className="text-3xl font-bold mb-4">
          Product Comparison
        </h1>

        <p className="text-gray-500 mb-6">
          No products selected for comparison.
        </p>

        <Link href="/">
          <button className="bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-xl">
            Continue Shopping
          </button>
        </Link>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto py-10 px-4">

      <div className="flex justify-between items-center mb-8">

        <h1 className="text-3xl font-bold">
          📊 Product Comparison
        </h1>

        <button
          onClick={clearAll}
          className="bg-red-500 hover:bg-red-600 text-white px-5 py-2 rounded-xl"
        >
          Clear All
        </button>

      </div>

      <div className="overflow-x-auto">

        <table className="min-w-full border rounded-xl overflow-hidden">

          <tbody>

            <tr className="border-b bg-gray-50">

              <th className="p-4 text-left">
                Feature
              </th>

              {products.map((product) => (
                <th
                  key={product.id}
                  className="p-4 text-center min-w-[220px]"
                >
              <Image
  src={product.image || "/no-image.png"}
  alt={product.name}
  width={112}
  height={112}
  className="w-28 h-28 object-cover mx-auto rounded-lg"
/>
                  <p className="font-semibold mt-3">
                    {product.name}
                  </p>

                  <button
                    onClick={() => removeProduct(product.id)}
                    className="mt-3 text-red-500 text-sm hover:underline"
                  >
                    Remove
                  </button>

                </th>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-4">
                Price
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-4"
                >
                  ₹{Number(product.price).toLocaleString("en-IN")}
                </td>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-4">
                MRP
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-4"
                >
                  {product.mrp
                    ? `₹${Number(product.mrp).toLocaleString("en-IN")}`
                    : "-"}
                </td>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-4">
                Discount
              </td>

              {products.map((product) => {
                const off =
                  product.mrp && product.mrp > product.price
                    ? Math.round(
                        ((product.mrp - product.price) /
                          product.mrp) *
                          100
                      )
                    : 0;

                return (
                  <td
                    key={product.id}
                    className="text-center p-4 text-green-600 font-semibold"
                  >
                    {off}%
                  </td>
                );
              })}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-4">
                Rating
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-4"
                >
                  ⭐ {Number(product.rating || 0).toFixed(1)}
                </td>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-4">
                Stock
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className={`text-center p-4 font-semibold ${
                    product.stock > 0
                      ? "text-green-600"
                      : "text-red-500"
                  }`}
                >
                  {product.stock > 0
                    ? "In Stock"
                    : "Out of Stock"}
                </td>
              ))}

            </tr>

            <tr>

              <td className="font-semibold p-4">
                Category
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-4"
                >
                  {product.category || "-"}
                </td>
              ))}

            </tr>

          </tbody>

        </table>

      </div>

    </section>
  );
}