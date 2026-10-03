"use client";

import { useEffect, useState, type ImgHTMLAttributes } from "react";
import { PRODUCT_IMAGE_PLACEHOLDER, productImageAlt, productImageSrc } from "@/lib/productImage";

// The shared product image (lib/productImage.ts). Missing, empty and invalid
// sources render the placeholder; a source that fails to LOAD swaps to the
// placeholder once (never loops). Alt text stays the product name, so the
// placeholder is still announced as that product.
type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "alt"> & {
  /** A src string, or a product/line object (thumbnail → image → images[0]). */
  src: string | { thumbnail?: unknown; image?: unknown; images?: unknown } | null | undefined;
  /** Product name (used as alt text). */
  alt: string | null | undefined;
};

export default function ProductImage({ src, alt, onError, loading = "lazy", ...rest }: Props) {
  const resolved = productImageSrc(src);
  const [current, setCurrent] = useState(resolved);

  // A new product (or image) for the same element starts fresh.
  useEffect(() => {
    setCurrent(resolved);
  }, [resolved]);

  return (
    // A plain <img>: product images come from seller uploads on any host, and
    // next/image would throw for a host outside next.config's remotePatterns.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      {...rest}
      src={current}
      // alt="" stays decorative (the name is printed right beside the image);
      // anything else falls back to a meaningful name.
      alt={alt === "" ? "" : productImageAlt(alt)}
      loading={loading}
      data-placeholder={current === PRODUCT_IMAGE_PLACEHOLDER ? "true" : undefined}
      onError={(event) => {
        if (current !== PRODUCT_IMAGE_PLACEHOLDER) setCurrent(PRODUCT_IMAGE_PLACEHOLDER);
        onError?.(event);
      }}
    />
  );
}
