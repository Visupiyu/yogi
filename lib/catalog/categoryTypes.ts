// ==========================================
// YOMICO Marketplace
// lib/catalog/categoryTypes.ts
// ==========================================

// ------------------------------------------
// Category Tree
// ------------------------------------------

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  image?: string;

  level: number;
  parentId?: string;

  active: boolean;
  featured: boolean;
  searchable: boolean;

  sortOrder: number;

  keywords?: string[];

  children?: Category[];
}

// ------------------------------------------
// Brand
// ------------------------------------------

export interface Brand {
  id: string;
  name: string;
  slug: string;

  logo?: string;

  featured?: boolean;

  active?: boolean;
}

// ------------------------------------------
// Product Field
// ------------------------------------------

export interface ProductField {

  key: string;

  label: string;

  type:
    | "text"
    | "textarea"
    | "number"
    | "email"
    | "phone"
    | "url"
    | "date"
    | "time"
    | "datetime"
    | "boolean"
    | "select"
    | "multiselect"
    | "radio"
    | "checkbox"
    | "color"
    | "image"
    | "images";

  required?: boolean;

  placeholder?: string;

  defaultValue?: any;

  options?: string[];

  unit?: string;

  min?: number;

  max?: number;

  step?: number;

  validation?: string;

}

// ------------------------------------------
// Category Field Config
// ------------------------------------------

export interface CategoryFieldConfig {

  basicInformation?: string[];

  specifications?: string[];

  dimensions?: string[];

  physical?: string[];

  performance?: string[];

  features?: string[];

  smartFeatures?: string[];

  connectivity?: string[];

  audio?: string[];

  display?: string[];

  storage?: string[];

  battery?: string[];

  camera?: string[];

  processor?: string[];

  memory?: string[];

  packageContents?: string[];

  warranty?: string[];

  variants?: string[];

  searchFilters?: string[];

  requiredFields?: string[];

  optionalFields?: string[];

  [key: string]: string[] | undefined;

}

// ------------------------------------------
// Category Filter
// ------------------------------------------

export interface CategoryFilter {

  id: string;

  label: string;

  type:

    | "checkbox"

    | "radio"

    | "range"

    | "select";

  values: string[];

}

// ------------------------------------------
// Product Variant
// ------------------------------------------

export interface ProductVariant {

  name: string;

  values: string[];

}

// ------------------------------------------
// SEO
// ------------------------------------------

export interface CategorySEO {

  title: string;

  description: string;

  keywords: string[];

}

// ------------------------------------------
// Category Keyword
// ------------------------------------------

export interface CategoryKeyword {

  keyword: string;

  synonyms?: string[];

}

// ------------------------------------------
// Category Specification
// ------------------------------------------

export interface CategorySpecification {

  name: string;

  value: string;

  unit?: string;

}

// ------------------------------------------
// Validation
// ------------------------------------------

export interface ValidationRule {

  field: string;

  required?: boolean;

  minLength?: number;

  maxLength?: number;

  min?: number;

  max?: number;

  regex?: string;

}

// ------------------------------------------
// Breadcrumb
// ------------------------------------------

export interface Breadcrumb {

  id: string;

  name: string;

  slug: string;

}

// ------------------------------------------
// Category Search Result
// ------------------------------------------

export interface CategorySearchResult {

  id: string;

  name: string;

  slug: string;

  path: string;

}

// ==========================================
// End of File
// ==========================================