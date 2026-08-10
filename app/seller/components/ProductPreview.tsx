"use client";

import type { Product } from "@/lib/products/product";

interface ProductPreviewProps {
  product: Product;
  previewImages?: string[];
}

export default function ProductPreview({
  product,
  previewImages = [],
}: ProductPreviewProps) {

  const discount =
    product.mrp > 0
      ? Math.round(
          ((product.mrp - product.sellingPrice) /
            product.mrp) *
            100
        )
      : 0;

  /*
   * Use currently selected images first.
   * If none are selected, use saved product images.
   */
  const images =
    previewImages.length > 0
      ? previewImages
      : product.images && product.images.length > 0
      ? product.images
      : product.thumbnail
      ? [product.thumbnail]
      : [];

  const mainImage = images[0] || "";

  return (
    <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">

      {/* Product Image */}
      <div className="flex h-64 items-center justify-center bg-gray-100">

        {mainImage ? (
          <img
            src={mainImage}
            alt={product.title || "Product"}
            className="h-full w-full object-contain"
          />
        ) : (
          <span className="text-gray-400">
            No Image
          </span>
        )}

      </div>

      {/* Thumbnail Images */}
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto border-b p-3">

          {images.map((image, index) => (
            <img
              key={`${image}-${index}`}
              src={image}
              alt={`Product ${index + 1}`}
              className="h-16 w-16 rounded-lg border object-cover"
            />
          ))}

        </div>
      )}

      {/* Product Details */}
      <div className="p-5">

        {/* Brand */}
        <div className="text-sm text-gray-500">
          {product.brand || "Brand"}
        </div>

        {/* Title */}
        <h3 className="mt-1 text-lg font-bold text-gray-900">
          {product.title || "Product Name"}
        </h3>

        {/* Category */}
        <div className="mt-1 text-sm text-blue-600">
          {product.categoryId || "Category"}
        </div>

        {/* Price */}
        <div className="mt-4 flex items-center gap-3">

          <span className="text-2xl font-bold text-green-600">
            ₹{product.sellingPrice || 0}
          </span>

          {product.mrp > 0 &&
            product.mrp !== product.sellingPrice && (
              <span className="text-sm text-gray-400 line-through">
                ₹{product.mrp}
              </span>
            )}

        </div>

        {/* Discount */}
        {discount > 0 && (
          <div className="mt-2 inline-block rounded-md bg-green-50 px-2 py-1 text-sm font-semibold text-green-700">
            {discount}% OFF
          </div>
        )}

        {/* Stock */}
        <div className="mt-4">

          {product.stock > 0 ? (
            <span className="rounded-md bg-green-50 px-2 py-1 text-sm font-semibold text-green-700">
              In Stock
            </span>
          ) : (
            <span className="rounded-md bg-red-50 px-2 py-1 text-sm font-semibold text-red-600">
              Out of Stock
            </span>
          )}

        </div>

        {/* Rating */}
        <div className="mt-4 text-sm">

          ⭐ {(product.rating ?? 0).toFixed(1)}

          <span className="ml-1 text-gray-500">
            ({product.reviewCount ?? 0} Reviews)
          </span>

        </div>

        {/* Seller */}
        <div className="mt-4 border-t pt-4 text-sm text-gray-500">

          Seller :

          <strong className="ml-1 text-gray-700">
            {product.vendorName || "Vendor"}
          </strong>

        </div>

      </div>

    </div>
  );
}