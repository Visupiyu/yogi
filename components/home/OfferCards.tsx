"use client";

import Link from "next/link";
import { PRODUCT_IMAGE_PLACEHOLDER } from "@/lib/productImage";

// Category shortcuts, not promotions. There is no sale, deal or time-limited
// offer data model behind these cards (see FlashSale.jsx), and nothing
// guarantees any Mobiles product is discounted, so they carry no "% OFF",
// "HOT DEAL", "LIMITED OFFER" or "SAVE BIG" claims. The real discount
// filter lives in the Best Deals banner (/search?minDiscount=…).
const offers = [
  {
    title: "Mobiles",
    subtitle: "Browse phones from sellers on YOMICO",
    badge: "📱 MOBILES",
    image: "/offers/mobiles.jpg",
    link: "/category/Mobiles",
  },
  {
    title: "Home Appliances",
    subtitle: "Modern Living Starts Here",
    badge: "🏠 APPLIANCES",
    // Not /offers/appliances.jpg: that artwork has an "UP TO 30% OFF" badge
    // baked into the image. This existing asset carries no text.
    image: "/banners/electronics-banner1.png.jpg",
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
                e.currentTarget.src = PRODUCT_IMAGE_PLACEHOLDER;
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
