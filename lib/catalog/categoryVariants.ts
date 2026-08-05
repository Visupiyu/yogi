// ==========================================
// YOMICO Marketplace
// lib/catalog/categoryVariants.ts
// ==========================================

import type { ProductVariant } from "./categoryTypes";

export const CATEGORY_VARIANTS: Record<string, ProductVariant[]> = {

  // ----------------------------------------
  // Fashion
  // ----------------------------------------

  FASHION: [

    {
      name: "Color",
      values: [
        "Black",
        "White",
        "Blue",
        "Red",
        "Green",
        "Yellow",
        "Grey",
        "Pink",
        "Brown",
        "Navy"
      ]
    },

    {
      name: "Size",
      values: [
        "XS",
        "S",
        "M",
        "L",
        "XL",
        "XXL",
        "3XL"
      ]
    }

  ],

  // ----------------------------------------
  // Footwear
  // ----------------------------------------

  FOOTWEAR: [

    {
      name: "Color",
      values: [
        "Black",
        "White",
        "Blue",
        "Brown",
        "Grey"
      ]
    },

    {
      name: "Size",
      values: [
        "5",
        "6",
        "7",
        "8",
        "9",
        "10",
        "11",
        "12"
      ]
    }

  ],

  // ----------------------------------------
  // Mobiles
  // ----------------------------------------

  MOBILES: [

    {
      name: "RAM",
      values: [
        "4 GB",
        "6 GB",
        "8 GB",
        "12 GB",
        "16 GB"
      ]
    },

    {
      name: "Storage",
      values: [
        "64 GB",
        "128 GB",
        "256 GB",
        "512 GB",
        "1 TB"
      ]
    },

    {
      name: "Color",
      values: [
        "Black",
        "Blue",
        "White",
        "Green",
        "Purple",
        "Gold"
      ]
    }

  ],

  // ----------------------------------------
  // Laptops
  // ----------------------------------------

  LAPTOPS: [

    {
      name: "RAM",
      values: [
        "8 GB",
        "16 GB",
        "32 GB",
        "64 GB"
      ]
    },

    {
      name: "Storage",
      values: [
        "256 GB SSD",
        "512 GB SSD",
        "1 TB SSD",
        "2 TB SSD"
      ]
    },

    {
      name: "Processor",
      values: [
        "Intel i3",
        "Intel i5",
        "Intel i7",
        "Intel i9",
        "AMD Ryzen 5",
        "AMD Ryzen 7",
        "AMD Ryzen 9"
      ]
    }

  ],

  // ----------------------------------------
  // Appliances
  // ----------------------------------------

  APPLIANCES: [

    {
      name: "Color",
      values: [
        "White",
        "Black",
        "Silver",
        "Grey"
      ]
    },

    {
      name: "Capacity",
      values: [
        "1 L",
        "2 L",
        "5 L",
        "10 L",
        "20 L",
        "50 L",
        "100 L"
      ]
    }

  ],

  // ----------------------------------------
  // Furniture
  // ----------------------------------------

  FURNITURE: [

    {
      name: "Color",
      values: [
        "Brown",
        "Black",
        "White",
        "Walnut",
        "Oak"
      ]
    },

    {
      name: "Material",
      values: [
        "Solid Wood",
        "Engineered Wood",
        "Metal",
        "Plastic",
        "Glass"
      ]
    }

  ],

  // ----------------------------------------
  // Grocery
  // ----------------------------------------

  GROCERY: [

    {
      name: "Pack Size",
      values: [
        "100 g",
        "250 g",
        "500 g",
        "1 kg",
        "2 kg",
        "5 kg"
      ]
    }

  ],

  // ----------------------------------------
  // Beauty
  // ----------------------------------------

  BEAUTY: [

    {
      name: "Shade",
      values: [
        "Light",
        "Medium",
        "Dark"
      ]
    },

    {
      name: "Size",
      values: [
        "30 ml",
        "50 ml",
        "100 ml",
        "200 ml"
      ]
    }

  ]

};

// ==========================================
// End of File
// ==========================================