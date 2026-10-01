"use client";

import { readJsonArray } from "@/lib/safeStorage";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isStorefrontVisible, toLegacyProduct } from "@/lib/products/legacyDisplay";

export default function ComparePage() {
  const [products, setProducts] = useState<any[]>([]);

  const persist = (list: any[]) => {
    // Same slim shape the product cards save — not the whole product document.
    const slim = list.map(({ id, name, price, image, stock }) => ({ id, name, price, image, stock }));
    localStorage.setItem("compareProducts", JSON.stringify(slim));
    // Product cards listen for this to refresh their selected state.
    window.dispatchEvent(new Event("compareUpdated"));
  };

  useEffect(() => {
    let cancelled = false;
    let saved: any[] = [];
    try {
      const parsed = readJsonArray("compareProducts");
      if (Array.isArray(parsed)) saved = parsed;
    } catch {
      saved = [];
    }
    setProducts(saved);

    // Product cards only save id/name/price/image/stock. Refresh each (at most 4)
    // from its live product doc so price, MRP, rating, category and stock are
    // current and complete, and drop products that are no longer on sale. If a
    // read fails the saved snapshot is kept as-is.
    (async () => {
      const fresh = await Promise.all(
        saved.map(async (item) => {
          try {
            const snap = await getDoc(doc(db, "products", String(item.id)));
            if (!snap.exists()) return null;
            const data = snap.data();
            if (!isStorefrontVisible(data)) return null;
            return { ...item, ...toLegacyProduct(snap.id, data) };
          } catch {
            return item;
          }
        })
      );
      if (cancelled) return;
      const live = fresh.filter(Boolean) as any[];
      setProducts(live);
      if (live.length !== saved.length) persist(live);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const removeProduct = (id: string) => {
    const updated = products.filter((item) => item.id !== id);

    setProducts(updated);

    persist(updated);
  };

  const clearAll = () => {
    localStorage.removeItem("compareProducts");
    window.dispatchEvent(new Event("compareUpdated"));
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

      <div className="flex flex-wrap justify-between items-center gap-3 mb-8">

        <h1 className="text-2xl md:text-3xl font-bold">
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

              <th className="p-3 md:p-4 text-left sticky left-0 z-10 bg-gray-50">
                Feature
              </th>

              {products.map((product) => (
                <th
                  key={product.id}
                  className="p-3 md:p-4 text-center min-w-[170px] md:min-w-[220px]"
                >
              <Image
  src={product.image || "/no-image.png"}
  alt={product.name}
  width={112}
  height={112}
  className="w-28 h-28 object-cover mx-auto rounded-lg"
/>
                  <p className="font-semibold mt-3 break-words">
                    {product.name}
                  </p>

                  <button
                    onClick={() => removeProduct(product.id)}
                    className="mt-2 px-3 py-2 text-red-500 text-sm hover:underline"
                  >
                    Remove
                  </button>

                </th>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-3 md:p-4 sticky left-0 z-10 bg-white xl:static xl:bg-transparent">
                Price
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-3 md:p-4 break-words"
                >
                  ₹{Number(product.price).toLocaleString("en-IN")}
                </td>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-3 md:p-4 sticky left-0 z-10 bg-white xl:static xl:bg-transparent">
                MRP
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-3 md:p-4 break-words"
                >
                  {product.mrp
                    ? `₹${Number(product.mrp).toLocaleString("en-IN")}`
                    : "-"}
                </td>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-3 md:p-4 sticky left-0 z-10 bg-white xl:static xl:bg-transparent">
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
                    className="text-center p-3 md:p-4 text-green-600 font-semibold"
                  >
                    {off}%
                  </td>
                );
              })}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-3 md:p-4 sticky left-0 z-10 bg-white xl:static xl:bg-transparent">
                Rating
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-3 md:p-4 break-words"
                >
                  ⭐ {Number(product.rating || 0).toFixed(1)}
                </td>
              ))}

            </tr>

            <tr className="border-b">

              <td className="font-semibold p-3 md:p-4 sticky left-0 z-10 bg-white xl:static xl:bg-transparent">
                Stock
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className={`text-center p-3 md:p-4 font-semibold ${
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

              <td className="font-semibold p-3 md:p-4 sticky left-0 z-10 bg-white xl:static xl:bg-transparent">
                Category
              </td>

              {products.map((product) => (
                <td
                  key={product.id}
                  className="text-center p-3 md:p-4 break-words"
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