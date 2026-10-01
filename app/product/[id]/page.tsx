import { cache } from "react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isProductVisible } from "@/lib/products/visibility";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";
import { absoluteUrl, jsonLdString, productJsonLd, truncateText } from "@/lib/seo";
import ProductPageClient from "./ProductPageClient";

// Product page. The page itself is interactive (ProductPageClient); this server
// wrapper exists so each product has real, crawlable metadata, a canonical URL,
// schema.org Product data and an honest 404:
//   * metadata and JSON-LD come ONLY from the product's own public fields — no
//     rating, review or offer is invented, and availability reflects stored stock;
//   * a product that does not exist, or is not customer-visible (blocked, pending
//     review, rejected, archived — lib/products/visibility.ts), is a real 404;
//   * if the server cannot read the product at all (e.g. Admin credentials
//     unavailable) it is NOT treated as missing — the client page renders as it
//     always did and the metadata falls back to the site default.
type Loaded =
  | { kind: "ok"; product: ReturnType<typeof toLegacyProduct> }
  | { kind: "missing" }
  | { kind: "unknown" };

const load = cache(async (rawId: string): Promise<Loaded> => {
  const id = (rawId || "").trim();
  if (!id || id.length > 200 || id.includes("/")) return { kind: "missing" };
  try {
    const snap = await getAdminDb().collection("products").doc(id).get();
    if (!snap.exists) return { kind: "missing" };
    const data = snap.data() as Record<string, unknown>;
    if (!isProductVisible(data)) return { kind: "missing" };
    return { kind: "ok", product: toLegacyProduct(snap.id, data) };
  } catch (error) {
    console.error("product page: server read failed:", error);
    return { kind: "unknown" };
  }
});

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await load(id);
  if (result.kind === "missing") return { title: "Product not found", robots: { index: false, follow: false } };
  if (result.kind !== "ok") return {};

  const { product } = result;
  const title = String(product.name || "Product");
  const description =
    truncateText(product.description) || `Buy ${title} online on YOMICO from a trusted seller.`;
  const url = `/product/${encodeURIComponent(product.id)}`;
  const image = product.image ? [{ url: product.image, alt: title }] : undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, siteName: "YOMICO", type: "website", ...(image ? { images: image } : {}) },
    twitter: { card: image ? "summary_large_image" : "summary", title, description, ...(image ? { images: [image[0].url] } : {}) },
  };
}

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await load(id);
  if (result.kind === "missing") notFound();

  if (result.kind !== "ok") return <ProductPageClient />;

  const { product } = result;
  const price = Number(product.price);
  const jsonLd =
    Number.isFinite(price) && price > 0
      ? productJsonLd({
          id: product.id,
          name: String(product.name || "Product"),
          description: truncateText(product.description, 500) || undefined,
          images: [product.image, ...(Array.isArray(product.images) ? product.images : [])]
            .filter((u): u is string => typeof u === "string" && u.length > 0)
            .map((u) => absoluteUrl(u))
            .slice(0, 6),
          brand: typeof product.brand === "string" && product.brand ? product.brand : undefined,
          price,
          inStock: Number(product.stock) > 0,
        })
      : null;

  return (
    <>
      {jsonLd && (
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      )}
      <ProductPageClient />
    </>
  );
}
