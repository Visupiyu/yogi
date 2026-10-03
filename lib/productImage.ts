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

/**
 * Whether next/image may OPTIMISE this src: a site path, or a host listed in
 * next.config.ts images.remotePatterns (Firebase Storage; the Storage emulator
 * in local emulator mode). next/image throws for any other host — which took
 * down the whole product page when a product carried an image URL from
 * elsewhere — so those are rendered `unoptimized` (served as-is) instead.
 */
export function isOptimizableImageSrc(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    if (url.protocol === "https:" && url.hostname === "firebasestorage.googleapis.com") return true;
    return (
      process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true" &&
      url.protocol === "http:" && url.hostname === "127.0.0.1" && url.port === "9199" && url.pathname.startsWith("/v0/b/")
    );
  } catch {
    return false;
  }
}
