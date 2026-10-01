// Shared SEO helpers (server- and client-safe, no I/O).
export const SITE_URL = "https://yomico.in";
export const SITE_NAME = "YOMICO";

export function absoluteUrl(pathOrUrl: string): string {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_URL}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

/** Plain-text, whitespace-collapsed, cut at a word boundary. */
export function truncateText(input: unknown, max = 160): string {
  const text = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** JSON-LD safe to inline in a <script> tag (no </script> breakout). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/**
 * schema.org Product built ONLY from real product fields. No rating, review
 * count or offer is ever invented: aggregateRating is omitted entirely, and the
 * availability reflects the stored stock.
 */
export function productJsonLd(input: {
  id: string;
  name: string;
  description?: string;
  images: string[];
  brand?: string;
  price: number;
  inStock: boolean;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    ...(input.description ? { description: input.description } : {}),
    ...(input.images.length ? { image: input.images.map(absoluteUrl) } : {}),
    ...(input.brand ? { brand: { "@type": "Brand", name: input.brand } } : {}),
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/product/${encodeURIComponent(input.id)}`),
      priceCurrency: "INR",
      price: input.price,
      availability: input.inStock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
    },
  };
}
