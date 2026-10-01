import type { MetadataRoute } from "next";
import { catalogTree } from "@/lib/catalog/catalogTree";
import { findNodeByName } from "@/lib/catalog/categoryUtils";
import { getAllBlogPosts } from "@/lib/blogPosts";
import { isProductVisible } from "@/lib/products/visibility";
import { SELLER_NUMBER_PATTERN } from "@/lib/storefront/publicStorefront";
import { SITE_URL } from "@/lib/seo";

// Public, indexable URLs only: home, the catalogue categories, public
// information pages, blog posts, and — read through the Admin SDK — customer-
// visible products and Approved stores. Private areas (account, cart, staff
// consoles, auth) never appear here (and are disallowed in robots.ts).
//
// Regenerated at most hourly. If the server cannot read Firestore (no Admin
// credentials, transient failure) the static part is still served — a partial
// sitemap is better than none, and the next regeneration will include the rest.
export const revalidate = 3600;

const MAX_PRODUCTS = 5000;

const STATIC_PAGES: Array<{ path: string; priority: number }> = [
  { path: "/store", priority: 0.9 },
  { path: "/about", priority: 0.5 },
  { path: "/contact", priority: 0.5 },
  { path: "/faq", priority: 0.5 },
  { path: "/blog", priority: 0.5 },
  { path: "/careers", priority: 0.3 },
  { path: "/press", priority: 0.3 },
  { path: "/sell", priority: 0.6 },
  { path: "/shipping-policy", priority: 0.3 },
  { path: "/return-refund", priority: 0.3 },
  { path: "/cancellation-policy", priority: 0.3 },
  { path: "/pay-at-delivery", priority: 0.3 },
  { path: "/privacy-policy", priority: 0.2 },
  { path: "/terms", priority: 0.2 },
  { path: "/cookie-policy", priority: 0.2 },
  { path: "/seller-agreement", priority: 0.2 },
  { path: "/seller-code", priority: 0.2 },
];

function categoryEntries(): MetadataRoute.Sitemap {
  const nodes = catalogTree.flatMap((top) => [top, ...(top.children ?? [])]);
  return nodes
    // Only names the category page actually resolves to this node.
    .filter((node) => findNodeByName(node.name)?.id === node.id)
    .map((node) => ({
      url: `${SITE_URL}/category/${encodeURIComponent(node.name)}`,
      priority: node.level === 1 ? 0.8 : 0.6,
    }));
}

async function dynamicEntries(): Promise<MetadataRoute.Sitemap> {
  const entries: MetadataRoute.Sitemap = [];
  try {
    // Imported lazily so a missing Admin configuration can only affect THIS part.
    const { getAdminDb } = await import("@/lib/firebaseAdmin");
    const db = getAdminDb();

    const products = await db.collection("products").limit(MAX_PRODUCTS).get();
    for (const doc of products.docs) {
      const data = doc.data() as Record<string, unknown>;
      if (!isProductVisible(data)) continue;
      const updated = (data.updatedAt as { toDate?: () => Date } | undefined)?.toDate?.();
      entries.push({
        url: `${SITE_URL}/product/${encodeURIComponent(doc.id)}`,
        ...(updated ? { lastModified: updated } : {}),
        priority: 0.7,
      });
    }

    const vendors = await db.collection("vendors").where("status", "==", "Approved").get();
    for (const doc of vendors.docs) {
      const sellerNumber = (doc.data() as { sellerNumber?: unknown }).sellerNumber;
      if (typeof sellerNumber === "string" && SELLER_NUMBER_PATTERN.test(sellerNumber)) {
        entries.push({ url: `${SITE_URL}/store/${sellerNumber}`, priority: 0.6 });
      }
    }
  } catch (error) {
    console.error("sitemap: dynamic URLs unavailable, serving the static set:", error);
  }
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  return [
    { url: SITE_URL, priority: 1 },
    ...STATIC_PAGES.map(({ path, priority }) => ({ url: `${SITE_URL}${path}`, priority })),
    ...categoryEntries(),
    ...getAllBlogPosts().map((post) => ({ url: `${SITE_URL}/blog/${post.slug}`, priority: 0.4 })),
    ...(await dynamicEntries()),
  ];
}
