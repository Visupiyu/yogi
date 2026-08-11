"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import Image from "next/image";

type Product = {
  id: string;
  name: string;
  image: string;
  price: number;
  stock: number;
  category?: string;
};

type Props = {
  currentProductId: string;
  category?: string;
};

export default function FrequentlyBoughtTogether({
  currentProductId,
  category,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    const loadProducts = async () => {
      try {
        const snapshot = await getDocs(collection(db, "products"));

        const items: Product[] = [];

        snapshot.forEach((doc) => {
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
                data.image ||
                "",
              price:
                typeof data.sellingPrice === "number"
                  ? data.sellingPrice
                  : Number(data.price || 0),
              stock: Number(data.stock || 0),
              category: data.categoryId || "",
            });
          }
        });

        setProducts(items.slice(0, 3));
      } catch (error) {
        console.error(error);
      }
    };

    if (category) {
      loadProducts();
    }
  }, [currentProductId, category]);

  const addAllToCart = () => {
    const cart = JSON.parse(
      localStorage.getItem("cart") || "[]"
    );

    products.forEach((product) => {
      const exists = cart.find(
        (item: any) => item.id === product.id
      );

      if (!exists) {
        cart.push({
          ...product,
          qty: 1,
        });
      }
    });

    localStorage.setItem(
      "cart",
      JSON.stringify(cart)
    );

    window.dispatchEvent(
      new Event("cartUpdated")
    );

    alert("Products added to cart");
  };

  if (products.length === 0) {
    return null;
  }

  const total = products.reduce(
    (sum, item) => sum + item.price,
    0
  );

  return (
    <section className="max-w-7xl mx-auto py-8">

      <h2 className="text-2xl font-bold mb-6">
        🛒 Frequently Bought Together
      </h2>

      <div className="grid md:grid-cols-3 gap-5">

        {products.map((product) => (
          <Link
            key={product.id}
            href={`/product/${product.id}`}
          >
            <div className="border rounded-2xl p-4 hover:shadow-lg transition">

             <Image
  src={product.image}
  alt={product.name}
  width={300}
  height={300}
/>

              <h3 className="font-semibold mt-3 line-clamp-2">
                {product.name}
              </h3>

              <p className="text-green-600 font-bold mt-2">
                ₹{product.price}
              </p>

            </div>
          </Link>
        ))}

      </div>

      <div className="flex flex-col md:flex-row justify-between items-center mt-6 bg-gray-50 rounded-2xl p-5">

        <div>
          <p className="text-lg font-semibold">
            Total:
          </p>

          <p className="text-2xl font-bold text-green-600">
            ₹{total.toLocaleString("en-IN")}
          </p>
        </div>

        <button
          onClick={addAllToCart}
          className="mt-4 md:mt-0 bg-green-600 hover:bg-green-700 text-white px-8 py-3 rounded-xl font-semibold"
        >
          Add All to Cart
        </button>

      </div>

    </section>
  );
}