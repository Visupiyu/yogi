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

      <CategoryRow title="📱 Mobiles" products={byCategory("Mobiles")} />
      <CategoryRow title="👔 Men Fashion" products={byCategory("Men Fashion")} />
      <CategoryRow title="👗 Women Fashion" products={byCategory("Women Fashion")} />
      <CategoryRow title="🧒 Kids Fashion" products={byCategory("Kids Fashion")} />
      <CategoryRow title="💻 Electronics" products={byCategory("Electronics")} />
      <CategoryRow title="💄 Beauty" products={byCategory("Beauty")} />
      <CategoryRow title="🏠 Appliances" products={byCategory("Appliances")} />
      <CategoryRow title="🛒 Grocery" products={byCategory("Grocery")} />

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
