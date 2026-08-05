// ==========================================
// YOMICO Marketplace
// lib/products/recommendation.ts
// ==========================================

import type { Product } from "./product";

// ------------------------------------------
// Related Products
// ------------------------------------------

export function getRelatedProducts(

  products: Product[],

  currentProduct: Product,

  limit: number = 8

): Product[] {

  return products
    .filter(

      product =>

        product.id !== currentProduct.id &&

        product.leafCategoryId === currentProduct.leafCategoryId

    )
    .slice(0, limit);

}

// ------------------------------------------
// Same Brand
// ------------------------------------------

export function getSameBrandProducts(

  products: Product[],

  currentProduct: Product,

  limit: number = 8

): Product[] {

  return products
    .filter(

      product =>

        product.id !== currentProduct.id &&

        product.brand === currentProduct.brand

    )
    .slice(0, limit);

}

// ------------------------------------------
// Best Sellers
// ------------------------------------------

export function getBestSellingProducts(

  products: Product[],

  limit: number = 10

): Product[] {

  return [...products]

    .sort(

      (a, b) =>

        (b.sales ?? 0) -

        (a.sales ?? 0)

    )

    .slice(0, limit);

}

// ------------------------------------------
// Featured Products
// ------------------------------------------

export function getFeaturedProducts(

  products: Product[],

  limit: number = 10

): Product[] {

  return products

    .filter(

      product => product.featured

    )

    .slice(0, limit);

}

// ------------------------------------------
// Top Rated Products
// ------------------------------------------

export function getTopRatedProducts(

  products: Product[],

  limit: number = 10

): Product[] {

  return [...products]

    .sort(

      (a, b) =>

        (b.rating ?? 0) -

        (a.rating ?? 0)

    )

    .slice(0, limit);

}

// ------------------------------------------
// New Arrivals
// ------------------------------------------

export function getNewArrivals(

  products: Product[],

  limit: number = 10

): Product[] {

  return [...products]

    .sort(

      (a, b) =>

        new Date(b.createdAt).getTime() -

        new Date(a.createdAt).getTime()

    )

    .slice(0, limit);

}

// ------------------------------------------
// In Stock Products
// ------------------------------------------

export function getAvailableProducts(

  products: Product[]

): Product[] {

  return products.filter(

    product =>

      product.active &&

      product.stock > 0

  );

}