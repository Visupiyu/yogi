"use client";

import Link from "next/link";

const offers = [
  {
    title: "Latest Smartphones",
    subtitle: "Up to 40% OFF",
    badge: "🔥 HOT DEAL",
    image: "/offers/mobiles.jpg",
    link: "/category/Mobiles",
  },
  {
    title: "Smart Home Appliances",
    subtitle: "Modern Living Starts Here",
    badge: "⚡ LIMITED OFFER",
    image: "/offers/appliances.jpg",
    link: "/category/Appliances",
  },
];

export default function OfferCards() {
  return (
   <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {offers.map((offer) => (
        <Link
          key={offer.title}
          href={`/category/${encodeURIComponent(
            offer.link.replace("/category/", "")
          )}`}
          className="block"
        >
          <div className="relative overflow-hidden rounded-3xl h-[170px] shadow-xl hover:shadow-2xl group transition-all duration-300">
            <img
              src={offer.image}
              alt={offer.title}
              onError={(e) => {
                e.currentTarget.src = "/no-image.png";
              }}
              className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition duration-500"
            />
            {/* darker gradient so white text is readable */}
            <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-transparent" />

            <div className="relative z-10 h-full flex flex-col justify-center p-4 text-white">
             <span className="inline-block bg-yellow-400 text-black px-3 py-1 rounded-full text-xs font-bold mb-3 w-fit">
  {offer.badge}
</span>
              <h2 className="text-2xl font-bold mb-1">{offer.title}</h2>
              <p className="text-sm font-semibold mb-3">{offer.subtitle}</p>
              <span className="bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-500 hover:to-blue-500 text-white px-5 py-3 rounded-xl font-semibold w-fit shadow-lg transition">
  Shop Now →
</span>
<div className="absolute top-4 right-4 bg-red-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg">
  SAVE BIG
</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
