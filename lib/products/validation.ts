// ==========================================
// YOMICO Marketplace
// lib/products/validation.ts
// ==========================================

import type { Product } from "./product";

// ------------------------------------------
// Validation Result
// ------------------------------------------

export interface ValidationResult {

  valid: boolean;

  errors: string[];

}

// ------------------------------------------
// Validate Product
// ------------------------------------------

export function validateProduct(
  product: Product
): ValidationResult {

  const errors: string[] = [];

  // -------------------------
  // Basic Information
  // -------------------------

  if (!product.title?.trim())
    errors.push("Product title is required.");

  if (!product.description?.trim())
    errors.push("Product description is required.");

  if (!product.brand?.trim())
    errors.push("Brand is required.");

  if (!product.categoryId)
    errors.push("Category is required.");

  if (!product.vendorId)
    errors.push("Vendor is required.");

  // -------------------------
  // Pricing
  // -------------------------

  if (product.sellingPrice <= 0)
    errors.push("Selling price must be greater than zero.");

  if (product.mrp <= 0)
    errors.push("MRP must be greater than zero.");

  if (product.sellingPrice > product.mrp)
    errors.push("Selling price cannot be greater than MRP.");

  // -------------------------
  // Inventory
  // -------------------------

  if (product.stock < 0)
    errors.push("Stock cannot be negative.");

  // -------------------------
  // Images
  // -------------------------

  if (!product.thumbnail)
    errors.push("Thumbnail image is required.");

  if (!product.images || product.images.length === 0)
    errors.push("At least one product image is required.");

  if (product.images.length > 5)
    errors.push("Maximum 5 product images are allowed.");

  // -------------------------
  // SEO
  // -------------------------

  if (!product.slug)
    errors.push("Product slug is required.");

  // -------------------------
  // Return Result
  // -------------------------

  return {

    valid: errors.length === 0,

    errors

  };

}

// ------------------------------------------
// Helper
// ------------------------------------------

export function isProductValid(
  product: Product
): boolean {

  return validateProduct(product).valid;

}