// lib/products/product.ts
export interface ProductVariant {
  id: string;

  attributes: Record<string, string>;

  stock: number;

  price: number;
}
export interface Product {

  // Identity
  id: string;
  sku: string;
  slug: string;

  // Category
  categoryId: string;
  subCategoryId?: string;
  leafCategoryId: string;

  // Basic Information
  title: string;
  shortTitle?: string;
  description: string;
  brand: string;
  model?: string;

  // Pricing
  mrp: number;
  sellingPrice: number;
  costPrice?: number;
  discount?: number;
  currency: string;

  // Inventory
stock: number;
minStock: number;
maxStock: number;

  // Images
  thumbnail: string;
  images: string[];
  video?: string;

  // Specifications
  specifications: Record<string, string>;

  // Variants
variants: ProductVariant[];

  // Shipping
  weight?: number;
  length?: number;
  width?: number;
  height?: number;

  // Warranty
  warranty?: string;
  returnDays?: number;

  // Seller
  vendorId: string;
  vendorName?: string;

  // SEO
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];

  // Status
  active: boolean;
  featured: boolean;
  approved: boolean;

  // Ratings
  rating?: number;
  reviewCount?: number;

  // Analytics
  views?: number;
  sales?: number;
  wishlistCount?: number;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;

}