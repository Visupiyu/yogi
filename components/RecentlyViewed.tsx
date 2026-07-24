"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Product = {
  id: string;
  name: string;
  image?: string;
  price: number;
};

export default function RecentlyViewed({
  currentProductId,
}: {
  currentProductId?: string;
}) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const viewed = JSON.parse(
      localStorage.getItem("recentlyViewed") || "[]"
    );

    setProducts(
  viewed.filter(
    (item: Product) => item.id !== currentProductId
  )
);
  }, []);

  if (products.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-3xl font-bold mb-6">
        👀 Recently Viewed
      </h2>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">

        {products.map((product) => (

          <Link
            key={product.id}
            href={`/product/${product.id}`}
          >

            <div
              className="
                bg-white
                rounded-2xl
                shadow-sm
                hover:shadow-lg
                transition
                overflow-hidden
              "
            >

              <img
                src={product.image || "/no-image.png"}
                alt={product.name}
                className="
                  w-full
                  h-40
                  object-contain
                  p-3
                "
              />

              <div className="p-3">

                <h3
                  className="
                    font-semibold
                    text-sm
                    line-clamp-2
                    min-h-[40px]
                  "
                >
                  {product.name}
                </h3>

                <p className="mt-2 text-green-600 font-bold">
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