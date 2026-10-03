// The ONE product-image fallback rule. Dependency-free, so client components,
// server code and tests share it.
//
// Before this, ~20 surfaces each wrote `src={item.image || "/no-image.png"}` —
// and /no-image.png never existed in /public, so every "fallback" was itself a
// broken image, while an image URL that failed to LOAD showed the browser's
// broken-image icon. The placeholder below is a generic, brand-neutral graphic
// ("Image coming soon"); no product photography is ever generated.
export const PRODUCT_IMAGE_PLACEHOLDER = "/product-placeholder.svg";

/** A src worth trying: a non-empty http(s) URL or a site-relative path. */
export function isUsableImageSrc(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const v = value.trim();
  if (!v || v === "undefined" || v === "null") return false;
  return /^https?:\/\//i.test(v) || v.startsWith("/") || v.startsWith("data:image/") || v.startsWith("blob:");
}

type ImageFields = {
  thumbnail?: unknown;
  image?: unknown;
  images?: unknown;
};

/**
 * The image to show for a product/line, in the precedence the catalog already
 * uses (thumbnail → image → images[0]), skipping empty/invalid values; the
 * placeholder when nothing usable exists. Accepts a plain src string too.
 */
export function productImageSrc(source: ImageFields | string | null | undefined): string {
  if (typeof source === "string") return isUsableImageSrc(source) ? source.trim() : PRODUCT_IMAGE_PLACEHOLDER;
  if (!source) return PRODUCT_IMAGE_PLACEHOLDER;
  const candidates: unknown[] = [source.thumbnail, source.image];
  if (Array.isArray(source.images)) candidates.push(...source.images);
  const found = candidates.find(isUsableImageSrc);
  return typeof found === "string" ? found.trim() : PRODUCT_IMAGE_PLACEHOLDER;
}

/** Meaningful alt text: the product name, never an empty/"undefined" string. */
export function productImageAlt(name: unknown): string {
  return typeof name === "string" && name.trim() ? name.trim() : "Product image";
}
