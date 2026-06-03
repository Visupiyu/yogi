import Link from "next/link";
  export default function Hero() {

  return (

    <section className="
  bg-gradient-to-r
  from-green-500
  via-green-600
  to-blue-600
  text-white
  py-20
">

      <div className="max-w-7xl mx-auto px-6">

       <h2 className="
  text-4xl
  md:text-6xl
  font-bold
  mb-4
">
          🛒 Welcome To Yogi Mart

India's Multi-Vendor Marketplace

Shop Groceries, Electronics,
Fashion, Beauty & More

        </h2>

        <p className="text-lg
md:text-2xl mb-2">

          Up To 70% OFF On Fashion,
          Electronics & Grocery

        </p>

        <Link
  href="/search"
  className="
    inline-block
    bg-white
    text-green-600
    px-8
    py-3
    rounded-2xl
    font-bold
    text-lg
  "
>
  Shop Now
</Link>

      </div>

    </section>

  );

}