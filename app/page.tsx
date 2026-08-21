"use client";

import Image from "next/image";
import Link from "next/link";
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
import LaunchTrustBanner from "@/components/home/LaunchTrustBanner";
import ProductSkeleton from "@/components/ProductSkeleton";
import TrendingProducts from "@/components/TrendingProducts";
import BestSellers from "@/components/BestSellers";
import RecommendedProducts from "@/components/RecommendedProducts";
import CategoryRow from "@/components/CategoryRow";
import FeaturedCategories from "@/components/FeaturedCategories";
import CollectionStrip from "@/components/home/CollectionStrip";
import PromoBanner from "@/components/home/PromoBanner";
import { catalogTree } from "@/lib/catalog/catalogTree";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog/categoryUtils";
import { toLegacyProduct, isStorefrontVisible, type LegacyProductView } from "@/lib/products/legacyDisplay";

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
  // Deliberately no try/catch here — swallowing the error and resolving
  // with [] made a genuine Firestore failure (permission error, network
  // failure, timeout) indistinguishable from "the catalog is empty",
  // which surfaced as a misleading full-page "No Products Available"
  // takeover with no error indication and no way to retry. Letting the
  // rejection propagate is what makes useQuery's own isError/refetch work
  // correctly below.
  const snapshot = await getDocs(collection(db, "products"));
  const items: Product[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    // Admin-blocked products must not appear on the storefront.
    if (!isStorefrontVisible(data)) return;
    items.push(toLegacyProduct(docSnap.id, data));
  });
  return items;
}

export default function Home() {
  const {
    data: filteredData = [],
    isLoading,
    isError,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["products"],
    queryFn: loadProducts,
    staleTime: 1000 * 60 * 5,
    // Explicit and modest, not TanStack's default of 3 — a permission or
    // config error will never succeed no matter how many times it's
    // retried, so burning through more attempts (each with a longer
    // backoff) only delays the customer seeing an actual error+Retry.
    retry: 2,
  });

  // This data is used for exactly one thing below (the category-row
  // shelves) — it used to gate the ENTIRE page (hero, nav, categories,
  // every other section) via early returns here, so a slow, failed, or
  // empty result for JUST the shelves took down the whole homepage even
  // though every other section fetches its own data independently. Now
  // scoped to only the section that actually needs it, further down.
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
</section>

      {/* YOMICO Independence Day launch banner — separate promotional
          banner, not part of HeroSlider. Links to /sell (the existing
          vendor page); no new route created. */}
      <section className="max-w-7xl mx-auto px-2 pb-2">
        <Link href="/sell" className="block overflow-hidden rounded-2xl shadow-md">
          <Image
            src="/yomico-independence-day-launch.jpg"
            alt="YOMICO Independence Day launch banner - 15 August"
            width={1168}
            height={784}
            sizes="(max-width: 768px) 100vw, 1152px"
            className="h-auto w-full"
            priority
          />
        </Link>
      </section>

      {/* Coded (no image asset) customer-facing trust/launch banner —
          reinforces the same 0% commission launch, framed for shoppers. */}
      <LaunchTrustBanner />

<section className="max-w-7xl mx-auto px-2 pb-4">
  <OfferCards />
</section>

      <FeaturedCategories />
      <FlashSale />

      {/* Category rows — an independent section: its own loading/error/
          empty states, never blocking the hero, categories, or any of
          the other product sections below (each of which fetches its
          own data and already handles its own state independently). */}
      {isLoading ? (
        <div className="max-w-7xl mx-auto px-2 py-4 grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {[...Array(10)].map((_, i) => (
            <ProductSkeleton key={i} />
          ))}
        </div>
      ) : isError ? (
        <div className="max-w-7xl mx-auto px-2 py-10 text-center bg-red-50 rounded-3xl border border-red-200 my-4">
          <p className="text-red-600 font-semibold">Unable to load products.</p>
          <p className="text-red-500 text-sm mt-1">Please try again.</p>
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="mt-4 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded-xl font-semibold transition"
          >
            {isFetching ? "Retrying..." : "Retry"}
          </button>
        </div>
      ) : CATEGORY_ROWS.every(({ name }) => byCategory(name).length === 0) ? (
        <div className="max-w-7xl mx-auto px-2 py-10 text-center text-gray-500">
          No products available right now.
        </div>
      ) : (
        CATEGORY_ROWS.map(({ title, name }) => {
          const products = byCategory(name);
          if (products.length === 0) return null;
          return <CategoryRow key={name} title={title} products={products} />;
        })
      )}

      <TrendingProducts />
      <CollectionStrip
  title="⚡ Electronics Collection"
  category="Electronics"
  viewAll="/category/Electronics"
/>
      <BestSellers />
      {/* "Gifts" and "Home Essentials" CollectionStrips removed — neither
          is a real category in lib/catalog/catalogTree.ts, so both
          permanently rendered nothing to every visitor. Re-add once a
          real category (or a proper seasonal-collection tagging
          mechanism) exists to back them, rather than guessing a mapping. */}
<PromoBanner />
      <RecommendedProducts />
      <FeaturedProducts />
      <Footer />
    </main>
  );
}
