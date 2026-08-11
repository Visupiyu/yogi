"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

type Product = {
  id: string;
  name: string;
  image?: string;
  price: number;
  category?: string;
};

type Props = {
  currentProductId: string;
  category?: string;
};

export default function CustomersAlsoBought({
  currentProductId,
  category,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    async function loadProducts() {
      const snap = await getDocs(collection(db, "products"));

      const items: Product[] = [];

      snap.forEach((doc) => {
        const data = doc.data();

        if (
          doc.id !== currentProductId &&
          data.categoryId === category
        ) {
          items.push({
            id: doc.id,
            name: data.title || data.name || "",
            image:
              data.thumbnail ||
              (Array.isArray(data.images) ? data.images[0] : "") ||
              data.image,
            price:
              typeof data.sellingPrice === "number"
                ? data.sellingPrice
                : Number(data.price || 0),
            category: data.categoryId,
          });
        }
      });

      items.sort(() => Math.random() - 0.5);

      setProducts(items.slice(0, 4));
    }

    if (category) {
      loadProducts();
    }
  }, [currentProductId, category]);

  if (!products.length) return null;

  return (
    <section className="mt-10">

      <h2 className="text-3xl font-bold mb-6">
        👥 Customers Also Bought
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

        {products.map((product) => (

          <Link
            key={product.id}
            href={`/product/${product.id}`}
          >
            <div className="bg-white rounded-2xl shadow-sm hover:shadow-lg transition overflow-hidden">

              <img
                src={product.image || "/no-image.png"}
                alt={product.name}
                className="w-full h-40 object-contain p-3"
              />

              <div className="p-3">

                <h3 className="font-semibold text-sm line-clamp-2">
                  {product.name}
                </h3>

                <p className="text-green-600 font-bold mt-2">
                  ₹{product.price.toLocaleString("en-IN")}
                </p>

              </div>

            </div>
          </Link>

        ))}

      </div>

    </section>
  );
}