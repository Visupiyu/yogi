// ==========================================
// YOMICO Marketplace
// lib/products/search.ts
// ==========================================

import type { Product } from "./product";

// ------------------------------------------
// Normalize Text
// ------------------------------------------

export function normalizeText(text: string): string {

  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ");

}

// ------------------------------------------
// Search Products
// ------------------------------------------

export function searchProducts(

  products: Product[],

  query: string

): Product[] {

  if (!query.trim()) return products;

  const keyword = normalizeText(query);

  return products.filter((product) => {

    const searchable = [

      product.title,

      product.shortTitle ?? "",

      product.description,

      product.brand,

      product.model ?? "",

      ...(product.keywords ?? [])

    ]
      .join(" ")
      .toLowerCase();

    return searchable.includes(keyword);

  });

}

// ------------------------------------------
// Filter by Brand
// ------------------------------------------

export function filterByBrand(

  products: Product[],

  brand: string

): Product[] {

  return products.filter(

    (product) =>

      product.brand.toLowerCase() ===

      brand.toLowerCase()

  );

}

// ------------------------------------------
// Filter by Category
// ------------------------------------------

export function filterByCategory(

  products: Product[],

  categoryId: string

): Product[] {

  return products.filter(

    (product) =>

      product.categoryId === categoryId

  );

}

// ------------------------------------------
// Search Suggestions
// ------------------------------------------

export function getSearchSuggestions(

  products: Product[],

  query: string,

  limit: number = 10

): string[] {

  const keyword = normalizeText(query);

  const suggestions = new Set<string>();

  products.forEach((product) => {

    if (

      normalizeText(product.title).includes(keyword)

    ) {

      suggestions.add(product.title);

    }

  });

  return [...suggestions].slice(0, limit);

}