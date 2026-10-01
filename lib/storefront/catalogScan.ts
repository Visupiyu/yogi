// Shared, paged, cached read of the customer-visible catalog (client only).
//
// Firestore has no substring / full-text search, so storefront text search and
// the Navbar's search suggestions have to read product documents and match them
// in the browser. That was done three different ways — search capped the read at
// limit(300) (so any product outside an arbitrary first 300 could never be
// found, whatever the query), while the Navbar and the homepage each read the
// WHOLE collection, the Navbar once per debounced keystroke.
//
// This module is the one place that does it now:
//   * the collection is read in pages (PAGE_SIZE) ordered by document id until it
//     is exhausted, so there is no hidden result ceiling — only a very large
//     safety stop (MAX_PRODUCTS) that is REPORTED as `truncated`, never silent;
//   * the visible products are kept in memory for CACHE_MS and concurrent callers
//     share one in-flight read, so typing in the Navbar, searching, and the
//     homepage share one scan instead of repeating it;
//   * a failed read is never cached and is rethrown so callers can show an error.
//
// A proper fix at larger catalog sizes is a dedicated search index (Algolia /
// Typesense / a keyword-token field queried with array-contains) — a separate
// initiative; this keeps correctness without inventing one.
import {
  collection,
  documentId,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  type QueryDocumentSnapshot,
  type QuerySnapshot,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { isStorefrontVisible } from "@/lib/products/legacyDisplay";

export const CATALOG_PAGE_SIZE = 300;
export const CATALOG_MAX_PRODUCTS = 10000;
const CACHE_MS = 2 * 60 * 1000;

export type CatalogProduct = { id: string; data: Record<string, any> };
export type CatalogScan = { products: CatalogProduct[]; truncated: boolean };

let cached: { at: number; scan: CatalogScan } | null = null;
let inFlight: Promise<CatalogScan> | null = null;

async function readCatalog(): Promise<CatalogScan> {
  const products: CatalogProduct[] = [];
  let cursor: QueryDocumentSnapshot | null = null;
  let scanned = 0;
  let truncated = false;

  for (;;) {
    const page: QuerySnapshot = await getDocs(
      cursor
        ? query(collection(db, "products"), orderBy(documentId()), startAfter(cursor), limit(CATALOG_PAGE_SIZE))
        : query(collection(db, "products"), orderBy(documentId()), limit(CATALOG_PAGE_SIZE))
    );

    page.forEach((docSnap) => {
      const data = docSnap.data();
      // Blocked / pending / rejected products are never customer-visible.
      if (isStorefrontVisible(data)) products.push({ id: docSnap.id, data });
    });

    scanned += page.size;
    if (page.size < CATALOG_PAGE_SIZE) break;
    if (scanned >= CATALOG_MAX_PRODUCTS) {
      truncated = true;
      break;
    }
    cursor = page.docs[page.docs.length - 1];
  }

  return { products, truncated };
}

/** All customer-visible products (cached ~2 min, shared between callers). */
export function getVisibleCatalog(): Promise<CatalogScan> {
  if (cached && Date.now() - cached.at < CACHE_MS) return Promise.resolve(cached.scan);
  if (inFlight) return inFlight;

  inFlight = readCatalog()
    .then((scan) => {
      cached = { at: Date.now(), scan };
      return scan;
    })
    .finally(() => {
      inFlight = null;
    });
  return inFlight;
}
