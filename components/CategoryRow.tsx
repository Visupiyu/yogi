"use client";

import ProductCard from "@/components/ProductCard";

export default function CategoryRow({ title, products }: any) {
  if (!products?.length) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-2 py-6">
      <h2 className="text-2xl md:text-3xl font-bold mb-4">{title}</h2>

     <div
  className="
    flex
    flex-nowrap
    gap-4
    overflow-x-scroll
    overflow-y-hidden
    pb-4
    border-2
    border-red-500
  "
>
        {products.map((product: any) => (
          <div
  key={product.id}
  className="
    flex-shrink-0
    w-[220px]
  "
>
            <ProductCard
              id={product.id}
              name={product.name}
              price={product.price}
              image={product.image}
              stock={product.stock}
            />
          </div>
        ))}
      </div>
    </section>
  );
}
