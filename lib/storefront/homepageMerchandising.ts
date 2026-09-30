// ==========================================
// YOMICO Marketplace
// lib/storefront/homepageMerchandising.ts
// ==========================================
//
// The homepage's merchandising rules — which products may appear under
// "Best Sellers", "Popular right now" and "Featured Products" — in one place,
// so the rows cannot drift apart or show the same products twice.
//
// Thresholds come from the 2026-09-30 production catalog census (43 live
// products, all in stock: 18 with sales >= 2, 25 with views >= 3, 0 marked
// Featured by an admin). A row that cannot fill MIN_PRODUCTS_TO_SHOW_SECTION
// honestly is hidden rather than padded with products that don't meet it.
//
// Read-only: these helpers only query and filter. They never change sales,
// views or the featured flag.

import { collection, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isProductVisible } from "@/lib/products/visibility";

/** A row with fewer qualifying products than this is not rendered at all. */
export const MIN_PRODUCTS_TO_SHOW_SECTION = 4;

export const BEST_SELLERS_MIN_SALES = 2;
export const BEST_SELLERS_LIMIT = 8;

export const TRENDING_MIN_VIEWS = 3;
export const TRENDING_LIMIT = 8;

/** Featured is admin-curated only: shown when at least this many are featured. */
export const MIN_FEATURED_TO_SHOW = 4;
export const FEATURED_LIMIT = 8;

// Candidate pools. Each query is a single-field orderBy/where, so no new
// composite index is needed; qualification is applied client-side below.
const BEST_SELLERS_CANDIDATES = 40;
const TRENDING_CANDIDATES = 48;
const FEATURED_CANDIDATES = 32;

export type HomepageProduct = { id: string } & Record<string, any>;
type RawDoc = { id: string; data: Record<string, any> };

const count = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export function isInStock(product: Record<string, any> | null | undefined): boolean {
  return count(product?.stock) > 0;
}

/** Visible, in stock and sold at least BEST_SELLERS_MIN_SALES times; best first. */
export function selectBestSellers(docs: RawDoc[]): HomepageProduct[] {
  return docs
    .filter(({ data }) => isProductVisible(data) && isInStock(data) && count(data.sales) >= BEST_SELLERS_MIN_SALES)
    .sort((a, b) => count(b.data.sales) - count(a.data.sales))
    .slice(0, BEST_SELLERS_LIMIT)
    .map(({ id, data }) => ({ ...data, id }));
}

/** The best sellers the homepage actually renders (none when the row is hidden). */
export function displayedBestSellerIds(bestSellers: HomepageProduct[] | undefined): Set<string> {
  if (!bestSellers || bestSellers.length < MIN_PRODUCTS_TO_SHOW_SECTION) return new Set();
  return new Set(bestSellers.map((p) => p.id));
}

/** Visible, in stock, viewed at least TRENDING_MIN_VIEWS times; most-viewed first. */
export function selectTrendingCandidates(docs: RawDoc[]): HomepageProduct[] {
  return docs
    .filter(({ data }) => isProductVisible(data) && isInStock(data) && count(data.views) >= TRENDING_MIN_VIEWS)
    .sort((a, b) => count(b.data.views) - count(a.data.views))
    .map(({ id, data }) => ({ ...data, id }));
}

/** Trending candidates minus anything already shown in Best Sellers, capped. */
export function selectTrending(candidates: HomepageProduct[], excludeIds: Set<string>): HomepageProduct[] {
  return candidates.filter((p) => !excludeIds.has(p.id)).slice(0, TRENDING_LIMIT);
}

/** Admin-featured and visible. Never inferred from sales or views. */
export function selectFeatured(docs: RawDoc[]): HomepageProduct[] {
  return docs
    .filter(({ data }) => data.featured === true && isProductVisible(data))
    .map(({ id, data }) => ({ ...data, id }));
}

export function shouldShowFeatured(featured: HomepageProduct[] | undefined): boolean {
  return !!featured && featured.length >= MIN_FEATURED_TO_SHOW;
}

type Snapshot = { docs: { id: string; data: () => unknown }[] };
const toRaw = (snapshot: Snapshot): RawDoc[] =>
  snapshot.docs.map((d) => ({ id: d.id, data: (d.data() || {}) as Record<string, any> }));

/** Shared by BestSellers and TrendingProducts so both read the same list. */
export const BEST_SELLERS_QUERY_KEY = ["best-sellers"] as const;

export async function fetchBestSellers(): Promise<HomepageProduct[]> {
  const snapshot = await getDocs(
    query(collection(db, "products"), orderBy("sales", "desc"), limit(BEST_SELLERS_CANDIDATES))
  );
  return selectBestSellers(toRaw(snapshot));
}

export async function fetchTrendingCandidates(): Promise<HomepageProduct[]> {
  const snapshot = await getDocs(
    query(collection(db, "products"), orderBy("views", "desc"), limit(TRENDING_CANDIDATES))
  );
  return selectTrendingCandidates(toRaw(snapshot));
}

export async function fetchFeatured(): Promise<HomepageProduct[]> {
  const snapshot = await getDocs(
    query(collection(db, "products"), where("featured", "==", true), limit(FEATURED_CANDIDATES))
  );
  return selectFeatured(toRaw(snapshot));
}
