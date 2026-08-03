"use client";

import ProductCard from "@/components/ProductCard";

export default function CategoryRow({ title, products }: any) {
  if (!products?.length) {
    return null;
  }

  return (
    <section className="max-w-7xl mx-auto px-2 py-2">
      <div className="flex items-center justify-between mb-3">

  <h2 className="text-xl md:text-2xl font-bold">
    {title}
  </h2>

  <a
    href="/search"
    className="
      text-green-600
      hover:text-green-700
      font-semibold
      text-sm
    "
  >
    View All →
  </a>

</div>

<div
  className="
    flex
    flex-nowrap
    gap-2
    overflow-x-auto
    overflow-y-hidden
    scrollbar-hide
    scroll-smooth
    pb-2
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
