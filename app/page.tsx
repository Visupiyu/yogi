"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";

import CategoryStrip from "@/components/CategoryStrip";
import Footer from "@/components/Footer";
import HeroSlider from "@/components/heroSlider";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import TopVendors from "@/components/home/TopVendors";
import FlashSale from "@/components/home/FlashSale";
import FeatureStrip from "@/components/home/FeatureStrip";
import OfferCards from "@/components/home/OfferCards";
import ProductSkeleton from "@/components/ProductSkeleton";
import TrendingProducts from "@/components/TrendingProducts";
import BestSellers from "@/components/BestSellers";
import CustomerReviewsCarousel from "@/components/CustomerReviewsCarousel";
import CouponPopup from "@/components/CouponPopup";
import RecommendedProducts from "@/components/RecommendedProducts";
import CategoryRow from "@/components/CategoryRow";
import FeaturedCategories from "@/components/FeaturedCategories";

type Product = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  category: string;
};

// Category rows rendered on the home page (only shown if they have products).
const CATEGORY_ROWS = [
  { title: "📱 Mobiles", name: "Mobiles" },
  { title: "👔 Men Fashion", name: "Men Fashion" },
  { title: "👗 Women Fashion", name: "Women Fashion" },
  { title: "🧒 Kids Fashion", name: "Kids Fashion" },
  { title: "💻 Electronics", name: "Electronics" },
  { title: "💄 Beauty", name: "Beauty" },
  { title: "🏠 Appliances", name: "Appliances" },
  { title: "🛒 Grocery", name: "Grocery" },
];

async function loadProducts(): Promise<Product[]> {
  try {
    const snapshot = await getDocs(collection(db, "products"));
    const items: Product[] = [];
    snapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() } as Product);
    });
    return items;
  } catch (err) {
    console.error(err);
    return [];
  }
}

export default function Home() {
  const {
    data: filteredData = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ["products"],
    queryFn: loadProducts,
  });

  if (error) {
    return <div className="p-10 text-center">Failed to load products</div>;
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-100 px-2 py-1">
        <div className="max-w-7xl mx-auto grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      </main>
    );
  }
if (filteredData.length === 0) {
  return (
    <main className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-center py-20">
        <h2 className="text-3xl font-bold text-gray-800">
          No Products Available
        </h2>

        <p className="mt-2 text-gray-600">
          Products will appear here soon.
        </p>
      </div>
    </main>
  );
}
  const byCategory = (name: string) =>
    filteredData.filter((p) => p.category === name);

  return (
    <main className="min-h-screen bg-gray-100">
      <CategoryStrip />
      <FeatureStrip />

      <section className="max-w-7xl mx-auto px-2 py-1 grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="lg:col-span-3">
          <HeroSlider />
        </div>
        <OfferCards />
      </section>

      <FeaturedCategories />
      <CouponPopup />
      <FlashSale />

      {/* Category rows — only rendered when the category has products */}
      {CATEGORY_ROWS.map(({ title, name }) => {
        const products = byCategory(name);
        if (products.length === 0) return null;
        return <CategoryRow key={name} title={title} products={products} />;
      })}

      <TrendingProducts />
      <BestSellers />
      <RecommendedProducts />
      <CustomerReviewsCarousel />
      <FeaturedProducts />
      <TopVendors />
      <Footer />
    </main>
  );
}
