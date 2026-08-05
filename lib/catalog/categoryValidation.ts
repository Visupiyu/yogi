// ==========================================
// YOMICO Marketplace
// lib/catalog/categoryValidation.ts
// ==========================================

export const CATEGORY_VALIDATION = {

  // ------------------------------------------
  // Common Validation
  // ------------------------------------------

  COMMON: {

    title: {
      required: true,
      minLength: 3,
      maxLength: 200
    },

    description: {
      required: true,
      minLength: 20,
      maxLength: 5000
    },

    brand: {
      required: true
    },

    sku: {
      required: true,
      minLength: 3,
      maxLength: 50
    },

    price: {
      required: true,
      min: 1,
      max: 10000000
    },

    mrp: {
      required: true,
      min: 1,
      max: 10000000
    },

    stock: {
      required: true,
      min: 0,
      max: 100000
    }

  },

  // ------------------------------------------
  // Images
  // ------------------------------------------

  IMAGES: {

    minimumImages: 1,

    maximumImages: 5,

    allowedFormats: [

      "jpg",

      "jpeg",

      "png",

      "webp"

    ],

    maximumFileSizeMB: 5

  },

  // ------------------------------------------
  // Dimensions
  // ------------------------------------------

  DIMENSIONS: {

    length: {

      min: 0,

      max: 1000

    },

    width: {

      min: 0,

      max: 1000

    },

    height: {

      min: 0,

      max: 1000

    },

    weight: {

      min: 0,

      max: 500

    }

  },

  // ------------------------------------------
  // Electronics
  // ------------------------------------------

  ELECTRONICS: {

    warrantyRequired: true,

    serialNumber: false,

    gstRequired: true

  },

  // ------------------------------------------
  // Grocery
  // ------------------------------------------

  GROCERY: {

    expiryDateRequired: true,

    manufactureDateRequired: true,

    fssaiRequired: true

  },

  // ------------------------------------------
  // Fashion
  // ------------------------------------------

  FASHION: {

    sizeRequired: true,

    colorRequired: true,

    materialRequired: true

  },

  // ------------------------------------------
  // Books
  // ------------------------------------------

  BOOKS: {

    isbnRequired: true,

    languageRequired: true,

    publisherRequired: true

  },

  // ------------------------------------------
  // Furniture
  // ------------------------------------------

  FURNITURE: {

    assemblyRequiredField: true,

    dimensionsRequired: true,

    weightRequired: true

  }

};

// ==========================================
// End of File
// ==========================================