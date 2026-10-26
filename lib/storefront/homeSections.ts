// Data loaders for the homepage product sections (Trending, Best Sellers,
// Featured, Recommended, the category CollectionStrip and the Best Deals
// banner). Moved out of the components unchanged except for one thing: every
// read is getDocsFromServer, not getDocs.
//
// Why: the client uses Firestore's default memory cache. When the backend is
// unreachable or misconfigured (e.g. the Firestore API disabled on a Preview
// project), getDocs does NOT reject — it resolves with an EMPTY snapshot from
// that cache (metadata.fromCache === true), which the sections rendered as a
// genuinely empty catalogue. getDocsFromServer resolves only with an
// authoritative server result and rejects with code "unavailable" otherwise,
// so an outage reaches each section's existing error/Retry state while a real
// empty result still reads as empty. Verified against the Firestore emulator
// in scripts/test/home-sections/run.mts.
//
// Scoped to the homepage sections (their only consumer); other screens keep
// their own reads.
import {
  collection,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  where,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { findNodeByName, isTopLevelCategory } from "@/lib/catalog";
import { isProductVisible } from "@/lib/products/visibility";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";
import { meetsMinimumDiscount } from "@/lib/storefront/searchFilters";
import { getVisibleCatalog, type CatalogProduct } from "@/lib/storefront/catalogScan";

const TRENDING_LIMIT = 8;
const BEST_SELLERS_LIMIT = 12;
const FEATURED_LIMIT = 8;
// Candidate pool for the Featured fallback ranking — bounded regardless of
// catalog size, and large enough to have real active/in-stock products left
// after filtering.
const FALLBACK_CANDIDATE_LIMIT = 30;

export async function fetchTrendingProducts() {
  // Over-fetch and filter hidden products (lib/products/visibility.ts)
  // BEFORE slicing to the display size.
  const q = query(
    collection(db, "products"),
    orderBy("views", "desc"),
    limit(TRENDING_LIMIT * 4)
  );
  const snapshot = await getDocsFromServer(q);

  return snapshot.docs
    .filter((doc) => isProductVisible(doc.data()))
    .slice(0, TRENDING_LIMIT)
    .map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));
}

// Sorted by `sales`, a real, live-tracked field — checkout increments it on
// every purchase.
export async function fetchBestSellers() {
  // Over-fetch, then drop products customers must not see (pending review,
  // rejected, blocked — lib/products/visibility.ts) BEFORE slicing, so the
  // row still fills when some top sellers are hidden.
  const q = query(
    collection(db, "products"),
    orderBy("sales", "desc"),
    limit(BEST_SELLERS_LIMIT * 4)
  );
  const snapshot = await getDocsFromServer(q);

  return snapshot.docs
    .filter((doc) => isProductVisible(doc.data()))
    .slice(0, BEST_SELLERS_LIMIT)
    .map((doc) => ({
      ...doc.data(),
      id: doc.id,
    }));
}

export type FeaturedProduct = {
  id: string;
  name: string;
  price: number;
  image: string;
  stock: number;
  vendorId?: string;
};

function toFeaturedProduct(doc: QueryDocumentSnapshot): FeaturedProduct {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.shortTitle || data.title || data.name || "",
    price: Number(
      data.sellingPrice ??
      data.price ??
      0
    ),
    image:
      data.thumbnail ||
      data.images?.[0] ||
      data.image ||
      "",
    stock: Number(data.stock || 0),
    vendorId: data.vendorId,
  };
}

export async function fetchFeaturedProducts(): Promise<FeaturedProduct[]> {
  // Admin-curated Featured products always take priority — set via the real
  // ★ Featured toggle in app/admin/products, untouched here.
  const featuredQuery = query(
    collection(db, "products"),
    where("featured", "==", true),
    limit(FEATURED_LIMIT * 4)
  );
  const featuredSnapshot = await getDocsFromServer(featuredQuery);

  // A featured product that is pending review, rejected or blocked is never
  // shown (lib/products/visibility.ts); filtered before slicing.
  const featuredVisible = featuredSnapshot.docs
    .filter((doc) => isProductVisible(doc.data()))
    .slice(0, FEATURED_LIMIT);

  if (featuredVisible.length > 0) return featuredVisible.map(toFeaturedProduct);

  // No product has ever been marked Featured yet — rather than show an empty
  // section, fall back to the best-performing active, in-stock products.
  // Single-field orderBy (same shape as fetchBestSellers) needs no new
  // composite index; the active/in-stock filter and the views/rating blend
  // into the ranking both happen client-side after the fetch instead, so this
  // stays compatible with the indexes already deployed. The moment an admin
  // marks a real product Featured, this whole branch stops running.
  const fallbackQuery = query(
    collection(db, "products"),
    orderBy("sales", "desc"),
    limit(FALLBACK_CANDIDATE_LIMIT)
  );
  const fallbackSnapshot = await getDocsFromServer(fallbackQuery);

  return fallbackSnapshot.docs
    .filter((doc) => {
      const data = doc.data();
      return isProductVisible(data) && Number(data.stock || 0) > 0;
    })
    .map((doc) => {
      const data = doc.data();
      const score =
        Number(data.sales || 0) * 3 +
        Number(data.views || 0) +
        Number(data.rating || 0) * 10;
      return { doc, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, FEATURED_LIMIT)
    .map(({ doc }) => toFeaturedProduct(doc));
}

/**
 * Newest visible products of one catalog category (RecommendedProducts shows
 * 4, CollectionStrip 12). Over-fetches 4x so hidden products (pending /
 * rejected / blocked) are dropped BEFORE slicing.
 */
export async function fetchCategoryProducts(category: string, count: number) {
  const node = findNodeByName(category);
  if (!node) return [];

  const q = query(
    collection(db, "products"),
    isTopLevelCategory(node)
      ? where("categoryId", "==", node.id)
      : where("subCategoryId", "==", node.id),
    orderBy("createdAt", "desc"),
    limit(count * 4)
  );
  const snapshot = await getDocsFromServer(q);

  return snapshot.docs
    .filter((doc) => isProductVisible(doc.data()))
    .slice(0, count)
    .map((doc) => toLegacyProduct(doc.id, doc.data()));
}

// Best Deals links to /search?minDiscount=DEALS_MIN_DISCOUNT and promises
// "40% or more off MRP".
export const DEALS_MIN_DISCOUNT = 40;
export const DEALS_HREF = `/search?minDiscount=${DEALS_MIN_DISCOUNT}`;

/**
 * Whether the deals page would show anything — the same discount rule
 * app/search/page.jsx applies for ?minDiscount=, over visible products.
 */
export function hasQualifyingDeal(products: CatalogProduct[]): boolean {
  return products.some(({ id, data }) =>
    meetsMinimumDiscount(toLegacyProduct(id, data), DEALS_MIN_DISCOUNT)
  );
}

/** Reads the shared visible-catalog scan (cached; HomePage already runs it). */
export async function fetchHasQualifyingDeals(): Promise<boolean> {
  const { products } = await getVisibleCatalog();
  return hasQualifyingDeal(products);
}
