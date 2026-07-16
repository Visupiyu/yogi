"use client";

import Link from "next/link";

const offers = [
  {
    title: "Latest Smartphones",
    subtitle: "Up To 40% OFF",
    image:
      "https://images.unsplash.com/photo-1511707171634-5f897ff02aa9?q=80&w=1200&auto=format&fit=crop",
    link: "/category/Mobiles",
  },
  {
    title: "Home Appliances",
    subtitle: "Smart Living Starts Here",
    image:
      "https://images.unsplash.com/photo-1586208958839-06c17cacdf08?q=80&w=1200&auto=format&fit=crop",
    link: "/category/Appliances",
  },
];

export default function OfferCards() {
  return (
    <div className="flex flex-col gap-5">
      {offers.map((offer) => (
        <Link
          key={offer.title}
          href={`/category/${encodeURIComponent(
            offer.link.replace("/category/", "")
          )}`}
          className="block"
        >
          <div className="relative overflow-hidden rounded-2xl h-[200px] shadow-sm group">
            <img
              src={offer.image}
              alt={offer.title}
              onError={(e) => {
                e.currentTarget.src = "/no-image.png";
              }}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500"
            />
            {/* darker gradient so white text is readable */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/40 to-transparent" />

            <div className="relative z-10 h-full flex flex-col justify-center p-6 text-white">
              <p className="text-sm uppercase tracking-wider mb-2 opacity-90">
                Limited Offer
              </p>
              <h2 className="text-2xl font-bold mb-1">{offer.title}</h2>
              <p className="text-lg font-semibold mb-3">{offer.subtitle}</p>
              <span className="bg-white text-slate-900 hover:bg-gray-100 px-5 py-2 rounded-xl font-semibold w-fit transition">
                Shop Now →
              </span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
