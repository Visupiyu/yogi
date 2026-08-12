// ==========================================================
// YOMICO Marketplace
// lib/catalog/universalSpecFields.ts
// ==========================================================
//
// A fixed, category-agnostic set of specification fields shown for any
// product that doesn't have a more specific predefined field set in
// categoryFields.ts. Works as a sensible default across every category
// (clothing, electronics, groceries, furniture, etc.) rather than
// requiring a bespoke template per category.

export type UniversalSpecField = {
  id: string;
  label: string;
  placeholder?: string;
};

export const UNIVERSAL_SPEC_FIELDS: UniversalSpecField[] = [
  { id: "materialType", label: "Material / Product Type", placeholder: "e.g. Cotton, Steel, Plastic" },
  { id: "sizeDimensions", label: "Size / Dimensions", placeholder: "e.g. Medium, 15.6 inch, 30 x 20 x 10 cm" },
  { id: "capacity", label: "Capacity", placeholder: "e.g. 500ml, 256GB, 5L" },
  { id: "weight", label: "Weight", placeholder: "e.g. 250g, 1.5kg" },
  { id: "materialGrade", label: "Material Grade / Quality", placeholder: "e.g. Premium, Food Grade, Industrial" },
  { id: "colourFinish", label: "Colour / Finish", placeholder: "e.g. Matte Black, Glossy White" },
  { id: "modelType", label: "Model / Type", placeholder: "e.g. Model number or type" },
  { id: "performanceRating", label: "Performance / Technical Rating", placeholder: "e.g. 5 Star, 1200W, 2.4GHz" },
  { id: "standardsCertification", label: "Standards / Certification", placeholder: "e.g. ISI, BIS, FSSAI, CE" },
  { id: "warrantyService", label: "Warranty / Service", placeholder: "e.g. 1 Year Manufacturer Warranty" },
];
