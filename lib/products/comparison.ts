// ==========================================
// YOMICO Marketplace
// lib/products/comparison.ts
// ==========================================

import type { Product } from "./product";

// ------------------------------------------
// Product Comparison Result
// ------------------------------------------

export interface ProductComparison {

  left: Product;

  right: Product;

  differences: string[];

}

// ------------------------------------------
// Compare Products
// ------------------------------------------

export function compareProducts(

  left: Product,

  right: Product

): ProductComparison {

  const differences: string[] = [];

  if (left.brand !== right.brand)
    differences.push("Brand");

  if (left.sellingPrice !== right.sellingPrice)
    differences.push("Price");

  if (left.mrp !== right.mrp)
    differences.push("MRP");

  if (left.rating !== right.rating)
    differences.push("Rating");

  if (left.stock !== right.stock)
    differences.push("Stock");

  if (left.warranty !== right.warranty)
    differences.push("Warranty");

  if (left.categoryId !== right.categoryId)
    differences.push("Category");

  return {

    left,

    right,

    differences

  };

}

// ------------------------------------------
// Can Compare
// ------------------------------------------

export function canCompare(

  left: Product,

  right: Product

): boolean {

  return left.categoryId === right.categoryId;

}

// ------------------------------------------
// Common Specifications
// ------------------------------------------

export function getCommonSpecifications(

  left: Product,

  right: Product

): string[] {

  const keys1 = Object.keys(left.specifications);

  const keys2 = Object.keys(right.specifications);

  return keys1.filter(

    key => keys2.includes(key)

  );

}

// ------------------------------------------
// Different Specifications
// ------------------------------------------

export function getDifferentSpecifications(

  left: Product,

  right: Product

): string[] {

  return getCommonSpecifications(

    left,

    right

  ).filter(

    key =>

      left.specifications[key] !==

      right.specifications[key]

  );

}