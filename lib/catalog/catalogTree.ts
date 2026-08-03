/**
 * ============================================================
 * YOMICO Catalog Engine
 * File : catalogTree.ts
 * Purpose :
 * Defines the complete marketplace category hierarchy.
 *
 * This file ONLY contains navigation hierarchy.
 *
 * It DOES NOT contain:
 * ❌ Product Fields
 * ❌ Validation
 * ❌ Templates
 * ❌ Filters
 * ❌ Sizes
 * ❌ Colors
 * ============================================================
 */

export interface CatalogNode {
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

  children?: CatalogNode[];
  keywords?: string[];
}

export const catalogTree: CatalogNode[] = [
  {
  id: "FASHION",

  name: "Fashion",

  slug: "fashion",

  description: "Fashion & Lifestyle",

  icon: "Shirt",

  image: "/categories/fashion.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 1,


    children: [
     {
    id: "FASHION_MEN",

    name: "Men",

    slug: "men",

    description: "Men's Fashion",

    icon: "User",

    image: "/categories/men.jpg",

    level: 2,

    parentId: "FASHION",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 1,


     children: [
         {
    id: "FASHION_MEN_CLOTHING",

    name: "Clothing",

    slug: "clothing",

    description: "Men Clothing",

    icon: "shirt",

    image: "/categories/men-clothing.jpg",

    level: 3,

    parentId: "FASHION_MEN",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 1,

            children: [
             {
    id: "FASHION_MEN_TOPWEAR",

    name: "Top Wear",

    slug: "top-wear",

    description: "Men Top Wear",

    icon: "shirt",

    image: "/categories/topwear.jpg",

    level: 4,

    parentId: "FASHION_MEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 1,

                children: [
                  {
    id: "MEN_TSHIRTS",

    name: "T-Shirts",

    slug: "t-shirts",

    description: "Men T-Shirts",

    icon: "shirt",

    image: "/categories/tshirts.jpg",

    level: 5,

    parentId: "FASHION_MEN_TOPWEAR",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 1,

                children: [
  {
    id: "MEN_TSHIRT_ROUND_NECK",

    name: "Round Neck",

    slug: "round-neck",

    description: "Round Neck T-Shirts",

    icon: "shirt",

    image: "/categories/round-neck.jpg",

    level: 6,

    parentId: "MEN_TSHIRTS",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 1,

    keywords: [
      "round neck",
      "tshirt",
      "tee",
      "mens"
    ],
  },

  {
    id: "MEN_TSHIRT_V_NECK",

    name: "V Neck",

    slug: "v-neck",

    description: "V Neck T-Shirts",

    icon: "shirt",

    image: "/categories/v-neck.jpg",

    level: 6,

    parentId: "MEN_TSHIRTS",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 2,

    keywords: [
      "v neck",
      "tshirt",
      "tee",
      "mens"
    ],
  },

  {
    id: "MEN_TSHIRT_POLO",

    name: "Polo",

    slug: "polo",

    description: "Polo Style T-Shirts",

    icon: "shirt",

    image: "/categories/polo.jpg",

    level: 6,

    parentId: "MEN_TSHIRTS",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 3,

    keywords: [
      "polo",
      "collar tshirt",
      "mens"
    ],
  },

                        {
                        id: "MEN_TSHIRT_OVERSIZED",

                        name: "Oversized",

                        slug: "oversized",

                        description: "Oversized T-Shirts",

                        icon: "shirt",

                        image: "",

                        level: 6,

                        parentId: "MEN_TSHIRTS",

                        active: true,

                        featured: false,

                        searchable: true,

                        sortOrder: 4,

                        keywords: [
                          "oversized",
                          "loose fit",
                          "tshirt",
                          "mens",
                        ],
                      },
                    ], // End MEN_TSHIRTS children

                  }, // End MEN_TSHIRTS

                ], // End TOPWEAR children

              }, // End TOPWEAR
              {
  id: "FASHION_MEN_BOTTOMWEAR",

  name: "Bottom Wear",

  slug: "bottom-wear",

  description: "Men Bottom Wear",

  icon: "pants",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 2,

  children: [
  {
    id: "MEN_JEANS",
    name: "Jeans",
    slug: "jeans",
    description: "Men Jeans",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["jeans", "denim", "mens"],
  },

  {
    id: "MEN_TROUSERS",
    name: "Trousers",
    slug: "trousers",
    description: "Men Trousers",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["trousers", "formal", "mens"],
  },

  {
    id: "MEN_CHINOS",
    name: "Chinos",
    slug: "chinos",
    description: "Men Chinos",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["chinos", "casual", "mens"],
  },

  {
    id: "MEN_CARGO_PANTS",
    name: "Cargo Pants",
    slug: "cargo-pants",
    description: "Men Cargo Pants",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["cargo", "pants", "mens"],
  },

  {
    id: "MEN_SHORTS",
    name: "Shorts",
    slug: "shorts",
    description: "Men Shorts",
    icon: "shorts",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["shorts", "mens"],
  },

  {
    id: "MEN_TRACK_PANTS",
    name: "Track Pants",
    slug: "track-pants",
    description: "Men Track Pants",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["track pants", "sports", "mens"],
  },

  {
    id: "MEN_JOGGERS",
    name: "Joggers",
    slug: "joggers",
    description: "Men Joggers",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_BOTTOMWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 7,
    keywords: ["joggers", "mens"],
  },
],
},

{
  id: "FASHION_MEN_ETHNIC",

  name: "Ethnic Wear",

  slug: "ethnic-wear",

  description: "Men Ethnic Wear",

  icon: "kurta",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 3,

  children: [
  {
    id: "MEN_KURTAS",
    name: "Kurtas",
    slug: "kurtas",
    description: "Men Kurtas",
    icon: "kurta",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["kurta", "ethnic", "mens"],
  },

  {
    id: "MEN_KURTA_SETS",
    name: "Kurta Sets",
    slug: "kurta-sets",
    description: "Men Kurta Sets",
    icon: "kurta",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["kurta set", "ethnic", "mens"],
  },

  {
    id: "MEN_SHERWANIS",
    name: "Sherwanis",
    slug: "sherwanis",
    description: "Men Sherwanis",
    icon: "sherwani",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["sherwani", "wedding", "mens"],
  },

  {
    id: "MEN_DHOTIS",
    name: "Dhotis",
    slug: "dhotis",
    description: "Men Dhotis",
    icon: "dhoti",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["dhoti", "traditional", "mens"],
  },

  {
    id: "MEN_NEHRU_JACKETS",
    name: "Nehru Jackets",
    slug: "nehru-jackets",
    description: "Men Nehru Jackets",
    icon: "jacket",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["nehru jacket", "ethnic", "mens"],
  },
],
},

{
  id: "FASHION_MEN_INNERWEAR",

  name: "Innerwear",

  slug: "innerwear",

  description: "Men Innerwear",

  icon: "innerwear",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 4,

  children: [
  {
    id: "MEN_BRIEFS",
    name: "Briefs",
    slug: "briefs",
    description: "Men Briefs",
    icon: "briefs",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["briefs", "innerwear", "mens"],
  },

  {
    id: "MEN_BOXERS",
    name: "Boxers",
    slug: "boxers",
    description: "Men Boxers",
    icon: "boxers",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["boxers", "innerwear", "mens"],
  },

  {
    id: "MEN_TRUNKS",
    name: "Trunks",
    slug: "trunks",
    description: "Men Trunks",
    icon: "trunks",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["trunks", "mens"],
  },

  {
    id: "MEN_VESTS",
    name: "Vests",
    slug: "vests",
    description: "Men Vests",
    icon: "vest",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["vest", "baniyan", "mens"],
  },

  {
    id: "MEN_THERMALS",
    name: "Thermals",
    slug: "thermals",
    description: "Men Thermal Wear",
    icon: "thermal",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["thermal", "winter", "mens"],
  },

  {
    id: "MEN_SOCKS",
    name: "Socks",
    slug: "socks",
    description: "Men Socks",
    icon: "socks",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["socks", "mens"],
  },
],
},

{
  id: "FASHION_MEN_SLEEPWEAR",

  name: "Sleepwear",

  slug: "sleepwear",

  description: "Men Sleepwear",

  icon: "moon",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 5,

 children: [
  {
    id: "MEN_NIGHT_SUITS",
    name: "Night Suits",
    slug: "night-suits",
    description: "Men Night Suits",
    icon: "moon",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["night suit", "sleepwear", "mens"],
  },

  {
    id: "MEN_PYJAMAS",
    name: "Pyjamas",
    slug: "pyjamas",
    description: "Men Pyjamas",
    icon: "moon",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["pyjama", "sleepwear", "mens"],
  },

  {
    id: "MEN_LOUNGE_PANTS",
    name: "Lounge Pants",
    slug: "lounge-pants",
    description: "Men Lounge Pants",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["lounge", "pants", "mens"],
  },

  {
    id: "MEN_SLEEP_TSHIRTS",
    name: "Sleep T-Shirts",
    slug: "sleep-tshirts",
    description: "Men Sleep T-Shirts",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["sleep tshirt", "nightwear", "mens"],
  },

  {
    id: "MEN_ROBES",
    name: "Robes",
    slug: "robes",
    description: "Men Robes",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["robe", "bathrobe", "mens"],
  },
],
},

{
  id: "FASHION_MEN_WINTERWEAR",

  name: "Winter Wear",

  slug: "winter-wear",

  description: "Men Winter Wear",

  icon: "snowflake",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 6,

 children: [
  {
    id: "MEN_SWEATERS",
    name: "Sweaters",
    slug: "sweaters",
    description: "Men Sweaters",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["sweater", "winter", "mens"],
  },

  {
    id: "MEN_CARDIGANS",
    name: "Cardigans",
    slug: "cardigans",
    description: "Men Cardigans",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["cardigan", "winter", "mens"],
  },

  {
    id: "MEN_HOODIES_WINTER",
    name: "Hoodies",
    slug: "hoodies",
    description: "Men Hoodies",
    icon: "hoodie",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["hoodie", "winter", "mens"],
  },

  {
    id: "MEN_JACKETS_WINTER",
    name: "Jackets",
    slug: "jackets",
    description: "Men Winter Jackets",
    icon: "jacket",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["jacket", "winter", "mens"],
  },

  {
    id: "MEN_THERMAL_WEAR",
    name: "Thermal Wear",
    slug: "thermal-wear",
    description: "Men Thermal Wear",
    icon: "thermal",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["thermal", "winter", "mens"],
  },

  {
    id: "MEN_WOOLEN_CAPS",
    name: "Woolen Caps",
    slug: "woolen-caps",
    description: "Men Woolen Caps",
    icon: "cap",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["cap", "winter", "wool"],
  },
],
},

{
  id: "FASHION_MEN_ACTIVEWEAR",

  name: "Activewear",

  slug: "activewear",

  description: "Men Activewear",

  icon: "dumbbell",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 7,

  children: [
  {
    id: "MEN_GYM_TSHIRTS",
    name: "Gym T-Shirts",
    slug: "gym-tshirts",
    description: "Men Gym T-Shirts",
    icon: "dumbbell",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["gym", "fitness", "tshirt", "mens"],
  },

  {
    id: "MEN_GYM_SHORTS",
    name: "Gym Shorts",
    slug: "gym-shorts",
    description: "Men Gym Shorts",
    icon: "shorts",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["gym shorts", "fitness", "mens"],
  },

  {
    id: "MEN_TRACKSUITS",
    name: "Tracksuits",
    slug: "tracksuits",
    description: "Men Tracksuits",
    icon: "sports",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["tracksuit", "sports", "mens"],
  },

  {
    id: "MEN_RUNNING_WEAR",
    name: "Running Wear",
    slug: "running-wear",
    description: "Men Running Wear",
    icon: "running",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["running", "sports", "mens"],
  },

  {
    id: "MEN_COMPRESSION_WEAR",
    name: "Compression Wear",
    slug: "compression-wear",
    description: "Men Compression Wear",
    icon: "sports",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["compression", "gym", "mens"],
  },

  {
    id: "MEN_SPORTS_JACKETS",
    name: "Sports Jackets",
    slug: "sports-jackets",
    description: "Men Sports Jackets",
    icon: "jacket",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["sports jacket", "fitness", "mens"],
  },
],
},

{
  id: "FASHION_MEN_RAINWEAR",

  name: "Rainwear",

  slug: "rainwear",

  description: "Men Rainwear",

  icon: "umbrella",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 8,

  children: [
  {
    id: "MEN_RAIN_JACKETS",
    name: "Rain Jackets",
    slug: "rain-jackets",
    description: "Men Rain Jackets",
    icon: "umbrella",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_RAINWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["rain jacket", "waterproof", "mens"],
  },

  {
    id: "MEN_RAINCOATS",
    name: "Raincoats",
    slug: "raincoats",
    description: "Men Raincoats",
    icon: "umbrella",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_RAINWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["raincoat", "monsoon", "mens"],
  },

  {
    id: "MEN_PONCHOS",
    name: "Ponchos",
    slug: "ponchos",
    description: "Men Ponchos",
    icon: "umbrella",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_RAINWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["poncho", "rain", "mens"],
  },

  {
    id: "MEN_WATERPROOF_PANTS",
    name: "Waterproof Pants",
    slug: "waterproof-pants",
    description: "Men Waterproof Pants",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_RAINWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["waterproof pants", "rainwear", "mens"],
  },

  {
    id: "MEN_RAIN_SUITS",
    name: "Rain Suits",
    slug: "rain-suits",
    description: "Men Rain Suits",
    icon: "umbrella",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_RAINWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["rain suit", "waterproof", "mens"],
  },
],
},

{
  id: "FASHION_MEN_UNIFORMS",

  name: "Uniforms",

  slug: "uniforms",

  description: "Men Uniforms",

  icon: "badge",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 9,

  children: [
  {
    id: "MEN_SCHOOL_UNIFORMS",
    name: "School Uniforms",
    slug: "school-uniforms",
    description: "Men School Uniforms",
    icon: "uniform",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_UNIFORMS",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["school uniform", "students"],
  },

  {
    id: "MEN_COLLEGE_UNIFORMS",
    name: "College Uniforms",
    slug: "college-uniforms",
    description: "Men College Uniforms",
    icon: "uniform",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_UNIFORMS",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["college uniform"],
  },

  {
    id: "MEN_OFFICE_UNIFORMS",
    name: "Office Uniforms",
    slug: "office-uniforms",
    description: "Men Office Uniforms",
    icon: "uniform",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_UNIFORMS",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["office uniform", "corporate"],
  },

  {
    id: "MEN_SECURITY_UNIFORMS",
    name: "Security Uniforms",
    slug: "security-uniforms",
    description: "Men Security Uniforms",
    icon: "shield",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_UNIFORMS",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["security uniform"],
  },

  {
    id: "MEN_HOSPITAL_UNIFORMS",
    name: "Hospital Uniforms",
    slug: "hospital-uniforms",
    description: "Men Hospital Uniforms",
    icon: "hospital",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_UNIFORMS",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["hospital uniform", "medical"],
  },

  {
    id: "MEN_HOTEL_UNIFORMS",
    name: "Hotel Uniforms",
    slug: "hotel-uniforms",
    description: "Men Hotel Uniforms",
    icon: "hotel",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_UNIFORMS",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["hotel uniform", "hospitality"],
  },
],
},

{
  id: "FASHION_MEN_PLUSSIZE",

  name: "Plus Size",

  slug: "plus-size",

  description: "Men Plus Size Clothing",

  icon: "shirt",

  image: "",

  level: 4,

  parentId: "FASHION_MEN_CLOTHING",

  active: true,

  featured: false,

  searchable: true,

  sortOrder: 10,

  children: [
  {
    id: "MEN_PLUSSIZE_TSHIRTS",
    name: "T-Shirts",
    slug: "plus-size-tshirts",
    description: "Men Plus Size T-Shirts",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 1,
    keywords: ["plus size", "tshirt", "mens"],
  },

  {
    id: "MEN_PLUSSIZE_SHIRTS",
    name: "Shirts",
    slug: "plus-size-shirts",
    description: "Men Plus Size Shirts",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 2,
    keywords: ["plus size", "shirt", "mens"],
  },

  {
    id: "MEN_PLUSSIZE_JEANS",
    name: "Jeans",
    slug: "plus-size-jeans",
    description: "Men Plus Size Jeans",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["plus size", "jeans", "mens"],
  },

  {
    id: "MEN_PLUSSIZE_TROUSERS",
    name: "Trousers",
    slug: "plus-size-trousers",
    description: "Men Plus Size Trousers",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["plus size", "trousers", "mens"],
  },

  {
    id: "MEN_PLUSSIZE_ETHNIC",
    name: "Ethnic Wear",
    slug: "plus-size-ethnic",
    description: "Men Plus Size Ethnic Wear",
    icon: "kurta",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["plus size", "kurta", "mens"],
  },

  {
    id: "MEN_PLUSSIZE_ACTIVEWEAR",
    name: "Activewear",
    slug: "plus-size-activewear",
    description: "Men Plus Size Activewear",
    icon: "dumbbell",
    image: "",
    level: 5,
    parentId: "FASHION_MEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["plus size", "gym", "mens"],
  },
],
},

            ], // End CLOTHING children

          }, // End CLOTHING

        ], // End MEN children

      }, // End MEN
      {
  id: "FASHION_WOMEN",

  name: "Women",

  slug: "women",

  description: "Women's Fashion",

  icon: "user",

  image: "",

  level: 2,

  parentId: "FASHION",

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 2,

  children: [
    {
      id: "FASHION_WOMEN_CLOTHING",

      name: "Clothing",

      slug: "clothing",

      description: "Women's Clothing",

      icon: "shirt",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 1,

      children: [
  {
    id: "FASHION_WOMEN_ETHNIC",

    name: "Ethnic Wear",

    slug: "ethnic-wear",

    description: "Women's Ethnic Wear",

    icon: "kurti",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: true,

    searchable: true,

    sortOrder: 1,

    children: [
  {
    id: "WOMEN_SAREES",
    name: "Sarees",
    slug: "sarees",
    description: "Women's Sarees",
    icon: "saree",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["saree", "silk saree", "cotton saree"],
  },

  {
    id: "WOMEN_KURTIS",
    name: "Kurtis",
    slug: "kurtis",
    description: "Women's Kurtis",
    icon: "kurti",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["kurti", "ethnic"],
  },

  {
    id: "WOMEN_KURTA_SETS",
    name: "Kurta Sets",
    slug: "kurta-sets",
    description: "Women's Kurta Sets",
    icon: "kurti",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 3,
    keywords: ["kurta set", "ethnic"],
  },

  {
    id: "WOMEN_SALWAR_SUITS",
    name: "Salwar Suits",
    slug: "salwar-suits",
    description: "Women's Salwar Suits",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 4,
    keywords: ["salwar", "suit"],
  },

  {
    id: "WOMEN_LEHENGAS",
    name: "Lehengas",
    slug: "lehengas",
    description: "Women's Lehengas",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 5,
    keywords: ["lehenga", "bridal"],
  },

  {
    id: "WOMEN_BLOUSES",
    name: "Blouses",
    slug: "blouses",
    description: "Women's Blouses",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["blouse", "saree blouse"],
  },

  {
    id: "WOMEN_DUPATTAS",
    name: "Dupattas",
    slug: "dupattas",
    description: "Women's Dupattas",
    icon: "scarf",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 7,
    keywords: ["dupatta", "stole"],
  },

  {
    id: "WOMEN_PETTICOATS",
    name: "Petticoats",
    slug: "petticoats",
    description: "Women's Petticoats",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 8,
    keywords: ["petticoat"],
  },

  {
    id: "WOMEN_DRESS_MATERIALS",
    name: "Dress Materials",
    slug: "dress-materials",
    description: "Women's Dress Materials",
    icon: "fabric",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ETHNIC",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 9,
    keywords: ["dress material", "fabric"],
  },
],
  },

  {
    id: "FASHION_WOMEN_WESTERN",

    name: "Western Wear",

    slug: "western-wear",

    description: "Women's Western Wear",

    icon: "dress",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: true,

    searchable: true,

    sortOrder: 2,

    children: [
  {
    id: "WOMEN_DRESSES",
    name: "Dresses",
    slug: "dresses",
    description: "Women's Dresses",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["dress", "casual dress", "party dress"],
  },

  {
    id: "WOMEN_TOPS",
    name: "Tops",
    slug: "tops",
    description: "Women's Tops",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["top", "western"],
  },

  {
    id: "WOMEN_TSHIRTS",
    name: "T-Shirts",
    slug: "t-shirts",
    description: "Women's T-Shirts",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 3,
    keywords: ["tshirt", "tee"],
  },

  {
    id: "WOMEN_SHIRTS",
    name: "Shirts",
    slug: "shirts",
    description: "Women's Shirts",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["shirt", "formal"],
  },

  {
    id: "WOMEN_JEANS",
    name: "Jeans",
    slug: "jeans",
    description: "Women's Jeans",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 5,
    keywords: ["jeans", "denim"],
  },

  {
    id: "WOMEN_TROUSERS",
    name: "Trousers",
    slug: "trousers",
    description: "Women's Trousers",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["trousers", "formal pants"],
  },

  {
    id: "WOMEN_SKIRTS",
    name: "Skirts",
    slug: "skirts",
    description: "Women's Skirts",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 7,
    keywords: ["skirt"],
  },

  {
    id: "WOMEN_JUMPSUITS",
    name: "Jumpsuits",
    slug: "jumpsuits",
    description: "Women's Jumpsuits",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 8,
    keywords: ["jumpsuit"],
  },

  {
    id: "WOMEN_BLAZERS",
    name: "Blazers",
    slug: "blazers",
    description: "Women's Blazers",
    icon: "jacket",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 9,
    keywords: ["blazer", "office wear"],
  },

  {
    id: "WOMEN_JACKETS",
    name: "Jackets",
    slug: "jackets",
    description: "Women's Jackets",
    icon: "jacket",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WESTERN",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 10,
    keywords: ["jacket", "winter"],
  },
],
  },

  {
    id: "FASHION_WOMEN_INNERWEAR",

    name: "Innerwear",

    slug: "innerwear",

    description: "Women's Innerwear",

    icon: "shirt",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 3,

    children: [
  {
    id: "WOMEN_BRAS",
    name: "Bras",
    slug: "bras",
    description: "Women's Bras",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["bra", "lingerie"],
  },

  {
    id: "WOMEN_PANTIES",
    name: "Panties",
    slug: "panties",
    description: "Women's Panties",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["panty", "innerwear"],
  },

  {
    id: "WOMEN_SHAPEWEAR",
    name: "Shapewear",
    slug: "shapewear",
    description: "Women's Shapewear",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["shapewear", "slimming"],
  },

  {
    id: "WOMEN_CAMISOLES",
    name: "Camisoles",
    slug: "camisoles",
    description: "Women's Camisoles",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["camisole"],
  },

  {
    id: "WOMEN_SLIPS",
    name: "Slips",
    slug: "slips",
    description: "Women's Slips",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["slip"],
  },

  {
    id: "WOMEN_THERMALS",
    name: "Thermals",
    slug: "thermals",
    description: "Women's Thermals",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["thermal", "winter"],
  },

  {
    id: "WOMEN_SOCKS",
    name: "Socks",
    slug: "socks",
    description: "Women's Socks",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_INNERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 7,
    keywords: ["socks"],
  },
],
  },

  {
    id: "FASHION_WOMEN_SLEEPWEAR",

    name: "Sleepwear",

    slug: "sleepwear",

    description: "Women's Sleepwear",

    icon: "moon",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 4,

    children: [
  {
    id: "WOMEN_NIGHT_SUITS",
    name: "Night Suits",
    slug: "night-suits",
    description: "Women's Night Suits",
    icon: "moon",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_SLEEPWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["night suit", "sleepwear", "women"],
  },

  {
    id: "WOMEN_NIGHTDRESSES",
    name: "Night Dresses",
    slug: "night-dresses",
    description: "Women's Night Dresses",
    icon: "moon",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_SLEEPWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["night dress", "sleepwear"],
  },

  {
    id: "WOMEN_PYJAMA_SETS",
    name: "Pyjama Sets",
    slug: "pyjama-sets",
    description: "Women's Pyjama Sets",
    icon: "moon",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 3,
    keywords: ["pyjama", "nightwear"],
  },

  {
    id: "WOMEN_LOUNGEWEAR",
    name: "Loungewear",
    slug: "loungewear",
    description: "Women's Loungewear",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["lounge", "home wear"],
  },

  {
    id: "WOMEN_ROBES",
    name: "Robes",
    slug: "robes",
    description: "Women's Robes",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["robe", "bathrobe"],
  },

  {
    id: "WOMEN_SLEEP_TSHIRTS",
    name: "Sleep T-Shirts",
    slug: "sleep-tshirts",
    description: "Women's Sleep T-Shirts",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_SLEEPWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["sleep tshirt", "night tshirt"],
  },
],
  },

  {
    id: "FASHION_WOMEN_ACTIVEWEAR",

    name: "Activewear",

    slug: "activewear",

    description: "Women's Activewear",

    icon: "dumbbell",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 5,

    children: [
  {
    id: "WOMEN_GYM_TSHIRTS",
    name: "Gym T-Shirts",
    slug: "gym-tshirts",
    description: "Women's Gym T-Shirts",
    icon: "dumbbell",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["gym", "fitness", "tshirt", "women"],
  },

  {
    id: "WOMEN_GYM_LEGGINGS",
    name: "Gym Leggings",
    slug: "gym-leggings",
    description: "Women's Gym Leggings",
    icon: "leggings",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["leggings", "gym", "women"],
  },

  {
    id: "WOMEN_SPORTS_BRAS",
    name: "Sports Bras",
    slug: "sports-bras",
    description: "Women's Sports Bras",
    icon: "sports-bra",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 3,
    keywords: ["sports bra", "fitness"],
  },

  {
    id: "WOMEN_TRACK_PANTS",
    name: "Track Pants",
    slug: "track-pants",
    description: "Women's Track Pants",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["track pants", "sports"],
  },

  {
    id: "WOMEN_TRACKSUITS",
    name: "Tracksuits",
    slug: "tracksuits",
    description: "Women's Tracksuits",
    icon: "sports",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["tracksuit", "fitness"],
  },

  {
    id: "WOMEN_YOGA_WEAR",
    name: "Yoga Wear",
    slug: "yoga-wear",
    description: "Women's Yoga Wear",
    icon: "yoga",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["yoga", "activewear"],
  },

  {
    id: "WOMEN_RUNNING_WEAR",
    name: "Running Wear",
    slug: "running-wear",
    description: "Women's Running Wear",
    icon: "running",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_ACTIVEWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 7,
    keywords: ["running", "sports"],
  },
],
  },

  {
    id: "FASHION_WOMEN_WINTERWEAR",

    name: "Winter Wear",

    slug: "winter-wear",

    description: "Women's Winter Wear",

    icon: "snowflake",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 6,

   children: [
  {
    id: "WOMEN_SWEATERS",
    name: "Sweaters",
    slug: "sweaters",
    description: "Women's Sweaters",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["sweater", "winter", "women"],
  },

  {
    id: "WOMEN_CARDIGANS",
    name: "Cardigans",
    slug: "cardigans",
    description: "Women's Cardigans",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["cardigan", "winter"],
  },

  {
    id: "WOMEN_HOODIES",
    name: "Hoodies",
    slug: "hoodies",
    description: "Women's Hoodies",
    icon: "hoodie",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 3,
    keywords: ["hoodie", "winter"],
  },

  {
    id: "WOMEN_JACKETS",
    name: "Jackets",
    slug: "jackets",
    description: "Women's Jackets",
    icon: "jacket",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["jacket", "winter"],
  },

  {
    id: "WOMEN_COATS",
    name: "Coats",
    slug: "coats",
    description: "Women's Coats",
    icon: "coat",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["coat", "winter"],
  },

  {
    id: "WOMEN_SHAWLS",
    name: "Shawls",
    slug: "shawls",
    description: "Women's Shawls",
    icon: "shawl",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["shawl", "wool"],
  },

  {
    id: "WOMEN_THERMAL_WEAR",
    name: "Thermal Wear",
    slug: "thermal-wear",
    description: "Women's Thermal Wear",
    icon: "thermal",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_WINTERWEAR",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 7,
    keywords: ["thermal", "winter"],
  },
],
  },

  {
    id: "FASHION_WOMEN_MATERNITY",

    name: "Maternity",

    slug: "maternity",

    description: "Women's Maternity Wear",

    icon: "heart",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 7,

    children: [
  {
    id: "WOMEN_MATERNITY_DRESSES",
    name: "Maternity Dresses",
    slug: "maternity-dresses",
    description: "Women's Maternity Dresses",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_MATERNITY",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["maternity", "dress", "pregnancy"],
  },

  {
    id: "WOMEN_MATERNITY_TOPS",
    name: "Maternity Tops",
    slug: "maternity-tops",
    description: "Women's Maternity Tops",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_MATERNITY",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["maternity top", "pregnancy"],
  },

  {
    id: "WOMEN_MATERNITY_KURTIS",
    name: "Maternity Kurtis",
    slug: "maternity-kurtis",
    description: "Women's Maternity Kurtis",
    icon: "kurti",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_MATERNITY",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 3,
    keywords: ["maternity kurti", "pregnancy"],
  },

  {
    id: "WOMEN_MATERNITY_LEGGINGS",
    name: "Maternity Leggings",
    slug: "maternity-leggings",
    description: "Women's Maternity Leggings",
    icon: "leggings",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_MATERNITY",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["maternity leggings"],
  },

  {
    id: "WOMEN_NURSING_BRA",
    name: "Nursing Bras",
    slug: "nursing-bras",
    description: "Women's Nursing Bras",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_MATERNITY",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["nursing bra", "feeding"],
  },

  {
    id: "WOMEN_FEEDING_NIGHTWEAR",
    name: "Feeding Nightwear",
    slug: "feeding-nightwear",
    description: "Women's Feeding Nightwear",
    icon: "moon",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_MATERNITY",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["feeding", "nightwear", "maternity"],
  },
],
  },

  {
    id: "FASHION_WOMEN_PLUSSIZE",

    name: "Plus Size",

    slug: "plus-size",

    description: "Women's Plus Size Fashion",

    icon: "shirt",

    image: "",

    level: 4,

    parentId: "FASHION_WOMEN_CLOTHING",

    active: true,

    featured: false,

    searchable: true,

    sortOrder: 8,

    children: [
  {
    id: "WOMEN_PLUSSIZE_DRESSES",
    name: "Dresses",
    slug: "plus-size-dresses",
    description: "Women's Plus Size Dresses",
    icon: "dress",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_PLUSSIZE",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 1,
    keywords: ["plus size", "dress", "women"],
  },

  {
    id: "WOMEN_PLUSSIZE_TOPS",
    name: "Tops",
    slug: "plus-size-tops",
    description: "Women's Plus Size Tops",
    icon: "shirt",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_PLUSSIZE",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 2,
    keywords: ["plus size", "tops", "women"],
  },

  {
    id: "WOMEN_PLUSSIZE_KURTIS",
    name: "Kurtis",
    slug: "plus-size-kurtis",
    description: "Women's Plus Size Kurtis",
    icon: "kurti",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_PLUSSIZE",
    active: true,
    featured: true,
    searchable: true,
    sortOrder: 3,
    keywords: ["plus size", "kurti", "women"],
  },

  {
    id: "WOMEN_PLUSSIZE_JEANS",
    name: "Jeans",
    slug: "plus-size-jeans",
    description: "Women's Plus Size Jeans",
    icon: "pants",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 4,
    keywords: ["plus size", "jeans", "women"],
  },

  {
    id: "WOMEN_PLUSSIZE_LEGGINGS",
    name: "Leggings",
    slug: "plus-size-leggings",
    description: "Women's Plus Size Leggings",
    icon: "leggings",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 5,
    keywords: ["plus size", "leggings", "women"],
  },

  {
    id: "WOMEN_PLUSSIZE_ACTIVEWEAR",
    name: "Activewear",
    slug: "plus-size-activewear",
    description: "Women's Plus Size Activewear",
    icon: "dumbbell",
    image: "",
    level: 5,
    parentId: "FASHION_WOMEN_PLUSSIZE",
    active: true,
    featured: false,
    searchable: true,
    sortOrder: 6,
    keywords: ["plus size", "gym", "women"],
  },
],
  },
],
    },

    {
      id: "FASHION_WOMEN_FOOTWEAR",

      name: "Footwear",

      slug: "footwear",

      description: "Women's Footwear",

      icon: "shoe",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 2,

      children: [],
    },

    {
      id: "FASHION_WOMEN_BAGS",

      name: "Bags",

      slug: "bags",

      description: "Women's Bags",

      icon: "bag",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 3,

      children: [],
    },

    {
      id: "FASHION_WOMEN_JEWELLERY",

      name: "Jewellery",

      slug: "jewellery",

      description: "Women's Jewellery",

      icon: "gem",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 4,

      children: [],
    },

    {
      id: "FASHION_WOMEN_BEAUTY",

      name: "Beauty",

      slug: "beauty",

      description: "Women's Beauty",

      icon: "sparkles",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 5,

      children: [],
    },

    {
      id: "FASHION_WOMEN_WATCHES",

      name: "Watches",

      slug: "watches",

      description: "Women's Watches",

      icon: "watch",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 6,

      children: [],
    },

    {
      id: "FASHION_WOMEN_ACCESSORIES",

      name: "Accessories",

      slug: "accessories",

      description: "Women's Accessories",

      icon: "star",

      image: "",

      level: 3,

      parentId: "FASHION_WOMEN",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 7,

      children: [],
    },
  ],
},
{
  id: "KIDS_FASHION",

  name: "Kids Fashion",

  slug: "kids-fashion",

  description: "Clothing, Footwear & Accessories for Kids",

  icon: "Baby",

  image: "/categories/kids-fashion.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 9,

  children: [

    {
      id: "BOYS",

      name: "Boys",

      slug: "boys",

      description: "Boys Fashion",

      icon: "Shirt",

      image: "",

      level: 2,

      parentId: "KIDS_FASHION",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "BOYS_TSHIRTS",
          name: "T-Shirts",
          slug: "boys-tshirts",
          description: "Boys T-Shirts",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "BOYS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
        },

        {
          id: "BOYS_SHIRTS",
          name: "Shirts",
          slug: "boys-shirts",
          description: "Boys Shirts",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "BOYS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2,
        },

        {
          id: "BOYS_JEANS",
          name: "Jeans",
          slug: "boys-jeans",
          description: "Boys Jeans",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "BOYS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3,
        },

        {
          id: "BOYS_SHORTS",
          name: "Shorts",
          slug: "boys-shorts",
          description: "Boys Shorts",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "BOYS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 4,
        },

        {
          id: "BOYS_ETHNIC",
          name: "Ethnic Wear",
          slug: "boys-ethnic",
          description: "Boys Ethnic Wear",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "BOYS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 5,
        },

        {
          id: "BOYS_SHOES",
          name: "Shoes",
          slug: "boys-shoes",
          description: "Boys Shoes",
          icon: "Footprints",
          image: "",
          level: 3,
          parentId: "BOYS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 6,
        }

      ]

    },

    {
      id: "GIRLS",

      name: "Girls",

      slug: "girls",

      description: "Girls Fashion",

      icon: "Shirt",

      image: "",

      level: 2,

      parentId: "KIDS_FASHION",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "GIRLS_DRESSES",
          name: "Dresses",
          slug: "girls-dresses",
          description: "Girls Dresses",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "GIRLS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
        },

        {
          id: "GIRLS_TOPS",
          name: "Tops",
          slug: "girls-tops",
          description: "Girls Tops",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "GIRLS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2,
        },

        {
          id: "GIRLS_JEANS",
          name: "Jeans",
          slug: "girls-jeans",
          description: "Girls Jeans",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "GIRLS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3,
        },

        {
          id: "GIRLS_SKIRTS",
          name: "Skirts",
          slug: "girls-skirts",
          description: "Girls Skirts",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "GIRLS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 4,
        },

        {
          id: "GIRLS_ETHNIC",
          name: "Ethnic Wear",
          slug: "girls-ethnic",
          description: "Girls Ethnic Wear",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "GIRLS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 5,
        },

        {
          id: "GIRLS_SHOES",
          name: "Shoes",
          slug: "girls-shoes",
          description: "Girls Shoes",
          icon: "Footprints",
          image: "",
          level: 3,
          parentId: "GIRLS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 6,
        }

      ]

    },

    {
      id: "BABY",

      name: "Baby",

      slug: "baby",

      description: "Baby Clothing & Accessories",

      icon: "Baby",

      image: "",

      level: 2,

      parentId: "KIDS_FASHION",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 3,

      children: [

        {
          id: "BABY_CLOTHING",
          name: "Clothing",
          slug: "baby-clothing",
          description: "Baby Clothing",
          icon: "Baby",
          image: "",
          level: 3,
          parentId: "BABY",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
        },

        {
          id: "BABY_FOOTWEAR",
          name: "Footwear",
          slug: "baby-footwear",
          description: "Baby Footwear",
          icon: "Footprints",
          image: "",
          level: 3,
          parentId: "BABY",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2,
        },

        {
          id: "BABY_ACCESSORIES",
          name: "Accessories",
          slug: "baby-accessories",
          description: "Baby Accessories",
          icon: "Baby",
          image: "",
          level: 3,
          parentId: "BABY",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3,
        }
      ]
    }
  ]
},
], // End FASHION children

  }, // End FASHION
  {
  id: "GROCERY",

  name: "Grocery",

  slug: "grocery",

  description: "Daily Grocery Essentials",

  icon: "ShoppingBasket",

  image: "/categories/grocery.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 2,

  children: [

    {
      id: "GROCERY_FOODGRAINS",

      name: "Foodgrains",

      slug: "foodgrains",

      description: "Rice, Atta, Dal & Pulses",

      icon: "Package",

      image: "",

      level: 2,

      parentId: "GROCERY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "RICE",

          name: "Rice",

          slug: "rice",

          description: "All Types of Rice",

          icon: "Package",

          image: "",

          level: 3,

          parentId: "GROCERY_FOODGRAINS",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 1,

          keywords: [
            "rice",
            "basmati",
            "sona masoori",
            "ponni",
            "brown rice"
          ]
        },

        {
          id: "ATTA",

          name: "Atta & Flour",

          slug: "atta-flour",

          description: "Atta and Flour",

          icon: "Package",

          image: "",

          level: 3,

          parentId: "GROCERY_FOODGRAINS",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 2,

          keywords: [
            "atta",
            "flour",
            "wheat flour",
            "maida",
            "besan"
          ]
        },

        {
          id: "DAL_PULSES",

          name: "Dal & Pulses",

          slug: "dal-pulses",

          description: "Dal & Pulses",

          icon: "Package",

          image: "",

          level: 3,

          parentId: "GROCERY_FOODGRAINS",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 3,

          keywords: [
            "dal",
            "toor",
            "moong",
            "urad",
            "masoor"
          ]
        }

      ]

    },

    {
      id: "GROCERY_OIL_SPICES",

      name: "Oil & Spices",

      slug: "oil-spices",

      description: "Cooking Oils and Masalas",

      icon: "Package",

      image: "",

      level: 2,

      parentId: "GROCERY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "COOKING_OIL",

          name: "Cooking Oil",

          slug: "cooking-oil",

          description: "Edible Oils",

          icon: "Package",

          image: "",

          level: 3,

          parentId: "GROCERY_OIL_SPICES",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 1,

          keywords: [
            "oil",
            "sunflower",
            "mustard",
            "groundnut",
            "olive"
          ]
        },

        {
          id: "SPICES",

          name: "Spices & Masala",

          slug: "spices-masala",

          description: "Indian Masalas",

          icon: "Package",

          image: "",

          level: 3,

          parentId: "GROCERY_OIL_SPICES",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 2,

          keywords: [
            "masala",
            "spices",
            "turmeric",
            "chilli",
            "coriander"
          ]
        },

        {
          id: "SALT_SUGAR",

          name: "Salt & Sugar",

          slug: "salt-sugar",

          description: "Salt and Sugar",

          icon: "Package",

          image: "",

          level: 3,

          parentId: "GROCERY_OIL_SPICES",

          active: true,

          featured: false,

          searchable: true,

          sortOrder: 3,

          keywords: [
            "salt",
            "sugar",
            "rock salt",
            "jaggery"
          ]
       
        }
      ]
    }
  ]
},
{
  id: "GROCERY_BEVERAGES",

  name: "Beverages",

  slug: "beverages",

  description: "Tea, Coffee & Drinks",

  icon: "CupSoda",

  image: "",

  level: 2,

  parentId: "GROCERY",

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 3,

  children: [

    {
      id: "TEA",

      name: "Tea",

      slug: "tea",

      description: "Tea Products",

      icon: "CupSoda",

      image: "",

      level: 3,

      parentId: "GROCERY_BEVERAGES",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      keywords: [
        "tea",
        "green tea",
        "black tea",
        "masala tea"
      ],
    },

    {
      id: "COFFEE",

      name: "Coffee",

      slug: "coffee",

      description: "Coffee Products",

      icon: "CupSoda",

      image: "",

      level: 3,

      parentId: "GROCERY_BEVERAGES",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      keywords: [
        "coffee",
        "instant coffee",
        "filter coffee"
      ],
    },

    {
      id: "SOFT_DRINKS",

      name: "Soft Drinks",

      slug: "soft-drinks",

      description: "Soft Drinks",

      icon: "CupSoda",

      image: "",

      level: 3,

      parentId: "GROCERY_BEVERAGES",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 3,

      keywords: [
        "soft drink",
        "cola",
        "juice"
      ],
    }

  ],

},

{
  id: "GROCERY_SNACKS",

  name: "Snacks & Biscuits",

  slug: "snacks-biscuits",

  description: "Snacks & Biscuits",

  icon: "Cookie",

  image: "",

  level: 2,

  parentId: "GROCERY",

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 4,

  children: [

    {
      id: "BISCUITS",

      name: "Biscuits",

      slug: "biscuits",

      description: "Biscuits",

      icon: "Cookie",

      image: "",

      level: 3,

      parentId: "GROCERY_SNACKS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,
    },

    {
      id: "CHIPS",

      name: "Chips",

      slug: "chips",

      description: "Potato Chips",

      icon: "Cookie",

      image: "",

      level: 3,

      parentId: "GROCERY_SNACKS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,
    },

    {
      id: "NAMKEEN",

      name: "Namkeen",

      slug: "namkeen",

      description: "Indian Snacks",

      icon: "Cookie",

      image: "",

      level: 3,

      parentId: "GROCERY_SNACKS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 3,
    },

    {
      id: "CHOCOLATES",

      name: "Chocolates",

      slug: "chocolates",

      description: "Chocolate Products",

      icon: "Cookie",

      image: "",

      level: 3,

      parentId: "GROCERY_SNACKS",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 4,
    }

  ],

},

{
  id: "GROCERY_DAIRY",

  name: "Dairy & Bakery",

  slug: "dairy-bakery",

  description: "Milk Products & Bakery",

  icon: "Milk",

  image: "",

  level: 2,

  parentId: "GROCERY",

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 5,

  children: [

    {
      id: "MILK",

      name: "Milk",

      slug: "milk",

      description: "Milk",

      icon: "Milk",

      image: "",

      level: 3,

      parentId: "GROCERY_DAIRY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,
    },

    {
      id: "CURD",

      name: "Curd",

      slug: "curd",

      description: "Curd",

      icon: "Milk",

      image: "",

      level: 3,

      parentId: "GROCERY_DAIRY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,
    },

    {
      id: "BREAD",

      name: "Bread",

      slug: "bread",

      description: "Bread",

      icon: "Bread",

      image: "",

      level: 3,

      parentId: "GROCERY_DAIRY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 3,
    },

    {
      id: "CAKES",

      name: "Cakes",

      slug: "cakes",

      description: "Cake Products",

      icon: "Cake",

      image: "",

      level: 3,

      parentId: "GROCERY_DAIRY",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 4,
    }

  ],

},
{
  id: "BEAUTY",

  name: "Beauty",

  slug: "beauty",

  description: "Beauty, Personal Care & Grooming",

  icon: "Sparkles",

  image: "/categories/beauty.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 3,

  children: [

    {
      id: "BEAUTY_SKINCARE",

      name: "Skin Care",

      slug: "skin-care",

      description: "Skin Care Products",

      icon: "Sparkles",

      image: "",

      level: 2,

      parentId: "BEAUTY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "FACE_WASH",
          name: "Face Wash",
          slug: "face-wash",
          description: "Face Wash",
          icon: "Sparkles",
          image: "",
          level: 3,
          parentId: "BEAUTY_SKINCARE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
          keywords: ["face wash","cleanser","skin care"]
        },

        {
          id: "FACE_CREAM",
          name: "Face Cream",
          slug: "face-cream",
          description: "Face Cream",
          icon: "Sparkles",
          image: "",
          level: 3,
          parentId: "BEAUTY_SKINCARE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2,
          keywords: ["cream","moisturizer"]
        },

        {
          id: "FACE_SERUM",
          name: "Face Serum",
          slug: "face-serum",
          description: "Face Serum",
          icon: "Sparkles",
          image: "",
          level: 3,
          parentId: "BEAUTY_SKINCARE",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "SUNSCREEN",
          name: "Sunscreen",
          slug: "sunscreen",
          description: "Sunscreen",
          icon: "Sun",
          image: "",
          level: 3,
          parentId: "BEAUTY_SKINCARE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 4
        }

      ]

    },

    {
      id: "BEAUTY_HAIRCARE",

      name: "Hair Care",

      slug: "hair-care",

      description: "Hair Care Products",

      icon: "Scissors",

      image: "",

      level: 2,

      parentId: "BEAUTY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "SHAMPOO",
          name: "Shampoo",
          slug: "shampoo",
          description: "Shampoo",
          icon: "Scissors",
          image: "",
          level: 3,
          parentId: "BEAUTY_HAIRCARE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "CONDITIONER",
          name: "Conditioner",
          slug: "conditioner",
          description: "Conditioner",
          icon: "Scissors",
          image: "",
          level: 3,
          parentId: "BEAUTY_HAIRCARE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "HAIR_OIL",
          name: "Hair Oil",
          slug: "hair-oil",
          description: "Hair Oil",
          icon: "Scissors",
          image: "",
          level: 3,
          parentId: "BEAUTY_HAIRCARE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "HAIR_SERUM",
          name: "Hair Serum",
          slug: "hair-serum",
          description: "Hair Serum",
          icon: "Scissors",
          image: "",
          level: 3,
          parentId: "BEAUTY_HAIRCARE",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 4
        }

      ]

    },

    {
      id: "BEAUTY_MAKEUP",

      name: "Makeup",

      slug: "makeup",

      description: "Makeup Products",

      icon: "Palette",

      image: "",

      level: 2,

      parentId: "BEAUTY",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 3,

      children: [

        {
          id: "LIPSTICK",
          name: "Lipstick",
          slug: "lipstick",
          description: "Lipstick",
          icon: "Palette",
          image: "",
          level: 3,
          parentId: "BEAUTY_MAKEUP",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "FOUNDATION",
          name: "Foundation",
          slug: "foundation",
          description: "Foundation",
          icon: "Palette",
          image: "",
          level: 3,
          parentId: "BEAUTY_MAKEUP",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "COMPACT",
          name: "Compact Powder",
          slug: "compact-powder",
          description: "Compact Powder",
          icon: "Palette",
          image: "",
          level: 3,
          parentId: "BEAUTY_MAKEUP",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "MASCARA",
          name: "Mascara",
          slug: "mascara",
          description: "Mascara",
          icon: "Palette",
          image: "",
          level: 3,
          parentId: "BEAUTY_MAKEUP",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 4
        }

      ]

    }

  ]

},
{
  id: "ELECTRONICS",

  name: "Electronics",

  slug: "electronics",

  description: "Electronics & Gadgets",

  icon: "Cpu",

  image: "/categories/electronics.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 4,

  children: [

    {
      id: "ELECTRONICS_COMPUTERS",

      name: "Computers",

      slug: "computers",

      description: "Computers & Accessories",

      icon: "Laptop",

      image: "",

      level: 2,

      parentId: "ELECTRONICS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "LAPTOPS",
          name: "Laptops",
          slug: "laptops",
          description: "Laptop Computers",
          icon: "Laptop",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_COMPUTERS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
          keywords: ["laptop","notebook","computer"]
        },

        {
          id: "DESKTOPS",
          name: "Desktop Computers",
          slug: "desktop-computers",
          description: "Desktop PCs",
          icon: "Monitor",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_COMPUTERS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "MONITORS",
          name: "Monitors",
          slug: "monitors",
          description: "Computer Monitors",
          icon: "Monitor",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_COMPUTERS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "PRINTERS",
          name: "Printers",
          slug: "printers",
          description: "Printers & Scanners",
          icon: "Printer",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_COMPUTERS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 4
        }

      ]

    },

    {
      id: "ELECTRONICS_AUDIO",

      name: "Audio",

      slug: "audio",

      description: "Audio Devices",

      icon: "Headphones",

      image: "",

      level: 2,

      parentId: "ELECTRONICS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "HEADPHONES",
          name: "Headphones",
          slug: "headphones",
          description: "Headphones",
          icon: "Headphones",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_AUDIO",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "EARPHONES",
          name: "Earphones",
          slug: "earphones",
          description: "Earphones",
          icon: "Headphones",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_AUDIO",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "BLUETOOTH_SPEAKERS",
          name: "Bluetooth Speakers",
          slug: "bluetooth-speakers",
          description: "Wireless Speakers",
          icon: "Speaker",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_AUDIO",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "SOUNDBARS",
          name: "Soundbars",
          slug: "soundbars",
          description: "Home Audio",
          icon: "Speaker",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_AUDIO",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 4
        }

      ]

    },

    {
      id: "ELECTRONICS_CAMERAS",

      name: "Cameras",

      slug: "cameras",

      description: "Photography",

      icon: "Camera",

      image: "",

      level: 2,

      parentId: "ELECTRONICS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 3,

      children: [

        {
          id: "DSLR_CAMERAS",
          name: "DSLR Cameras",
          slug: "dslr-cameras",
          description: "DSLR Cameras",
          icon: "Camera",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_CAMERAS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "MIRRORLESS_CAMERAS",
          name: "Mirrorless Cameras",
          slug: "mirrorless-cameras",
          description: "Mirrorless Cameras",
          icon: "Camera",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_CAMERAS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "ACTION_CAMERAS",
          name: "Action Cameras",
          slug: "action-cameras",
          description: "Action Cameras",
          icon: "Camera",
          image: "",
          level: 3,
          parentId: "ELECTRONICS_CAMERAS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 3
        }

      ]

    }

  ]

},
{
  id: "MOBILES",

  name: "Mobiles",

  slug: "mobiles",

  description: "Smartphones & Mobile Accessories",

  icon: "Smartphone",

  image: "/categories/mobiles.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 5,

  children: [

    {
      id: "MOBILES_PHONES",

      name: "Mobile Phones",

      slug: "mobile-phones",

      description: "Smartphones & Feature Phones",

      icon: "Smartphone",

      image: "",

      level: 2,

      parentId: "MOBILES",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "SMARTPHONES",
          name: "Smartphones",
          slug: "smartphones",
          description: "Android & iPhone",
          icon: "Smartphone",
          image: "",
          level: 3,
          parentId: "MOBILES_PHONES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
          keywords: [
            "android",
            "iphone",
            "5g",
            "smartphone"
          ]
        },

        {
          id: "FEATURE_PHONES",
          name: "Feature Phones",
          slug: "feature-phones",
          description: "Basic Mobile Phones",
          icon: "Phone",
          image: "",
          level: 3,
          parentId: "MOBILES_PHONES",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 2,
          keywords: [
            "feature phone",
            "keypad phone"
          ]
        }

      ]

    },

    {
      id: "MOBILES_ACCESSORIES",

      name: "Accessories",

      slug: "accessories",

      description: "Mobile Accessories",

      icon: "Cable",

      image: "",

      level: 2,

      parentId: "MOBILES",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "CHARGERS",
          name: "Chargers",
          slug: "chargers",
          description: "Mobile Chargers",
          icon: "Cable",
          image: "",
          level: 3,
          parentId: "MOBILES_ACCESSORIES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "POWER_BANKS",
          name: "Power Banks",
          slug: "power-banks",
          description: "Power Banks",
          icon: "Battery",
          image: "",
          level: 3,
          parentId: "MOBILES_ACCESSORIES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "MOBILE_CASES",
          name: "Cases & Covers",
          slug: "cases-covers",
          description: "Cases & Covers",
          icon: "Shield",
          image: "",
          level: 3,
          parentId: "MOBILES_ACCESSORIES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "SCREEN_PROTECTORS",
          name: "Screen Protectors",
          slug: "screen-protectors",
          description: "Tempered Glass & Screen Guards",
          icon: "Shield",
          image: "",
          level: 3,
          parentId: "MOBILES_ACCESSORIES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 4
        },

        {
          id: "EARBUDS",
          name: "Earbuds",

          slug: "earbuds",

          description: "True Wireless Earbuds",

          icon: "Headphones",

          image: "",

          level: 3,

          parentId: "MOBILES_ACCESSORIES",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 5
        }

      ]

    }

  ]
},
{
  id: "APPLIANCES",

  name: "Appliances",

  slug: "appliances",

  description: "Home & Kitchen Appliances",

  icon: "Home",

  image: "/categories/appliances.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 6,

  children: [

    {
      id: "HOME_APPLIANCES",

      name: "Home Appliances",

      slug: "home-appliances",

      description: "Large Home Appliances",

      icon: "Home",

      image: "",

      level: 2,

      parentId: "APPLIANCES",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "TELEVISIONS",
          name: "Televisions",
          slug: "televisions",
          description: "LED, OLED & Smart TVs",
          icon: "Tv",
          image: "",
          level: 3,
          parentId: "HOME_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
          keywords: [
            "tv",
            "smart tv",
            "led",
            "oled"
          ]
        },

        {
          id: "REFRIGERATORS",
          name: "Refrigerators",
          slug: "refrigerators",
          description: "Single & Double Door Refrigerators",
          icon: "Refrigerator",
          image: "",
          level: 3,
          parentId: "HOME_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "WASHING_MACHINES",
          name: "Washing Machines",
          slug: "washing-machines",
          description: "Automatic & Semi Automatic",
          icon: "WashingMachine",
          image: "",
          level: 3,
          parentId: "HOME_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "AIR_CONDITIONERS",
          name: "Air Conditioners",
          slug: "air-conditioners",
          description: "Split & Window AC",
          icon: "Snowflake",
          image: "",
          level: 3,
          parentId: "HOME_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 4
        }

      ]

    },

    {
      id: "KITCHEN_APPLIANCES",

      name: "Kitchen Appliances",

      slug: "kitchen-appliances",

      description: "Kitchen Essentials",

      icon: "ChefHat",

      image: "",

      level: 2,

      parentId: "APPLIANCES",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "MICROWAVE_OVENS",
          name: "Microwave Ovens",
          slug: "microwave-ovens",
          description: "Microwave Ovens",
          icon: "Microwave",
          image: "",
          level: 3,
          parentId: "KITCHEN_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "MIXER_GRINDERS",
          name: "Mixer Grinders",
          slug: "mixer-grinders",
          description: "Mixer Grinders",
          icon: "Blender",
          image: "",
          level: 3,
          parentId: "KITCHEN_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "INDUCTION_COOKTOPS",
          name: "Induction Cooktops",
          slug: "induction-cooktops",
          description: "Induction Stoves",
          icon: "Flame",
          image: "",
          level: 3,
          parentId: "KITCHEN_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        },

        {
          id: "WATER_PURIFIERS",
          name: "Water Purifiers",
          slug: "water-purifiers",
          description: "RO & UV Water Purifiers",
          icon: "Droplets",
          image: "",
          level: 3,
          parentId: "KITCHEN_APPLIANCES",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 4
        }

      ]

    },

    {
      id: "SMALL_APPLIANCES",

      name: "Small Appliances",

      slug: "small-appliances",

      description: "Daily Use Appliances",

      icon: "Plug",

      image: "",

      level: 2,

      parentId: "APPLIANCES",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 3,

      children: [

        {
          id: "ELECTRIC_KETTLES",
          name: "Electric Kettles",
          slug: "electric-kettles",
          description: "Electric Kettles",
          icon: "CupSoda",
          image: "",
          level: 3,
          parentId: "SMALL_APPLIANCES",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "IRONS",
          name: "Irons",
          slug: "irons",
          description: "Steam & Dry Irons",
          icon: "Shirt",
          image: "",
          level: 3,
          parentId: "SMALL_APPLIANCES",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "VACUUM_CLEANERS",
          name: "Vacuum Cleaners",
          slug: "vacuum-cleaners",
          description: "Vacuum Cleaners",
          icon: "Sparkles",
          image: "",
          level: 3,
          parentId: "SMALL_APPLIANCES",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 3
        }

      ]

    }

  ]

},
{
  id: "FURNITURE",

  name: "Furniture",

  slug: "furniture",

  description: "Home & Office Furniture",

  icon: "Sofa",

  image: "/categories/furniture.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 7,

  children: [

    {
      id: "LIVING_ROOM",

      name: "Living Room",

      slug: "living-room",

      description: "Living Room Furniture",

      icon: "Sofa",

      image: "",

      level: 2,

      parentId: "FURNITURE",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "SOFAS",
          name: "Sofas",
          slug: "sofas",
          description: "Sofas & Couches",
          icon: "Sofa",
          image: "",
          level: 3,
          parentId: "LIVING_ROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
          keywords: ["sofa","couch","living room"]
        },

        {
          id: "TV_UNITS",
          name: "TV Units",
          slug: "tv-units",
          description: "TV Cabinets",
          icon: "Tv",
          image: "",
          level: 3,
          parentId: "LIVING_ROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "COFFEE_TABLES",
          name: "Coffee Tables",
          slug: "coffee-tables",
          description: "Coffee Tables",
          icon: "Table",
          image: "",
          level: 3,
          parentId: "LIVING_ROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        }

      ]

    },

    {
      id: "BEDROOM",

      name: "Bedroom",

      slug: "bedroom",

      description: "Bedroom Furniture",

      icon: "Bed",

      image: "",

      level: 2,

      parentId: "FURNITURE",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "BEDS",
          name: "Beds",
          slug: "beds",
          description: "Beds",
          icon: "Bed",
          image: "",
          level: 3,
          parentId: "BEDROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "MATTRESSES",
          name: "Mattresses",
          slug: "mattresses",
          description: "Mattresses",
          icon: "Bed",
          image: "",
          level: 3,
          parentId: "BEDROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "WARDROBES",
          name: "Wardrobes",
          slug: "wardrobes",
          description: "Wardrobes",
          icon: "Cabinet",
          image: "",
          level: 3,
          parentId: "BEDROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        }

      ]

    },

    {
      id: "DINING_ROOM",

      name: "Dining Room",

      slug: "dining-room",

      description: "Dining Furniture",

      icon: "Utensils",

      image: "",

      level: 2,

      parentId: "FURNITURE",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 3,

      children: [

        {
          id: "DINING_TABLES",
          name: "Dining Tables",
          slug: "dining-tables",
          description: "Dining Tables",
          icon: "Table",
          image: "",
          level: 3,
          parentId: "DINING_ROOM",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "DINING_CHAIRS",
          name: "Dining Chairs",
          slug: "dining-chairs",
          description: "Dining Chairs",
          icon: "Armchair",
          image: "",
          level: 3,
          parentId: "DINING_ROOM",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 2
        }

      ]

    },

    {
      id: "OFFICE_FURNITURE",

      name: "Office Furniture",

      slug: "office-furniture",

      description: "Office Furniture",

      icon: "Briefcase",

      image: "",

      level: 2,

      parentId: "FURNITURE",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 4,

      children: [

        {
          id: "OFFICE_CHAIRS",
          name: "Office Chairs",
          slug: "office-chairs",
          description: "Office Chairs",
          icon: "Armchair",
          image: "",
          level: 3,
          parentId: "OFFICE_FURNITURE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "OFFICE_DESKS",
          name: "Office Desks",
          slug: "office-desks",
          description: "Office Desks",
          icon: "Table",
          image: "",
          level: 3,
          parentId: "OFFICE_FURNITURE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "BOOKSHELVES",
          name: "Bookshelves",
          slug: "bookshelves",
          description: "Bookshelves",
          icon: "Library",
          image: "",
          level: 3,
          parentId: "OFFICE_FURNITURE",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 3
        }

      ]

    }

  ]

},
{
  id: "BOOKS",

  name: "Books",

  slug: "books",

  description: "Books, Education & Reading",

  icon: "BookOpen",

  image: "/categories/books.jpg",

  level: 1,

  active: true,

  featured: true,

  searchable: true,

  sortOrder: 8,

  children: [

    {
      id: "ACADEMIC_BOOKS",

      name: "Academic Books",

      slug: "academic-books",

      description: "School & College Books",

      icon: "GraduationCap",

      image: "",

      level: 2,

      parentId: "BOOKS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 1,

      children: [

        {
          id: "SCHOOL_BOOKS",
          name: "School Books",
          slug: "school-books",
          description: "School Textbooks",
          icon: "BookOpen",
          image: "",
          level: 3,
          parentId: "ACADEMIC_BOOKS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1,
          keywords: [
            "school",
            "cbse",
            "icse",
            "state board"
          ]
        },

        {
          id: "COLLEGE_BOOKS",
          name: "College Books",
          slug: "college-books",
          description: "College & University Books",
          icon: "BookOpen",
          image: "",
          level: 3,
          parentId: "ACADEMIC_BOOKS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "COMPETITIVE_EXAMS",
          name: "Competitive Exams",
          slug: "competitive-exams",
          description: "UPSC, SSC, Banking, NEET, JEE",
          icon: "BookOpen",
          image: "",
          level: 3,
          parentId: "ACADEMIC_BOOKS",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 3
        }

      ]

    },

    {
      id: "LITERATURE",

      name: "Literature",

      slug: "literature",

      description: "Novels & Literature",

      icon: "Library",

      image: "",

      level: 2,

      parentId: "BOOKS",

      active: true,

      featured: true,

      searchable: true,

      sortOrder: 2,

      children: [

        {
          id: "NOVELS",
          name: "Novels",
          slug: "novels",
          description: "Fiction & Literature",
          icon: "Book",
          image: "",
          level: 3,
          parentId: "LITERATURE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "CHILDREN_BOOKS",
          name: "Children Books",
          slug: "children-books",
          description: "Kids Books",
          icon: "Book",
          image: "",
          level: 3,
          parentId: "LITERATURE",
          active: true,
          featured: true,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "COMICS",
          name: "Comics",

          slug: "comics",

          description: "Comic Books",

          icon: "Book",

          image: "",

          level: 3,

          parentId: "LITERATURE",

          active: true,

          featured: true,

          searchable: true,

          sortOrder: 3
        }

      ]

    },

    {
      id: "RELIGIOUS_BOOKS",

      name: "Religious & Spiritual",

      slug: "religious-books",

      description: "Religious Books",

      icon: "BookHeart",

      image: "",

      level: 2,

      parentId: "BOOKS",

      active: true,

      featured: false,

      searchable: true,

      sortOrder: 3,

      children: [

        {
          id: "HINDU_BOOKS",
          name: "Hindu Books",
          slug: "hindu-books",
          description: "Hindu Religious Books",
          icon: "BookHeart",
          image: "",
          level: 3,
          parentId: "RELIGIOUS_BOOKS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 1
        },

        {
          id: "ISLAMIC_BOOKS",
          name: "Islamic Books",
          slug: "islamic-books",
          description: "Islamic Books",
          icon: "BookHeart",
          image: "",
          level: 3,
          parentId: "RELIGIOUS_BOOKS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 2
        },

        {
          id: "CHRISTIAN_BOOKS",
          name: "Christian Books",
          slug: "christian-books",
          description: "Christian Books",
          icon: "BookHeart",
          image: "",
          level: 3,
          parentId: "RELIGIOUS_BOOKS",
          active: true,
          featured: false,
          searchable: true,
          sortOrder: 3
        }

      ]

    }

  ]

},
]; // End catalogTree