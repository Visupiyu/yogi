import type { Metadata } from "next";
import { findNodeByName } from "@/lib/catalog/categoryUtils";
import { CATEGORY_SEO } from "@/lib/catalog/categorySEO";
import CategoryPageClient from "./CategoryPageClient";

// Category listing. Interactive client page + server metadata. The title and
// description come from the catalog tree (and the curated CATEGORY_SEO copy when
// one exists for the node); an unknown name keeps the page as it was (it shows its
// own "no products" state) but is kept out of the index.
function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ name: string }> }): Promise<Metadata> {
  const { name: raw } = await params;
  const name = decode(raw);
  const node = findNodeByName(name);
  if (!node) return { title: "Category", robots: { index: false, follow: true } };

  const seo = CATEGORY_SEO[node.id];
  const title = seo?.title ? seo.title.replace(/\s*\|\s*YOMICO\s*$/i, "") : `${node.name} – Shop Online`;
  const description = seo?.description || `Shop ${node.name} online on YOMICO from trusted sellers across India.`;
  const url = `/category/${encodeURIComponent(node.name)}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "YOMICO", type: "website" },
  };
}

export default function CategoryPage() {
  return <CategoryPageClient />;
}
