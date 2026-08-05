// ==========================================
// YOMICO Marketplace
// lib/products/helper.ts
// ==========================================

import type { Product } from "./product";

// ------------------------------------------
// Generate Product Slug
// ------------------------------------------

export function generateSlug(title: string): string {

  return title
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");

}

// ------------------------------------------
// Generate SKU
// ------------------------------------------

export function generateSKU(

  category: string,

  brand: string

): string {

  const prefix = category
    .substring(0, 3)
    .toUpperCase();

  const brandCode = brand
    .substring(0, 3)
    .toUpperCase();

  const random = Math.floor(
    100000 + Math.random() * 900000
  );

  return `${prefix}-${brandCode}-${random}`;

}

// ------------------------------------------
// Discount Percentage
// ------------------------------------------

export function getDiscountPercentage(

  mrp: number,

  sellingPrice: number

): number {

  if (mrp <= 0) return 0;

  return Math.round(
    ((mrp - sellingPrice) / mrp) * 100
  );

}

// ------------------------------------------
// Stock Label
// ------------------------------------------

export function getStockLabel(

  stock: number

): string {

  if (stock <= 0)
    return "Out of Stock";

  if (stock <= 5)
    return "Low Stock";

  return "In Stock";

}

// ------------------------------------------
// Product URL
// ------------------------------------------

export function getProductUrl(

  product: Product

): string {

  return `/product/${product.slug}`;

}

// ------------------------------------------
// Main Image
// ------------------------------------------

export function getMainImage(

  product: Product

): string {

  if (product.thumbnail)
    return product.thumbnail;

  if (product.images.length > 0)
    return product.images[0];

  return "/placeholder-product.png";

}

// ------------------------------------------
// Has Discount
// ------------------------------------------

export function hasDiscount(

  product: Product

): boolean {

  return product.mrp > product.sellingPrice;

}

// ------------------------------------------
// Is Available
// ------------------------------------------

export function isAvailable(

  product: Product

): boolean {

  return product.active &&
         product.stock > 0;

}