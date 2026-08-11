"use client";

import { useQuery } from "@tanstack/react-query";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import CategoryStrip from "@/components/CategoryStrip";
import Footer from "@/components/Footer";
import HeroSlider from "@/components/heroSlider";
import FeaturedProducts from "@/components/home/FeaturedProducts";
import FlashSale from "@/components/home/FlashSale";
import FeatureStrip from "@/components/home/FeatureStrip";
import OfferCards from "@/components/home/OfferCards";
import ProductSkeleton from "@/components/ProductSkeleton";
import TrendingProducts from "@/components/TrendingProducts";
import BestSellers from "@/components/BestSellers";
import RecommendedProducts from "@/components/RecommendedProducts";
import CategoryRow from "@/components/CategoryRow";
import FeaturedCategories from "@/components/FeaturedCategories";
import { Search } from "lucide-react";
import QuickCategories from "@/components/home/QuickCategories";
import CollectionStrip from "@/components/home/CollectionStrip";
import PromoBanner from "@/components/home/PromoBanner";
import { catalogTree } from "@/lib/catalog/catalogTree";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog/categoryUtils";
import { toLegacyProduct, type LegacyProductView } from "@/lib/products/legacyDisplay";

type Product = LegacyProductView;

// "name" here is the catalog node's own display name (used to resolve the
// real categoryId/subCategoryId), which isn't always the same as the row's
// on-page title — e.g. Men/Women are subcategories of "Fashion", not their
// own top-level category.
const CATEGORY_ROWS = [
  { title: "📱 Mobiles", name: "Mobiles" },
  { title: "👔 Men Fashion", name: "Men" },
  { title: "👗 Women Fashion", name: "Women" },
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
    snapshot.forEach((docSnap) => {
      items.push(toLegacyProduct(docSnap.id, docSnap.data()));
    });
    return items;
  } catch (err) {
   if (process.env.NODE_ENV === "development") {
  console.error(err);
}
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
  staleTime: 1000 * 60 * 5,
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
  const byCategory = (name: string) => {
    const node = findNodeByName(name, catalogTree);
    if (!node) return [];

    if (isTopLevelCategory(node)) {
      return filteredData.filter((p) => p.categoryId === node.id);
    }
    return filteredData.filter(
      (p) =>
        p.subCategoryId === node.id || p.leafCategoryId === node.id
    );
  };

  return (
    <main className="min-h-screen bg-gray-100 pb-16 md:pb-0">
      <CategoryStrip />
      <FeatureStrip />

      <section className="max-w-7xl mx-auto px-2 py-2">
  <HeroSlider />
  <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -20 relative z-20">

  <div className="
bg-white
rounded-3xl
shadow-2xl
hover:shadow-2xl
transition-all
duration-300
border
border-gray-100
p-5">

    <div className="flex flex-col lg:flex-row gap-4">

      {/* Search */}

      <div className="flex-1 relative">

        <input
          type="text"
          placeholder="Search products, brands, categories..."
          className="
w-full
h-14
rounded-2xl
bg-gray-50
border
border-gray-200
pl-14
pr-5
text-gray-700
placeholder:text-gray-400
focus:outline-none
focus:ring-2
focus:ring-blue-500
focus:border-blue-500
transition-all
text-base
"
        />

        <span
          className="
          absolute
          left-5
          top-1/2
          -translate-y-1/2
          text-2xl
          "
        >
        <Search className="w-6 h-6 text-gray-400" />
        </span>

      </div>

      {/* Button */}

      <button
       className="
h-14
px-10
rounded-2xl
bg-gradient-to-r
from-blue-700
to-orange-500
text-white
font-semibold
shadow-lg
hover:shadow-xl
hover:scale-105
transition-all
duration-300
"
      >
        Search
      </button>

    </div>

  </div>

</section>
<QuickCategories />
</section>

<section className="max-w-7xl mx-auto px-2 pb-4">
  <OfferCards />
</section>

      <FeaturedCategories />
      <FlashSale />

      {/* Category rows — only rendered when the category has products */}
      {CATEGORY_ROWS.map(({ title, name }) => {
        const products = byCategory(name);
        if (products.length === 0) return null;
        return <CategoryRow key={name} title={title} products={products} />;
      })}

      <TrendingProducts />
      <CollectionStrip
  title="⚡ Electronics Collection"
  category="Electronics"
  viewAll="/category/Electronics"
/>
      <BestSellers />
      <CollectionStrip
  title="🎁 Raksha Bandhan Gifts"
  category="Gifts"
  viewAll="/category/Gifts"
/>
<PromoBanner />
      <RecommendedProducts />
      <CollectionStrip
  title="🌧️ Monsoon Essentials"
  category="Home Essentials"
  viewAll="/category/Home%20Essentials"
/>
      <FeaturedProducts />
      <Footer />
    </main>
  );
}
