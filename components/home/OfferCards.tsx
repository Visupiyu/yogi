"use client";

import Link from "next/link";

// Plain category labels. "Up to 40% OFF", "HOT DEAL", "LIMITED OFFER" and the
// "SAVE BIG" corner badge were removed — no sale, time limit or discount level
// stands behind them.
const offers = [
  {
    title: "Smartphones",
    subtitle: "Browse mobile phones",
    badge: "📱 MOBILES",
    image: "/offers/mobiles.jpg",
    link: "/category/Mobiles",
  },
  {
    title: "Smart Home Appliances",
    subtitle: "Modern Living Starts Here",
    badge: "🏠 APPLIANCES",
    // Neutral artwork: /offers/appliances.jpg (kept, not deleted) has "UP TO
    // 30% OFF" and its own "SHOP NOW" printed into the image.
    image: "/offers/appliances-neutral.svg",
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
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
