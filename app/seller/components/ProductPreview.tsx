"use client";
import type { Product } from "@/lib/products/product";
interface ProductPreviewProps {
  product: Product;
}
export default function ProductPreview({
  product,
}: ProductPreviewProps) {
  const discount =
    product.mrp > 0
      ? Math.round(
          ((product.mrp -
            product.sellingPrice) /
            product.mrp) *
            100
        )
      : 0;
  return (
    <div className="mx-auto max-w-sm overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
      {/* Product Image */}
      <div className="h-64 bg-gray-100">
        {product.thumbnail ? (
          <img
            src={product.thumbnail}
            alt={product.title}
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-gray-400">
            No Image
          </div>
        )}
      </div>
      {/* Product Details */}
      <div className="p-5">
        {/* Brand */}
        <p className="text-sm text-gray-500">
          {product.brand || "Brand"}
        </p>
        {/* Title */}
        <h2 className="mt-2 line-clamp-2 text-lg font-bold">
          {product.title ||
            "Product Name"}
        </h2>
        {/* Category */}
        <p className="mt-2 text-sm text-blue-600">
          {product.categoryId ||
            "Category"}
        </p>
        {/* Price */}
        <div className="mt-4 flex items-center gap-3">
          <span className="text-2xl font-bold text-green-700">
            ₹
            {product.sellingPrice || 0}
          </span>
          {product.mrp > 0 && (
            <span className="text-gray-400 line-through">
              ₹{product.mrp}
            </span>
          )}
        </div>
        {/* Discount */}
        {discount > 0 && (
          <p className="mt-2 text-sm font-semibold text-green-600">
            {discount}% OFF
          </p>
        )}
        {/* Stock */}
        <div className="mt-4">
          {product.stock > 0 ? (
            <span className="rounded bg-green-100 px-3 py-1 text-sm text-green-700">
              In Stock
            </span>
          ) : (
            <span className="rounded bg-red-100 px-3 py-1 text-sm text-red-700">
              Out of Stock
            </span>
          )}
        </div>
        {/* Rating */}
        <div className="mt-4 flex items-center gap-2">
          ⭐
         <span>
  {(product.rating ?? 0).toFixed(1)}
</span>S

          <span className="text-gray-500">

            (

            {product.reviewCount}

            Reviews)

          </span>

        </div>

        {/* Seller */}

        <div className="mt-4 border-t pt-4 text-sm text-gray-500">

          Seller :

          <strong>

            {" "}

            {product.vendorName ||

              "Vendor"}

          </strong>

        </div>

      </div>

    </div>

  );

}