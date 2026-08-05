// ==========================================
// YOMICO Marketplace
// lib/products/sorting.ts
// ==========================================

import type { Product } from "./product";

// ------------------------------------------
// Sort Type
// ------------------------------------------

export type ProductSortOption =

  | "featured"
  | "newest"
  | "oldest"
  | "priceLowToHigh"
  | "priceHighToLow"
  | "discount"
  | "rating"
  | "bestSelling"
  | "mostViewed"
  | "nameAZ"
  | "nameZA";

// ------------------------------------------
// Sort Products
// ------------------------------------------

export function sortProducts(

  products: Product[],

  sortBy: ProductSortOption

): Product[] {

  const sorted = [...products];

  switch (sortBy) {

    case "featured":

      return sorted.sort(

        (a, b) => Number(b.featured) - Number(a.featured)

      );

    case "newest":

      return sorted.sort(

        (a, b) =>

          new Date(b.createdAt).getTime() -

          new Date(a.createdAt).getTime()

      );

    case "oldest":

      return sorted.sort(

        (a, b) =>

          new Date(a.createdAt).getTime() -

          new Date(b.createdAt).getTime()

      );

    case "priceLowToHigh":

      return sorted.sort(

        (a, b) =>

          a.sellingPrice - b.sellingPrice

      );

    case "priceHighToLow":

      return sorted.sort(

        (a, b) =>

          b.sellingPrice - a.sellingPrice

      );

    case "discount":

      return sorted.sort(

        (a, b) =>

          (b.discount ?? 0) -

          (a.discount ?? 0)

      );

    case "rating":

      return sorted.sort(

        (a, b) =>

          (b.rating ?? 0) -

          (a.rating ?? 0)

      );

    case "bestSelling":

      return sorted.sort(

        (a, b) =>

          (b.sales ?? 0) -

          (a.sales ?? 0)

      );

    case "mostViewed":

      return sorted.sort(

        (a, b) =>

          (b.views ?? 0) -

          (a.views ?? 0)

      );

    case "nameAZ":

      return sorted.sort(

        (a, b) =>

          a.title.localeCompare(b.title)

      );

    case "nameZA":

      return sorted.sort(

        (a, b) =>

          b.title.localeCompare(a.title)

      );

    default:

      return sorted;

  }

}