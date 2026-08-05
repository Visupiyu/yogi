// ==========================================
// YOMICO Marketplace
// lib/catalog/categoryFilters.ts
// ==========================================

import type { CategoryFilter } from "./categoryTypes";

export const CATEGORY_FILTERS: Record<string, CategoryFilter[]> = {

  // ------------------------------------------
  // Fashion
  // ------------------------------------------

  FASHION: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    },

    {
      id: "size",
      label: "Size",
      type: "checkbox",
      values: [
        "XS","S","M","L","XL","XXL","3XL"
      ]
    },

    {
      id: "color",
      label: "Color",
      type: "checkbox",
      values: []
    },

    {
      id: "material",
      label: "Material",
      type: "checkbox",
      values: []
    },

    {
      id: "discount",
      label: "Discount",
      type: "checkbox",
      values: [
        "10% & Above",
        "25% & Above",
        "50% & Above",
        "70% & Above"
      ]
    }

  ],

  // ------------------------------------------
  // Electronics
  // ------------------------------------------

  ELECTRONICS: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    },

    {
      id: "rating",
      label: "Customer Rating",
      type: "checkbox",
      values: [
        "4★ & Above",
        "3★ & Above"
      ]
    },

    {
      id: "availability",
      label: "Availability",
      type: "checkbox",
      values: [
        "In Stock",
        "Out of Stock"
      ]
    }

  ],

  // ------------------------------------------
  // Mobiles
  // ------------------------------------------

  MOBILES: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "ram",
      label: "RAM",
      type: "checkbox",
      values: [
        "4 GB",
        "6 GB",
        "8 GB",
        "12 GB",
        "16 GB"
      ]
    },

    {
      id: "storage",
      label: "Storage",
      type: "checkbox",
      values: [
        "64 GB",
        "128 GB",
        "256 GB",
        "512 GB",
        "1 TB"
      ]
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    }

  ],

  // ------------------------------------------
  // Appliances
  // ------------------------------------------

  APPLIANCES: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    },

    {
      id: "capacity",
      label: "Capacity",
      type: "checkbox",
      values: []
    },

    {
      id: "energyRating",
      label: "Energy Rating",
      type: "checkbox",
      values: [
        "5 Star",
        "4 Star",
        "3 Star"
      ]
    }

  ],

  // ------------------------------------------
  // Furniture
  // ------------------------------------------

  FURNITURE: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "material",
      label: "Material",
      type: "checkbox",
      values: []
    },

    {
      id: "color",
      label: "Color",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    }

  ],

  // ------------------------------------------
  // Grocery
  // ------------------------------------------

  GROCERY: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    },

    {
      id: "packSize",
      label: "Pack Size",
      type: "checkbox",
      values: []
    }

  ],

  // ------------------------------------------
  // Beauty
  // ------------------------------------------

  BEAUTY: [

    {
      id: "brand",
      label: "Brand",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    },

    {
      id: "shade",
      label: "Shade",
      type: "checkbox",
      values: []
    }

  ],

  // ------------------------------------------
  // Books
  // ------------------------------------------

  BOOKS: [

    {
      id: "language",
      label: "Language",
      type: "checkbox",
      values: []
    },

    {
      id: "author",
      label: "Author",
      type: "checkbox",
      values: []
    },

    {
      id: "publisher",
      label: "Publisher",
      type: "checkbox",
      values: []
    },

    {
      id: "price",
      label: "Price",
      type: "range",
      values: []
    }

  ]

};

// ==========================================
// End of File
// ==========================================