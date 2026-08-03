export interface CategoryField {

  // Database Key
  id: string;

  // UI Label
  label: string;

  // Field Type
  type:
    | "text"
    | "number"
    | "textarea"
    | "select"
    | "multiselect"
    | "checkbox"
    | "radio"
    | "date"
    | "color"
    | "image";

  // UI Group
  group?: string;
  displayOrder?: number;

  // Placeholder
  placeholder?: string;

  // Help Text
  helpText?: string;

  // Validation
  required?: boolean;
  minLength?: number;

maxLength?: number;

minValue?: number;

maxValue?: number;

validationMessage?: string;
allowCustomValue?: boolean;
  // Dropdown Values
  options?: string[];


  // Marketplace Features
  searchable?: boolean;

  filterable?: boolean;

  sortable?: boolean;

  // Visibility
  visibleOnCard?: boolean;

  visibleOnDetails?: boolean;

  visibleToSeller?: boolean;

  visibleToCustomer?: boolean;

  // Default Value
  defaultValue?: string;

}

export const categoryFields: Record<string, CategoryField[]> = {

  MEN_TSHIRTS: [

   {
  id: "material",

  label: "Material",

  type: "select",

  group: "Material & Fabric",

  placeholder: "Select Material",

  helpText: "Choose the primary fabric used.",

  required: true,

  searchable: true,

  filterable: true,

  sortable: false,

  visibleOnCard: true,

  visibleOnDetails: true,

  visibleToSeller: true,

  visibleToCustomer: true,

  options: [
    "100% Cotton",
   "Cotton Blend",
   "Organic Cotton",
   "Combed Cotton",
   "Linen",
   "Rayon",
   "Polyester",
   "Poly Cotton",
   "Viscose",
   "Silk",
  ],
},

{
  id: "fitType",

  label: "Fit",

  type: "select",

  group: "Size & Fit",

  required: true,

  searchable: true,

  filterable: true,

  visibleOnDetails: true,

  visibleToSeller: true,

  visibleToCustomer: true,
  displayOrder:2,

allowCustomValue:false,

  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
    "Boxy Fit"
  ],
},

    {
      id: "neckType",
      label: "Neck Type",
      type: "select",
      group: "Design & Style",
    
      displayOrder: 3,
      allowCustomValue: false,
      options: [
        "Round Neck",
        "V Neck",
        "Polo",
      ],
    },

    {
      id: "sleeveType",
      label: "Sleeve Type",
      type: "select",
      group:"Size & Fit",
      displayOrder: 4,
      allowCustomValue: false,
      options: [
        "Half Sleeve",
        "Full Sleeve",
        "Sleeveless",
      ],
    },
    {
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Design & Style",
  options: [
    "Solid",
    "Printed",
    "Striped",
    "Graphic Print",
    "Typography",
    "Checked",
    "Color Block"
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Sports",
    "Party",
    "Office",
    "Travel",
    "Gym"
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design & Style",
  options: [
    "Pullover",
    "Button",
    "Zip"
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch"
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean"
  ],
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "packOf",
  label: "Pack Of",
  type: "number",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},
  ],
  MEN_SHIRTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Polyester",
    "Rayon",
    "Silk",
    "Denim",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Tailored Fit",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Size & Fit",
  options: [
    "Full Sleeve",
    "Half Sleeve",
    "Roll Up Sleeve",
  ],
},

{
  id: "collarType",
  label: "Collar Type",
  type: "select",
  group: "Design",
  options: [
    "Spread Collar",
    "Mandarin",
    "Button Down",
    "Cuban",
    "Chinese Collar",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Design",
  options: [
    "Solid",
    "Checked",
    "Striped",
    "Printed",
    "Floral",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Formal",
    "Party",
    "Office",
    "Wedding",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "Single Pocket",
    "Double Pocket",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

],
MEN_JEANS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "100% Denim",
    "Cotton Denim",
    "Stretch Denim",
    "Organic Denim",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Skinny",
    "Slim",
    "Regular",
    "Relaxed",
    "Straight",
    "Bootcut",
    "Loose",
  ],
},

{
  id: "rise",
  label: "Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Low Rise",
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Regular",
    "Full Length",
  ],
},

{
  id: "wash",
  label: "Wash",
  type: "select",
  group: "Appearance",
  options: [
    "Light Wash",
    "Medium Wash",
    "Dark Wash",
    "Acid Wash",
    "Stone Wash",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "distress",
  label: "Distressed",
  type: "select",
  group: "Appearance",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Faded",
    "Printed",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Button & Zip",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "4 Pocket",
    "5 Pocket",
    "6 Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Travel",
    "Outdoor",
    "Party",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_TROUSERS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Polyester",
    "Rayon",
    "Wool Blend",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Straight Fit",
    "Tapered Fit",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Low Rise",
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Regular",
    "Full Length",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Checked",
    "Striped",
    "Printed",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Button & Zip",
    "Drawstring",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "2 Pocket",
    "4 Pocket",
    "6 Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Formal",
    "Office",
    "Travel",
    "Party",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_SHORTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Denim",
    "Linen",
    "Polyester",
    "Nylon",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Loose Fit",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Above Knee",
    "Knee Length",
    "Below Knee",
  ],
},

{
  id: "waistType",
  label: "Waist Type",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Button",
    "Drawstring",
    "Elastic + Drawstring",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Striped",
    "Checked",
    "Camouflage",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "2 Pocket",
    "4 Pocket",
    "Cargo Pocket",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Sports",
    "Travel",
    "Beach",
    "Gym",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_TRACK_PANTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Polyester",
    "Nylon",
    "Fleece",
    "Spandex",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Jogger Fit",
  ],
},

{
  id: "waistType",
  label: "Waist Type",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Elastic + Drawstring",
    "Drawstring",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Full Length",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Striped",
    "Color Block",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "2 Pocket",
    "4 Pocket",
    "Zip Pocket",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "occasion",
  label: "Usage",
  type: "select",
  group: "Usage",
  options: [
    "Sports",
    "Gym",
    "Running",
    "Casual",
    "Travel",
    "Yoga",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_HOODIES: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Fleece",
    "Polyester",
    "Wool Blend",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
  ],
},

{
  id: "hoodType",
  label: "Hood Type",
  type: "select",
  group: "Design",
  options: [
    "Fixed Hood",
    "Adjustable Hood",
    "No Hood",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Pullover",
    "Zip",
    "Half Zip",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Full Sleeve",
    "Half Sleeve",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "Kangaroo Pocket",
    "Side Pocket",
    "Zip Pocket",
    "No Pocket",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Graphic",
    "Color Block",
    "Striped",
  ],
},

{
  id: "occasion",
  label: "Usage",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Sports",
    "Gym",
    "Travel",
    "Winter Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_JACKETS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Leather",
    "Faux Leather",
    "Denim",
    "Cotton",
    "Polyester",
    "Nylon",
    "Wool",
    "Fleece",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
  ],
},

{
  id: "jacketType",
  label: "Jacket Type",
  type: "select",
  group: "Design",
  options: [
    "Bomber",
    "Biker",
    "Denim",
    "Puffer",
    "Windcheater",
    "Quilted",
    "Varsity",
    "Rain Jacket",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Zip",
    "Button",
    "Zip & Button",
  ],
},

{
  id: "hoodType",
  label: "Hood",
  type: "select",
  group: "Design",
  options: [
    "With Hood",
    "Without Hood",
    "Detachable Hood",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Full Sleeve",
    "Sleeveless",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "2 Pocket",
    "4 Pocket",
    "Zip Pocket",
    "Multiple Pocket",
  ],
},

{
  id: "lining",
  label: "Inner Lining",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Yes",
    "No",
    "Fleece",
    "Polyester",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Usage",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Travel",
    "Bike Riding",
    "Winter",
    "Sports",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},
],
MEN_BLAZERS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Polyester",
    "Wool",
    "Wool Blend",
    "Velvet",
    "Tweed",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Tailored Fit",
    "Relaxed Fit",
  ],
},

{
  id: "blazerType",
  label: "Blazer Type",
  type: "select",
  group: "Design",
  options: [
    "Single Breasted",
    "Double Breasted",
    "Casual",
    "Formal",
    "Party Wear",
  ],
},

{
  id: "lapelType",
  label: "Lapel Type",
  type: "select",
  group: "Design",
  options: [
    "Notch",
    "Peak",
    "Shawl",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Single Button",
    "Two Button",
    "Three Button",
    "Double Button",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Full Sleeve",
  ],
},

{
  id: "lining",
  label: "Inner Lining",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Fully Lined",
    "Half Lined",
    "Unlined",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Checked",
    "Striped",
    "Textured",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Formal",
    "Office",
    "Wedding",
    "Party",
    "Business",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Dry Clean",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_ETHNIC: [

{
  id: "ethnicType",
  label: "Ethnic Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Kurta",
    "Kurta Set",
    "Sherwani",
    "Nehru Jacket",
    "Dhoti",
    "Pathani Suit",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Silk",
    "Art Silk",
    "Rayon",
    "Viscose",
    "Polyester",
    "Jacquard",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Mandarin",
    "Round Neck",
    "Band Collar",
    "Chinese Collar",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Full Sleeve",
    "Half Sleeve",
    "Sleeveless",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Embroidered",
    "Self Design",
    "Floral",
    "Checked",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Wedding",
    "Festival",
    "Party",
    "Traditional",
    "Casual",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_INNERWEAR: [

{
  id: "innerwearType",
  label: "Innerwear Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Briefs",
    "Boxers",
    "Trunks",
    "Vest",
    "Thermal Top",
    "Thermal Bottom",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "100% Cotton",
    "Cotton Blend",
    "Modal",
    "Bamboo",
    "Polyester",
    "Spandex",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Body Fit",
    "Relaxed Fit",
  ],
},

{
  id: "waistband",
  label: "Waistband",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Soft Elastic",
    "Logo Elastic",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Striped",
    "Checked",
  ],
},

{
  id: "packOf",
  label: "Pack Of",
  type: "number",
  group: "General",
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Low Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "occasion",
  label: "Usage",
  type: "select",
  group: "Usage",
  options: [
    "Daily Wear",
    "Sports",
    "Gym",
    "Winter",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_NIGHTWEAR: [

{
  id: "nightwearType",
  label: "Nightwear Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Pyjama Set",
    "Night Suit",
    "T-Shirt & Shorts",
    "Kurta Pyjama",
    "Lounge Wear",
    "Robe",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "100% Cotton",
    "Cotton Blend",
    "Rayon",
    "Modal",
    "Satin",
    "Silk",
    "Polyester",
    "Fleece",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Relaxed Fit",
    "Slim Fit",
    "Loose Fit",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Half Sleeve",
    "Full Sleeve",
    "Sleeveless",
  ],
},

{
  id: "bottomType",
  label: "Bottom Type",
  type: "select",
  group: "Design",
  options: [
    "Pyjama",
    "Shorts",
    "Track Pants",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Checked",
    "Striped",
    "Graphic",
  ],
},

{
  id: "season",
  label: "Season",
  type: "select",
  group: "Usage",
  options: [
    "Summer",
    "Winter",
    "All Season",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "packOf",
  label: "Pack Of",
  type: "number",
  group: "General",
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
MEN_SHOES: [

{
  id: "shoeType",
  label: "Shoe Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Casual Shoes",
    "Formal Shoes",
    "Sports Shoes",
    "Running Shoes",
    "Sneakers",
    "Loafers",
    "Boots",
    "Sandals",
    "Flip Flops",
  ],
},

{
  id: "material",
  label: "Upper Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Synthetic Leather",
    "Mesh",
    "Canvas",
    "Suede",
    "Fabric",
    "PU",
    "Rubber",
  ],
},

{
  id: "soleMaterial",
  label: "Sole Material",
  type: "select",
  group: "Material",
  options: [
    "Rubber",
    "TPR",
    "PVC",
    "PU",
    "EVA",
    "Phylon",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Lace-Up",
    "Slip-On",
    "Velcro",
    "Zip",
    "Buckle",
  ],
},

{
  id: "toeShape",
  label: "Toe Shape",
  type: "select",
  group: "Design",
  options: [
    "Round Toe",
    "Square Toe",
    "Pointed Toe",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Formal",
    "Sports",
    "Party",
    "Outdoor",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "antiSkid",
  label: "Anti Skid",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
MEN_WALLETS: [

{
  id: "walletType",
  label: "Wallet Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Bi-Fold",
    "Tri-Fold",
    "Card Holder",
    "Money Clip Wallet",
    "Passport Wallet",
    "Zip Wallet",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Genuine Leather",
    "Faux Leather",
    "Canvas",
    "Fabric",
    "PU Leather",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Open",
    "Button",
    "Magnetic",
    "Zip",
  ],
},

{
  id: "cardSlots",
  label: "Card Slots",
  type: "number",
  group: "Storage",
},

{
  id: "coinPocket",
  label: "Coin Pocket",
  type: "select",
  group: "Storage",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "idWindow",
  label: "ID Window",
  type: "select",
  group: "Storage",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "rfidProtection",
  label: "RFID Protection",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Daily",
    "Office",
    "Travel",
    "Gift",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "dimensions",
  label: "Dimensions",
  type: "text",
  group: "Dimensions",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
MEN_BELTS: [

{
  id: "beltType",
  label: "Belt Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Formal Belt",
    "Casual Belt",
    "Reversible Belt",
    "Braided Belt",
    "Canvas Belt",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Genuine Leather",
    "Faux Leather",
    "Canvas",
    "Nylon",
    "PU Leather",
  ],
},

{
  id: "beltWidth",
  label: "Belt Width",
  type: "select",
  group: "Dimensions",
  options: [
    "25 mm",
    "30 mm",
    "35 mm",
    "40 mm",
    "45 mm",
  ],
},

{
  id: "buckleType",
  label: "Buckle Type",
  type: "select",
  group: "Design",
  options: [
    "Pin Buckle",
    "Auto Lock",
    "Clamp Buckle",
    "Reversible Buckle",
  ],
},

{
  id: "buckleMaterial",
  label: "Buckle Material",
  type: "select",
  group: "Material",
  options: [
    "Steel",
    "Alloy",
    "Brass",
    "Zinc Alloy",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Formal",
    "Casual",
    "Party",
    "Office",
  ],
},

{
  id: "adjustable",
  label: "Adjustable",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "reversible",
  label: "Reversible",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
MEN_WATCHES: [

{
  id: "watchType",
  label: "Watch Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Analog",
    "Digital",
    "Analog-Digital",
    "Smart Watch",
    "Chronograph",
  ],
},

{
  id: "displayType",
  label: "Display Type",
  type: "select",
  group: "Display",
  options: [
    "Analog",
    "Digital",
    "AMOLED",
    "LCD",
    "LED",
  ],
},

{
  id: "strapMaterial",
  label: "Strap Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Silicone",
    "Stainless Steel",
    "Metal",
    "Nylon",
    "Rubber",
  ],
},

{
  id: "dialShape",
  label: "Dial Shape",
  type: "select",
  group: "Design",
  options: [
    "Round",
    "Square",
    "Rectangle",
    "Oval",
  ],
},

{
  id: "dialColor",
  label: "Dial Color",
  type: "color",
  group: "Appearance",
},

{
  id: "waterResistance",
  label: "Water Resistance",
  type: "select",
  group: "Features",
  options: [
    "No",
    "30 m",
    "50 m",
    "100 m",
    "200 m",
  ],
},

{
  id: "movement",
  label: "Movement",
  type: "select",
  group: "Features",
  options: [
    "Quartz",
    "Automatic",
    "Mechanical",
    "Smart",
  ],
},

{
  id: "glassMaterial",
  label: "Glass Material",
  type: "select",
  group: "Material",
  options: [
    "Mineral Glass",
    "Sapphire",
    "Acrylic",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Formal",
    "Sports",
    "Party",
    "Daily Wear",
  ],
},

{
  id: "color",
  label: "Strap Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
MEN_SUNGLASSES: [

{
  id: "frameType",
  label: "Frame Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Aviator",
    "Wayfarer",
    "Round",
    "Square",
    "Rectangle",
    "Cat Eye",
    "Oversized",
    "Sports",
  ],
},

{
  id: "frameMaterial",
  label: "Frame Material",
  type: "select",
  group: "Material",
  options: [
    "Metal",
    "Plastic",
    "Acetate",
    "TR90",
    "Titanium",
  ],
},

{
  id: "lensMaterial",
  label: "Lens Material",
  type: "select",
  group: "Material",
  options: [
    "Glass",
    "Polycarbonate",
    "Acrylic",
  ],
},

{
  id: "lensColor",
  label: "Lens Color",
  type: "color",
  group: "Appearance",
},

{
  id: "frameColor",
  label: "Frame Color",
  type: "color",
  group: "Appearance",
},

{
  id: "uvProtection",
  label: "UV Protection",
  type: "select",
  group: "Features",
  options: [
    "UV400",
    "100% UV Protection",
    "No",
  ],
},

{
  id: "polarized",
  label: "Polarized",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Usage",
  type: "select",
  group: "Usage",
  options: [
    "Driving",
    "Casual",
    "Sports",
    "Travel",
    "Beach",
  ],
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
MEN_CAPS: [

{
  id: "capType",
  label: "Cap Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Baseball Cap",
    "Snapback",
    "Trucker Cap",
    "Beanie",
    "Bucket Hat",
    "Flat Cap",
    "Visor",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Cotton",
    "Cotton Blend",
    "Polyester",
    "Wool",
    "Denim",
    "Canvas",
    "Acrylic",
  ],
},

{
  id: "sizeType",
  label: "Size",
  type: "select",
  group: "Size",
  options: [
    "Free Size",
    "S",
    "M",
    "L",
    "XL",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Adjustable Strap",
    "Snap Closure",
    "Velcro",
    "Elastic",
    "Fitted",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Logo",
    "Striped",
    "Camouflage",
    "Checked",
  ],
},

{
  id: "season",
  label: "Season",
  type: "select",
  group: "Usage",
  options: [
    "Summer",
    "Winter",
    "All Season",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Sports",
    "Travel",
    "Outdoor",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Hand Wash",
    "Machine Wash",
    "Dry Clean",
  ],
},

],
MEN_BAGS: [

{
  id: "bagType",
  label: "Bag Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Backpack",
    "Laptop Bag",
    "Messenger Bag",
    "Duffel Bag",
    "Gym Bag",
    "Travel Bag",
    "Sling Bag",
    "Crossbody Bag",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Polyester",
    "Nylon",
    "Canvas",
    "Leather",
    "Faux Leather",
    "Fabric",
  ],
},

{
  id: "capacity",
  label: "Capacity",
  type: "select",
  group: "Storage",
  options: [
    "10 L",
    "20 L",
    "30 L",
    "40 L",
    "50 L",
    "60 L+",
  ],
},

{
  id: "compartments",
  label: "Compartments",
  type: "number",
  group: "Storage",
},

{
  id: "laptopCompatible",
  label: "Laptop Compatible",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Zip",
    "Button",
    "Magnetic",
    "Drawstring",
  ],
},

{
  id: "strapType",
  label: "Strap Type",
  type: "select",
  group: "Design",
  options: [
    "Single Strap",
    "Double Strap",
    "Adjustable Strap",
    "Padded Strap",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Office",
    "College",
    "Travel",
    "Gym",
    "Casual",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "dimensions",
  label: "Dimensions",
  type: "text",
  group: "Dimensions",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
  WOMEN_SAREES: [

{
  id: "fabric",
  label: "Fabric",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Silk",
    "Banarasi Silk",
    "Kanjivaram Silk",
    "Linen",
    "Chiffon",
    "Georgette",
    "Crepe",
    "Satin",
    "Organza",
    "Net",
    "Rayon",
  ],
},

{
  id: "sareeType",
  label: "Saree Type",
  type: "select",
  group: "General",
  options: [
    "Casual",
    "Party Wear",
    "Wedding",
    "Festival",
    "Designer",
    "Daily Wear",
  ],
},

{
  id: "length",
  label: "Length",
  type: "text",
  group: "Dimensions",
},

{
  id: "blousePiece",
  label: "Blouse Piece",
  type: "select",
  group: "General",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "border",
  label: "Border",
  type: "select",
  group: "Design",
  options: [
    "Plain",
    "Zari",
    "Embroidered",
    "Printed",
    "Contrast",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Embroidered",
    "Checked",
    "Striped",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Wedding",
    "Festival",
    "Party",
    "Office",
    "Casual",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Hand Wash",
    "Machine Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_KURTIS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Rayon",
    "Viscose",
    "Silk",
    "Linen",
    "Georgette",
    "Chiffon",
    "Crepe",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Straight",
    "A-Line",
    "Anarkali",
    "Regular",
    "Relaxed",
    "Flared",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Short",
    "Hip Length",
    "Knee Length",
    "Calf Length",
    "Ankle Length",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Mandarin Collar",
    "Boat Neck",
    "Sweetheart",
    "Keyhole",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Embroidered",
    "Checked",
    "Striped",
    "Self Design",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Festival",
    "Wedding",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_TOPS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Rayon",
    "Viscose",
    "Polyester",
    "Georgette",
    "Chiffon",
    "Linen",
    "Silk",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
    "Boxy Fit",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Boat Neck",
    "Square Neck",
    "Sweetheart",
    "Collared",
    "High Neck",
    "Halter Neck",
    "Off Shoulder",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Cap Sleeve",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
    "Puff Sleeve",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Crop",
    "Regular",
    "Longline",
    "Tunic",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Striped",
    "Checked",
    "Graphic",
    "Self Design",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Travel",
    "Daily Wear",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country Of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
 WOMEN_TSHIRTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "100% Cotton",
    "Cotton Blend",
    "Organic Cotton",
    "Polyester",
    "Rayon",
    "Viscose",
    "Linen",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
    "Boxy Fit",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Boat Neck",
    "Crew Neck",
    "Polo",
    "Collared",
    "High Neck",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Cap Sleeve",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Crop",
    "Regular",
    "Longline",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Graphic",
    "Striped",
    "Floral",
    "Typography",
    "Color Block",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Gym",
    "Travel",
    "Daily Wear",
    "Sports",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],  
WOMEN_SHIRTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Rayon",
    "Viscose",
    "Silk",
    "Polyester",
    "Georgette",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
    "Tailored Fit",
  ],
},

{
  id: "collarType",
  label: "Collar Type",
  type: "select",
  group: "Design",
  options: [
    "Spread Collar",
    "Mandarin Collar",
    "Button Down",
    "Cuban Collar",
    "Peter Pan Collar",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
    "Roll-Up Sleeve",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Tie-Up",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Checked",
    "Striped",
    "Floral",
    "Self Design",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "Single Pocket",
    "Double Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Formal",
    "Party",
    "Travel",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_JEANS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "100% Denim",
    "Cotton Denim",
    "Stretch Denim",
    "Organic Denim",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Skinny",
    "Slim",
    "Straight",
    "Bootcut",
    "Flared",
    "Boyfriend",
    "Mom Fit",
    "Wide Leg",
    "Relaxed",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Low Rise",
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Regular",
    "Full Length",
    "Cropped",
  ],
},

{
  id: "wash",
  label: "Wash",
  type: "select",
  group: "Appearance",
  options: [
    "Light Wash",
    "Medium Wash",
    "Dark Wash",
    "Acid Wash",
    "Stone Wash",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "distressed",
  label: "Distressed",
  type: "select",
  group: "Appearance",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Button & Zip",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "4 Pocket",
    "5 Pocket",
    "6 Pocket",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Faded",
    "Printed",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Travel",
    "Party",
    "Outdoor",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_TROUSERS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Rayon",
    "Viscose",
    "Polyester",
    "Wool Blend",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Straight Fit",
    "Wide Leg",
    "Tapered Fit",
    "Bootcut",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Low Rise",
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Regular",
    "Full Length",
    "Cropped",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Button & Zip",
    "Elastic Waist",
    "Drawstring",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Checked",
    "Striped",
    "Printed",
    "Self Design",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "2 Pocket",
    "4 Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Office",
    "Casual",
    "Formal",
    "Travel",
    "Party",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_LEGGINGS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Lycra",
    "Spandex",
    "Viscose",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Skin Fit",
    "Slim Fit",
    "Regular Fit",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Full Length",
    "Capri",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Low Rise",
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "waistband",
  label: "Waistband",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Elasticated",
    "Drawstring",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Striped",
    "Floral",
    "Graphic",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Daily Wear",
    "Gym",
    "Yoga",
    "Travel",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_PALAZZOS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Rayon",
    "Viscose",
    "Linen",
    "Silk",
    "Georgette",
    "Crepe",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Relaxed Fit",
    "Wide Leg",
    "Flared",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "waistband",
  label: "Waistband",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Drawstring",
    "Button",
    "Elastic + Drawstring",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Full Length",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Striped",
    "Checked",
    "Self Design",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "2 Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Festival",
    "Party",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_SKIRTS: [

{
  id: "skirtType",
  label: "Skirt Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Mini",
    "Midi",
    "Maxi",
    "A-Line",
    "Pencil",
    "Pleated",
    "Wrap",
    "Flared",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Denim",
    "Rayon",
    "Viscose",
    "Georgette",
    "Crepe",
    "Polyester",
    "Silk",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "A-Line",
    "Flared",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Low Rise",
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Mini",
    "Above Knee",
    "Knee Length",
    "Midi",
    "Maxi",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Button",
    "Zip",
    "Hook",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Checked",
    "Striped",
    "Pleated",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "2 Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Travel",
    "Festival",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_DRESSES: [

{
  id: "dressType",
  label: "Dress Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "A-Line",
    "Bodycon",
    "Fit & Flare",
    "Maxi",
    "Midi",
    "Mini",
    "Shirt Dress",
    "Wrap Dress",
    "Kaftan",
    "Gown",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Rayon",
    "Viscose",
    "Linen",
    "Georgette",
    "Chiffon",
    "Crepe",
    "Silk",
    "Satin",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Bodycon",
    "Flared",
    "A-Line",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Boat Neck",
    "Square Neck",
    "Sweetheart",
    "Off Shoulder",
    "Halter Neck",
    "High Neck",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Cap Sleeve",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
    "Puff Sleeve",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Mini",
    "Above Knee",
    "Knee Length",
    "Midi",
    "Maxi",
    "Floor Length",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Zip",
    "Button",
    "Tie-Up",
    "Pullover",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Checked",
    "Striped",
    "Self Design",
    "Embroidered",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Wedding",
    "Festival",
    "Travel",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_HOODIES: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Fleece",
    "Polyester",
    "Wool Blend",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
    "Crop Fit",
  ],
},

{
  id: "hoodType",
  label: "Hood Type",
  type: "select",
  group: "Design",
  options: [
    "Fixed Hood",
    "Adjustable Hood",
    "No Hood",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Pullover",
    "Zip",
    "Half Zip",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Full Sleeve",
    "Half Sleeve",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "Kangaroo Pocket",
    "Side Pocket",
    "Zip Pocket",
    "No Pocket",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Graphic",
    "Color Block",
    "Striped",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Travel",
    "Gym",
    "Sports",
    "Winter Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_JACKETS: [

{
  id: "jacketType",
  label: "Jacket Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Bomber",
    "Denim",
    "Leather",
    "Puffer",
    "Quilted",
    "Windcheater",
    "Rain Jacket",
    "Blazer Style",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Polyester",
    "Denim",
    "Leather",
    "Faux Leather",
    "Nylon",
    "Wool",
    "Fleece",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Oversized",
    "Crop Fit",
  ],
},

{
  id: "hoodType",
  label: "Hood",
  type: "select",
  group: "Design",
  options: [
    "With Hood",
    "Without Hood",
    "Detachable Hood",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Zip",
    "Button",
    "Zip & Button",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Full Sleeve",
    "Sleeveless",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "2 Pocket",
    "4 Pocket",
    "Zip Pocket",
  ],
},

{
  id: "lining",
  label: "Inner Lining",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Yes",
    "No",
    "Fleece",
    "Polyester",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Travel",
    "Office",
    "Winter",
    "Outdoor",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_BLAZERS: [

{
  id: "blazerType",
  label: "Blazer Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Single Breasted",
    "Double Breasted",
    "Longline",
    "Crop",
    "Formal",
    "Casual",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Polyester",
    "Wool Blend",
    "Velvet",
    "Tweed",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Slim Fit",
    "Regular Fit",
    "Relaxed Fit",
    "Tailored Fit",
    "Oversized",
  ],
},

{
  id: "lapelType",
  label: "Lapel Type",
  type: "select",
  group: "Design",
  options: [
    "Notch",
    "Peak",
    "Shawl",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Single Button",
    "Double Button",
    "Open Front",
    "Tie Belt",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Three Quarter Sleeve",
    "Full Sleeve",
    "Sleeveless",
  ],
},

{
  id: "lining",
  label: "Inner Lining",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Fully Lined",
    "Half Lined",
    "Unlined",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Checked",
    "Striped",
    "Textured",
    "Printed",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Office",
    "Formal",
    "Business",
    "Party",
    "Casual",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Dry Clean",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_INNERWEAR: [

{
  id: "innerwearType",
  label: "Innerwear Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Bra",
    "Sports Bra",
    "Panty",
    "Hipster",
    "Boyshort",
    "Shapewear",
    "Camisole",
    "Slip",
    "Thermal Top",
    "Thermal Bottom",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Modal",
    "Bamboo",
    "Lace",
    "Nylon",
    "Polyester",
    "Spandex",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Body Fit",
    "Comfort Fit",
  ],
},

{
  id: "padding",
  label: "Padding",
  type: "select",
  group: "Design",
  options: [
    "Padded",
    "Non Padded",
    "Lightly Padded",
  ],
},

{
  id: "wiring",
  label: "Wiring",
  type: "select",
  group: "Design",
  options: [
    "Underwired",
    "Non Underwired",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Hook",
    "Pull-On",
    "Front Open",
    "Back Open",
  ],
},

{
  id: "strapType",
  label: "Strap Type",
  type: "select",
  group: "Design",
  options: [
    "Regular",
    "Adjustable",
    "Transparent",
    "Multiway",
    "Strapless",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Low Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "packOf",
  label: "Pack Of",
  type: "number",
  group: "General",
},

{
  id: "occasion",
  label: "Usage",
  type: "select",
  group: "Usage",
  options: [
    "Daily Wear",
    "Sports",
    "Party",
    "Bridal",
    "Maternity",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Hand Wash",
    "Machine Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
WOMEN_NIGHTWEAR: [

{
  id: "nightwearType",
  label: "Nightwear Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Night Suit",
    "Pyjama Set",
    "T-Shirt & Pyjama",
    "T-Shirt & Shorts",
    "Night Gown",
    "Robe",
    "Lounge Wear",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Rayon",
    "Modal",
    "Satin",
    "Silk",
    "Viscose",
    "Polyester",
    "Fleece",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Relaxed Fit",
    "Loose Fit",
    "Slim Fit",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Collared",
    "Sweetheart",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
  ],
},

{
  id: "bottomType",
  label: "Bottom Type",
  type: "select",
  group: "Design",
  options: [
    "Pyjama",
    "Shorts",
    "Capri",
    "Track Pants",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Checked",
    "Striped",
    "Graphic",
  ],
},

{
  id: "season",
  label: "Season",
  type: "select",
  group: "Usage",
  options: [
    "Summer",
    "Winter",
    "All Season",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "packOf",
  label: "Pack Of",
  type: "number",
  group: "General",
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_SHOES: [

{
  id: "shoeType",
  label: "Shoe Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Heels",
    "Flats",
    "Sneakers",
    "Sports Shoes",
    "Sandals",
    "Boots",
    "Loafers",
    "Wedges",
    "Flip Flops",
    "Ethnic Footwear",
  ],
},

{
  id: "upperMaterial",
  label: "Upper Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Faux Leather",
    "Canvas",
    "Mesh",
    "Fabric",
    "PU",
    "Synthetic",
  ],
},

{
  id: "soleMaterial",
  label: "Sole Material",
  type: "select",
  group: "Material",
  options: [
    "Rubber",
    "PVC",
    "TPR",
    "EVA",
    "PU",
  ],
},

{
  id: "heelType",
  label: "Heel Type",
  type: "select",
  group: "Design",
  options: [
    "Flat",
    "Block Heel",
    "Stiletto",
    "Kitten Heel",
    "Platform",
    "Wedge",
  ],
},

{
  id: "heelHeight",
  label: "Heel Height",
  type: "select",
  group: "Dimensions",
  options: [
    "Flat",
    "1 Inch",
    "2 Inches",
    "3 Inches",
    "4 Inches",
    "5+ Inches",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Slip-On",
    "Lace-Up",
    "Velcro",
    "Zip",
    "Buckle",
  ],
},

{
  id: "toeShape",
  label: "Toe Shape",
  type: "select",
  group: "Design",
  options: [
    "Round Toe",
    "Square Toe",
    "Pointed Toe",
    "Open Toe",
    "Peep Toe",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Wedding",
    "Sports",
    "Travel",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
WOMEN_HANDBAGS: [

{
  id: "bagType",
  label: "Bag Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Handbag",
    "Tote Bag",
    "Shoulder Bag",
    "Sling Bag",
    "Crossbody Bag",
    "Clutch",
    "Satchel",
    "Hobo Bag",
    "Backpack",
    "Wallet Bag",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Faux Leather",
    "PU Leather",
    "Canvas",
    "Fabric",
    "Nylon",
    "Denim",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Zip",
    "Magnetic",
    "Button",
    "Drawstring",
    "Turn Lock",
  ],
},

{
  id: "strapType",
  label: "Strap Type",
  type: "select",
  group: "Design",
  options: [
    "Single Handle",
    "Double Handle",
    "Shoulder Strap",
    "Adjustable Strap",
    "Detachable Strap",
  ],
},

{
  id: "compartments",
  label: "Compartments",
  type: "number",
  group: "Storage",
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Textured",
    "Floral",
    "Checked",
    "Embroidered",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Wedding",
    "Travel",
  ],
},

{
  id: "dimensions",
  label: "Dimensions",
  type: "text",
  group: "Dimensions",
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
WOMEN_WALLETS: [

{
  id: "walletType",
  label: "Wallet Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Bi-Fold",
    "Zip Around",
    "Clutch Wallet",
    "Card Holder",
    "Coin Wallet",
    "Long Wallet",
    "Passport Wallet",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Genuine Leather",
    "Faux Leather",
    "PU Leather",
    "Canvas",
    "Fabric",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Zip",
    "Button",
    "Magnetic",
    "Snap Button",
  ],
},

{
  id: "cardSlots",
  label: "Card Slots",
  type: "number",
  group: "Storage",
},

{
  id: "coinPocket",
  label: "Coin Pocket",
  type: "select",
  group: "Storage",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "idWindow",
  label: "ID Window",
  type: "select",
  group: "Storage",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "rfidProtection",
  label: "RFID Protection",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Textured",
    "Floral",
    "Embroidered",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Daily",
    "Office",
    "Party",
    "Travel",
    "Gift",
  ],
},

{
  id: "dimensions",
  label: "Dimensions",
  type: "text",
  group: "Dimensions",
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
WOMEN_WATCHES: [

{
  id: "watchType",
  label: "Watch Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Analog",
    "Digital",
    "Analog-Digital",
    "Smart Watch",
    "Chronograph",
  ],
},

{
  id: "displayType",
  label: "Display Type",
  type: "select",
  group: "Display",
  options: [
    "Analog",
    "Digital",
    "AMOLED",
    "LCD",
    "LED",
  ],
},

{
  id: "strapMaterial",
  label: "Strap Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Silicone",
    "Stainless Steel",
    "Metal",
    "Ceramic",
    "Nylon",
  ],
},

{
  id: "dialShape",
  label: "Dial Shape",
  type: "select",
  group: "Design",
  options: [
    "Round",
    "Square",
    "Rectangle",
    "Oval",
  ],
},

{
  id: "dialColor",
  label: "Dial Color",
  type: "color",
  group: "Appearance",
},

{
  id: "waterResistance",
  label: "Water Resistance",
  type: "select",
  group: "Features",
  options: [
    "No",
    "30 m",
    "50 m",
    "100 m",
    "200 m",
  ],
},

{
  id: "movement",
  label: "Movement",
  type: "select",
  group: "Features",
  options: [
    "Quartz",
    "Automatic",
    "Mechanical",
    "Smart",
  ],
},

{
  id: "glassMaterial",
  label: "Glass Material",
  type: "select",
  group: "Material",
  options: [
    "Mineral Glass",
    "Sapphire",
    "Acrylic",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Wedding",
    "Daily Wear",
  ],
},

{
  id: "color",
  label: "Strap Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
WOMEN_JEWELLERY: [

{
  id: "jewelleryType",
  label: "Jewellery Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Necklace",
    "Pendant",
    "Earrings",
    "Ring",
    "Bracelet",
    "Bangle",
    "Anklet",
    "Mangalsutra",
    "Jewellery Set",
    "Nose Pin",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Gold",
    "Silver",
    "Rose Gold",
    "Platinum",
    "Brass",
    "Alloy",
    "Stainless Steel",
    "Oxidised",
  ],
},

{
  id: "stoneType",
  label: "Stone Type",
  type: "select",
  group: "Material",
  options: [
    "None",
    "Diamond",
    "American Diamond",
    "Pearl",
    "Ruby",
    "Emerald",
    "Sapphire",
    "Crystal",
    "Zircon",
  ],
},

{
  id: "finish",
  label: "Finish",
  type: "select",
  group: "Appearance",
  options: [
    "Glossy",
    "Matte",
    "Antique",
    "Oxidised",
    "Polished",
  ],
},

{
  id: "plating",
  label: "Plating",
  type: "select",
  group: "Material",
  options: [
    "Gold Plated",
    "Silver Plated",
    "Rose Gold Plated",
    "Rhodium Plated",
    "None",
  ],
},

{
  id: "adjustable",
  label: "Adjustable",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Daily Wear",
    "Office",
    "Party",
    "Wedding",
    "Festival",
    "Gift",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
WOMEN_SUNGLASSES: [

{
  id: "frameType",
  label: "Frame Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Aviator",
    "Wayfarer",
    "Round",
    "Square",
    "Cat Eye",
    "Butterfly",
    "Oversized",
    "Rectangle",
  ],
},

{
  id: "frameMaterial",
  label: "Frame Material",
  type: "select",
  group: "Material",
  options: [
    "Metal",
    "Plastic",
    "Acetate",
    "TR90",
    "Titanium",
  ],
},

{
  id: "lensMaterial",
  label: "Lens Material",
  type: "select",
  group: "Material",
  options: [
    "Glass",
    "Polycarbonate",
    "Acrylic",
  ],
},

{
  id: "lensColor",
  label: "Lens Color",
  type: "color",
  group: "Appearance",
},

{
  id: "frameColor",
  label: "Frame Color",
  type: "color",
  group: "Appearance",
},

{
  id: "uvProtection",
  label: "UV Protection",
  type: "select",
  group: "Features",
  options: [
    "UV400",
    "100% UV Protection",
    "No",
  ],
},

{
  id: "polarized",
  label: "Polarized",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Travel",
    "Beach",
    "Driving",
    "Party",
  ],
},

{
  id: "color",
  label: "Primary Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
WOMEN_SCARVES: [

{
  id: "scarfType",
  label: "Scarf Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Scarf",
    "Stole",
    "Shawl",
    "Wrap",
    "Hijab",
    "Infinity Scarf",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Cotton",
    "Silk",
    "Wool",
    "Cashmere",
    "Viscose",
    "Rayon",
    "Chiffon",
    "Georgette",
    "Polyester",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Dimensions",
  options: [
    "Short",
    "Medium",
    "Long",
    "Extra Long",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Checked",
    "Striped",
    "Paisley",
    "Embroidered",
  ],
},

{
  id: "season",
  label: "Season",
  type: "select",
  group: "Usage",
  options: [
    "Summer",
    "Winter",
    "All Season",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Travel",
    "Festival",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Hand Wash",
    "Machine Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
WOMEN_BELTS: [

{
  id: "beltType",
  label: "Belt Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Casual Belt",
    "Formal Belt",
    "Waist Belt",
    "Corset Belt",
    "Chain Belt",
    "Elastic Belt",
    "Braided Belt",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material",
  options: [
    "Genuine Leather",
    "Faux Leather",
    "PU Leather",
    "Canvas",
    "Elastic",
    "Metal",
    "Fabric",
  ],
},

{
  id: "beltWidth",
  label: "Belt Width",
  type: "select",
  group: "Dimensions",
  options: [
    "Thin",
    "Medium",
    "Wide",
  ],
},

{
  id: "buckleType",
  label: "Buckle Type",
  type: "select",
  group: "Design",
  options: [
    "Pin Buckle",
    "Auto Lock",
    "Hook",
    "Ring Buckle",
    "No Buckle",
  ],
},

{
  id: "adjustable",
  label: "Adjustable",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "stretchable",
  label: "Stretchable",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Textured",
    "Braided",
    "Printed",
    "Embroidered",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Office",
    "Party",
    "Wedding",
    "Fashion",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
BOYS_TSHIRTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "100% Cotton",
    "Cotton Blend",
    "Organic Cotton",
    "Polyester",
    "Rayon",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
    "Oversized",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "Crew Neck",
    "Polo",
    "Henley",
    "V Neck",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Half Sleeve",
    "Full Sleeve",
    "Sleeveless",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Graphic",
    "Cartoon",
    "Striped",
    "Checked",
    "Typography",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "School",
    "Sports",
    "Party",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
BOYS_SHIRTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Denim",
    "Rayon",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
  ],
},

{
  id: "collarType",
  label: "Collar Type",
  type: "select",
  group: "Design",
  options: [
    "Spread Collar",
    "Mandarin Collar",
    "Button Down",
    "Cuban Collar",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Half Sleeve",
    "Full Sleeve",
    "Roll-Up Sleeve",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Checked",
    "Striped",
    "Printed",
    "Floral",
    "Cartoon",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "Single Pocket",
    "Double Pocket",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "School",
    "Party",
    "Festival",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
BOYS_JEANS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "100% Denim",
    "Cotton Denim",
    "Stretch Denim",
    "Organic Denim",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Skinny Fit",
    "Relaxed Fit",
    "Straight Fit",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Regular",
    "Full Length",
  ],
},

{
  id: "wash",
  label: "Wash",
  type: "select",
  group: "Appearance",
  options: [
    "Light Wash",
    "Medium Wash",
    "Dark Wash",
    "Stone Wash",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Button & Zip",
    "Elastic Waist",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "2 Pocket",
    "4 Pocket",
    "5 Pocket",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Faded",
    "Printed",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "School",
    "Travel",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
BOYS_SHORTS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Denim",
    "Polyester",
    "Linen",
    "Fleece",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
    "Loose Fit",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Above Knee",
    "Knee Length",
    "Mid Thigh",
  ],
},

{
  id: "waistband",
  label: "Waistband",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Drawstring",
    "Button",
    "Elastic + Drawstring",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "No Pocket",
    "2 Pocket",
    "4 Pocket",
    "Cargo Pocket",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Checked",
    "Striped",
    "Camouflage",
    "Graphic",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "School",
    "Sports",
    "Travel",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
BOYS_ETHNIC: [

{
  id: "ethnicType",
  label: "Ethnic Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Kurta",
    "Kurta Pyjama",
    "Sherwani",
    "Nehru Jacket",
    "Dhoti Set",
    "Pathani Suit",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Linen",
    "Silk",
    "Art Silk",
    "Rayon",
    "Viscose",
    "Jacquard",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Mandarin Collar",
    "Band Collar",
    "Round Neck",
    "Chinese Collar",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Half Sleeve",
    "Full Sleeve",
    "Sleeveless",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Embroidered",
    "Self Design",
    "Checked",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Festival",
    "Wedding",
    "Party",
    "Traditional",
    "Casual",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
BOYS_SHOES: [

{
  id: "shoeType",
  label: "Shoe Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Casual Shoes",
    "School Shoes",
    "Sports Shoes",
    "Running Shoes",
    "Sneakers",
    "Sandals",
    "Boots",
    "Flip Flops",
  ],
},

{
  id: "upperMaterial",
  label: "Upper Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Synthetic Leather",
    "Canvas",
    "Mesh",
    "Fabric",
    "PU",
  ],
},

{
  id: "soleMaterial",
  label: "Sole Material",
  type: "select",
  group: "Material",
  options: [
    "Rubber",
    "PVC",
    "TPR",
    "EVA",
    "PU",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Lace-Up",
    "Slip-On",
    "Velcro",
    "Zip",
  ],
},

{
  id: "toeShape",
  label: "Toe Shape",
  type: "select",
  group: "Design",
  options: [
    "Round Toe",
    "Square Toe",
    "Open Toe",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "antiSkid",
  label: "Anti Skid",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "School",
    "Casual",
    "Sports",
    "Party",
    "Outdoor",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
GIRLS_DRESSES: [

{
  id: "dressType",
  label: "Dress Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Frock",
    "Party Dress",
    "Maxi Dress",
    "Midi Dress",
    "A-Line",
    "Fit & Flare",
    "Princess Dress",
    "Gown",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Rayon",
    "Viscose",
    "Georgette",
    "Chiffon",
    "Silk",
    "Satin",
    "Net",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
    "A-Line",
    "Fit & Flare",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Square Neck",
    "Boat Neck",
    "Collared",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Cap Sleeve",
    "Half Sleeve",
    "Full Sleeve",
    "Puff Sleeve",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Cartoon",
    "Embroidered",
    "Polka Dot",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Party",
    "Birthday",
    "Wedding",
    "Festival",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
GIRLS_TOPS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "Cotton",
    "Cotton Blend",
    "Rayon",
    "Viscose",
    "Linen",
    "Georgette",
    "Chiffon",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
    "Oversized",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Boat Neck",
    "Square Neck",
    "Collared",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Cap Sleeve",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
    "Puff Sleeve",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Cartoon",
    "Graphic",
    "Striped",
    "Polka Dot",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "School",
    "Party",
    "Birthday",
    "Festival",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
GIRLS_JEANS: [

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  required: true,
  options: [
    "100% Denim",
    "Cotton Denim",
    "Stretch Denim",
    "Organic Denim",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Skinny Fit",
    "Straight Fit",
    "Relaxed Fit",
    "Wide Leg",
  ],
},

{
  id: "waistRise",
  label: "Waist Rise",
  type: "select",
  group: "Size & Fit",
  options: [
    "Mid Rise",
    "High Rise",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Ankle Length",
    "Regular",
    "Full Length",
  ],
},

{
  id: "wash",
  label: "Wash",
  type: "select",
  group: "Appearance",
  options: [
    "Light Wash",
    "Medium Wash",
    "Dark Wash",
    "Stone Wash",
  ],
},

{
  id: "stretch",
  label: "Stretch",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Non Stretch",
    "Medium Stretch",
    "High Stretch",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Button",
    "Zip",
    "Button & Zip",
    "Elastic Waist",
  ],
},

{
  id: "pocket",
  label: "Pocket",
  type: "select",
  group: "Design",
  options: [
    "2 Pocket",
    "4 Pocket",
    "5 Pocket",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Faded",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "School",
    "Travel",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
GIRLS_SKIRTS: [

{
  id: "skirtType",
  label: "Skirt Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Mini",
    "A-Line",
    "Pleated",
    "Flared",
    "Layered",
    "Denim",
    "Tutu",
    "Maxi",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Cotton Blend",
    "Denim",
    "Rayon",
    "Viscose",
    "Polyester",
    "Net",
    "Tulle",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
    "Flared",
  ],
},

{
  id: "waistband",
  label: "Waistband",
  type: "select",
  group: "Design",
  options: [
    "Elastic",
    "Button",
    "Drawstring",
    "Elastic + Drawstring",
  ],
},

{
  id: "length",
  label: "Length",
  type: "select",
  group: "Size & Fit",
  options: [
    "Mini",
    "Above Knee",
    "Knee Length",
    "Midi",
    "Maxi",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Floral",
    "Checked",
    "Striped",
    "Polka Dot",
    "Embroidered",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Casual",
    "Party",
    "Birthday",
    "Festival",
    "School",
    "Daily Wear",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
GIRLS_ETHNIC: [

{
  id: "ethnicType",
  label: "Ethnic Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Lehenga Choli",
    "Kurti",
    "Kurta Set",
    "Sharara Set",
    "Anarkali",
    "Gown",
    "Dhoti Set",
    "Salwar Suit",
  ],
},

{
  id: "material",
  label: "Material",
  type: "select",
  group: "Material & Fabric",
  options: [
    "Cotton",
    "Rayon",
    "Viscose",
    "Silk",
    "Art Silk",
    "Georgette",
    "Chiffon",
    "Net",
    "Polyester",
  ],
},

{
  id: "fitType",
  label: "Fit",
  type: "select",
  group: "Size & Fit",
  options: [
    "Regular Fit",
    "Slim Fit",
    "Relaxed Fit",
  ],
},

{
  id: "neckType",
  label: "Neck Type",
  type: "select",
  group: "Design",
  options: [
    "Round Neck",
    "V Neck",
    "Square Neck",
    "Mandarin Collar",
    "Boat Neck",
  ],
},

{
  id: "sleeveType",
  label: "Sleeve Type",
  type: "select",
  group: "Design",
  options: [
    "Sleeveless",
    "Half Sleeve",
    "Three Quarter Sleeve",
    "Full Sleeve",
    "Puff Sleeve",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "pattern",
  label: "Pattern",
  type: "select",
  group: "Appearance",
  options: [
    "Solid",
    "Printed",
    "Embroidered",
    "Sequined",
    "Floral",
    "Self Design",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Festival",
    "Wedding",
    "Birthday",
    "Party",
    "Traditional",
  ],
},

{
  id: "washCare",
  label: "Wash Care",
  type: "select",
  group: "Care",
  options: [
    "Machine Wash",
    "Hand Wash",
    "Dry Clean",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "weight",
  label: "Weight (g)",
  type: "number",
  group: "Dimensions",
},

],
GIRLS_SHOES: [

{
  id: "shoeType",
  label: "Shoe Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Casual Shoes",
    "School Shoes",
    "Sports Shoes",
    "Sneakers",
    "Sandals",
    "Flats",
    "Boots",
    "Flip Flops",
    "Ethnic Footwear",
  ],
},

{
  id: "upperMaterial",
  label: "Upper Material",
  type: "select",
  group: "Material",
  options: [
    "Leather",
    "Synthetic Leather",
    "Canvas",
    "Mesh",
    "Fabric",
    "PU",
  ],
},

{
  id: "soleMaterial",
  label: "Sole Material",
  type: "select",
  group: "Material",
  options: [
    "Rubber",
    "PVC",
    "TPR",
    "EVA",
    "PU",
  ],
},

{
  id: "closure",
  label: "Closure",
  type: "select",
  group: "Design",
  options: [
    "Lace-Up",
    "Slip-On",
    "Velcro",
    "Zip",
    "Buckle",
  ],
},

{
  id: "toeShape",
  label: "Toe Shape",
  type: "select",
  group: "Design",
  options: [
    "Round Toe",
    "Square Toe",
    "Open Toe",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Size",
  options: [
    "0-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-3 Years",
    "3-4 Years",
    "4-5 Years",
    "5-6 Years",
    "6-7 Years",
    "7-8 Years",
    "8-9 Years",
    "9-10 Years",
    "10-11 Years",
    "11-12 Years",
    "12-13 Years",
    "13-14 Years",
    "14-15 Years",
    "15-16 Years",
  ],
},

{
  id: "waterResistant",
  label: "Water Resistant",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "antiSkid",
  label: "Anti Skid",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "School",
    "Casual",
    "Sports",
    "Party",
    "Festival",
    "Outdoor",
  ],
},

{
  id: "color",
  label: "Color",
  type: "color",
  group: "Appearance",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

],
BEAUTY_SKINCARE: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Face Wash",
    "Cleanser",
    "Moisturizer",
    "Serum",
    "Face Cream",
    "Face Gel",
    "Face Mask",
    "Sunscreen",
    "Night Cream",
    "Toner",
    "Scrub",
  ],
},

{
  id: "skinType",
  label: "Skin Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Oily",
    "Combination",
    "Sensitive",
    "All Skin Types",
  ],
},

{
  id: "concern",
  label: "Skin Concern",
  type: "multiselect",
  group: "Benefits",
  options: [
    "Acne",
    "Dark Spots",
    "Pigmentation",
    "Dryness",
    "Oil Control",
    "Anti Aging",
    "Hydration",
    "Brightening",
    "Sun Protection",
  ],
},

{
  id: "keyIngredients",
  label: "Key Ingredients",
  type: "multiselect",
  group: "Ingredients",
  options: [
    "Vitamin C",
    "Niacinamide",
    "Hyaluronic Acid",
    "Retinol",
    "Aloe Vera",
    "Tea Tree",
    "Salicylic Acid",
    "Charcoal",
    "Ceramide",
    "Green Tea",
  ],
},

{
  id: "spf",
  label: "SPF",
  type: "number",
  group: "Protection",
},

{
  id: "form",
  label: "Form",
  type: "select",
  group: "General",
  options: [
    "Cream",
    "Gel",
    "Foam",
    "Liquid",
    "Lotion",
    "Powder",
    "Stick",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "100 ml / 50 g",
},

{
  id: "fragrance",
  label: "Fragrance",
  type: "select",
  group: "Features",
  options: [
    "Fragrance Free",
    "Mild",
    "Floral",
    "Citrus",
    "Herbal",
  ],
},

{
  id: "organic",
  label: "Organic",
  type: "checkbox",
  group: "Features",
},

{
  id: "crueltyFree",
  label: "Cruelty Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_HAIRCARE: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Shampoo",
    "Conditioner",
    "Hair Oil",
    "Hair Serum",
    "Hair Mask",
    "Hair Cream",
    "Hair Gel",
    "Hair Wax",
    "Hair Spray",
    "Hair Color",
    "Hair Pack",
  ],
},

{
  id: "hairType",
  label: "Hair Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Oily",
    "Curly",
    "Straight",
    "Wavy",
    "Damaged",
    "All Hair Types",
  ],
},

{
  id: "hairConcern",
  label: "Hair Concern",
  type: "multiselect",
  group: "Benefits",
  options: [
    "Hair Fall",
    "Dandruff",
    "Dry Hair",
    "Frizzy Hair",
    "Split Ends",
    "Hair Growth",
    "Color Protection",
    "Scalp Care",
  ],
},

{
  id: "keyIngredients",
  label: "Key Ingredients",
  type: "multiselect",
  group: "Ingredients",
  options: [
    "Amla",
    "Bhringraj",
    "Onion",
    "Argan Oil",
    "Coconut Oil",
    "Aloe Vera",
    "Keratin",
    "Biotin",
    "Tea Tree",
    "Hibiscus",
  ],
},

{
  id: "form",
  label: "Form",
  type: "select",
  group: "General",
  options: [
    "Liquid",
    "Cream",
    "Oil",
    "Gel",
    "Powder",
    "Spray",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "100 ml / 200 ml",
},

{
  id: "sulfateFree",
  label: "Sulfate Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "parabenFree",
  label: "Paraben Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "siliconeFree",
  label: "Silicone Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "organic",
  label: "Organic",
  type: "checkbox",
  group: "Features",
},

{
  id: "fragrance",
  label: "Fragrance",
  type: "select",
  group: "Features",
  options: [
    "Floral",
    "Herbal",
    "Citrus",
    "Mild",
    "Fragrance Free",
  ],
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_MAKEUP: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Foundation",
    "Primer",
    "Concealer",
    "Compact",
    "Face Powder",
    "Blush",
    "Highlighter",
    "Contour",
    "Lipstick",
    "Lip Gloss",
    "Lip Balm",
    "Lip Liner",
    "Mascara",
    "Eyeliner",
    "Kajal",
    "Eyeshadow",
    "Eyebrow Pencil",
    "Nail Polish",
    "Makeup Remover",
  ],
},

{
  id: "skinType",
  label: "Skin Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Oily",
    "Combination",
    "Sensitive",
    "All Skin Types",
  ],
},

{
  id: "shade",
  label: "Shade",
  type: "text",
  group: "Appearance",
},

{
  id: "finish",
  label: "Finish",
  type: "select",
  group: "Appearance",
  options: [
    "Matte",
    "Glossy",
    "Dewy",
    "Natural",
    "Satin",
    "Shimmer",
    "Metallic",
  ],
},

{
  id: "coverage",
  label: "Coverage",
  type: "select",
  group: "Features",
  options: [
    "Light",
    "Medium",
    "Full",
    "Buildable",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "30 ml / 10 g",
},

{
  id: "waterproof",
  label: "Waterproof",
  type: "checkbox",
  group: "Features",
},

{
  id: "longLasting",
  label: "Long Lasting",
  type: "checkbox",
  group: "Features",
},

{
  id: "spf",
  label: "SPF",
  type: "number",
  group: "Protection",
},

{
  id: "crueltyFree",
  label: "Cruelty Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "parabenFree",
  label: "Paraben Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_FRAGRANCES: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Perfume",
    "Eau De Parfum (EDP)",
    "Eau De Toilette (EDT)",
    "Body Mist",
    "Deodorant",
    "Roll On",
    "Attar",
    "Gift Set",
  ],
},

{
  id: "gender",
  label: "Gender",
  type: "select",
  group: "Usage",
  options: [
    "Men",
    "Women",
    "Unisex",
    "Kids",
  ],
},

{
  id: "fragranceFamily",
  label: "Fragrance Family",
  type: "select",
  group: "Fragrance",
  options: [
    "Floral",
    "Woody",
    "Fresh",
    "Citrus",
    "Oriental",
    "Fruity",
    "Aquatic",
    "Spicy",
    "Musky",
    "Vanilla",
  ],
},

{
  id: "topNotes",
  label: "Top Notes",
  type: "text",
  group: "Fragrance",
},

{
  id: "middleNotes",
  label: "Middle Notes",
  type: "text",
  group: "Fragrance",
},

{
  id: "baseNotes",
  label: "Base Notes",
  type: "text",
  group: "Fragrance",
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "30 ml / 50 ml / 100 ml",
},

{
  id: "lasting",
  label: "Lasting",
  type: "select",
  group: "Performance",
  options: [
    "2-4 Hours",
    "4-6 Hours",
    "6-8 Hours",
    "8-12 Hours",
    "12+ Hours",
  ],
},

{
  id: "alcoholFree",
  label: "Alcohol Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "travelFriendly",
  label: "Travel Friendly",
  type: "checkbox",
  group: "Features",
},

{
  id: "occasion",
  label: "Occasion",
  type: "select",
  group: "Usage",
  options: [
    "Daily",
    "Office",
    "Party",
    "Wedding",
    "Travel",
    "Sports",
  ],
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_MENS_GROOMING: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Beard Oil",
    "Beard Balm",
    "Beard Wash",
    "Beard Wax",
    "Shaving Cream",
    "Shaving Foam",
    "After Shave",
    "Face Wash",
    "Moisturizer",
    "Hair Styling Gel",
    "Hair Wax",
    "Hair Cream",
    "Trimmer Oil",
  ],
},

{
  id: "groomingArea",
  label: "Grooming Area",
  type: "select",
  group: "Usage",
  options: [
    "Beard",
    "Mustache",
    "Hair",
    "Face",
    "Body",
    "Multi Purpose",
  ],
},

{
  id: "skinType",
  label: "Skin Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Oily",
    "Sensitive",
    "All Skin Types",
  ],
},

{
  id: "hairType",
  label: "Hair Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Oily",
    "Curly",
    "Straight",
    "All Hair Types",
  ],
},

{
  id: "keyIngredients",
  label: "Key Ingredients",
  type: "multiselect",
  group: "Ingredients",
  options: [
    "Aloe Vera",
    "Tea Tree",
    "Argan Oil",
    "Vitamin E",
    "Charcoal",
    "Menthol",
    "Biotin",
    "Keratin",
    "Coconut Oil",
    "Jojoba Oil",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "50 ml / 100 ml",
},

{
  id: "fragrance",
  label: "Fragrance",
  type: "select",
  group: "Features",
  options: [
    "Fresh",
    "Woody",
    "Citrus",
    "Herbal",
    "Mild",
    "Fragrance Free",
  ],
},

{
  id: "parabenFree",
  label: "Paraben Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "sulfateFree",
  label: "Sulfate Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "crueltyFree",
  label: "Cruelty Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "organic",
  label: "Organic",
  type: "checkbox",
  group: "Features",
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_BATH_BODY: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Body Wash",
    "Soap",
    "Body Lotion",
    "Body Butter",
    "Body Cream",
    "Body Scrub",
    "Bath Salt",
    "Bath Oil",
    "Hand Wash",
    "Hand Cream",
    "Foot Cream",
  ],
},

{
  id: "skinType",
  label: "Skin Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Oily",
    "Sensitive",
    "All Skin Types",
  ],
},

{
  id: "bodyConcern",
  label: "Body Concern",
  type: "multiselect",
  group: "Benefits",
  options: [
    "Dry Skin",
    "Rough Skin",
    "Tan Removal",
    "Hydration",
    "Exfoliation",
    "Skin Brightening",
    "Odor Control",
  ],
},

{
  id: "keyIngredients",
  label: "Key Ingredients",
  type: "multiselect",
  group: "Ingredients",
  options: [
    "Aloe Vera",
    "Shea Butter",
    "Cocoa Butter",
    "Vitamin E",
    "Charcoal",
    "Tea Tree",
    "Coffee",
    "Coconut Oil",
    "Oatmeal",
    "Honey",
  ],
},

{
  id: "form",
  label: "Form",
  type: "select",
  group: "General",
  options: [
    "Liquid",
    "Bar",
    "Cream",
    "Gel",
    "Lotion",
    "Oil",
    "Scrub",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "250 ml / 100 g",
},

{
  id: "fragrance",
  label: "Fragrance",
  type: "select",
  group: "Features",
  options: [
    "Floral",
    "Citrus",
    "Herbal",
    "Lavender",
    "Rose",
    "Sandalwood",
    "Fragrance Free",
  ],
},

{
  id: "parabenFree",
  label: "Paraben Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "sulfateFree",
  label: "Sulfate Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "crueltyFree",
  label: "Cruelty Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "organic",
  label: "Organic",
  type: "checkbox",
  group: "Features",
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_BABY_CARE: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Baby Lotion",
    "Baby Cream",
    "Baby Oil",
    "Baby Powder",
    "Baby Shampoo",
    "Baby Body Wash",
    "Baby Soap",
    "Diaper Rash Cream",
    "Baby Wipes",
    "Massage Oil",
    "Baby Sunscreen",
  ],
},

{
  id: "ageGroup",
  label: "Age Group",
  type: "select",
  group: "Usage",
  options: [
    "0-3 Months",
    "3-6 Months",
    "6-12 Months",
    "1-2 Years",
    "2-5 Years",
    "All Ages",
  ],
},

{
  id: "skinType",
  label: "Skin Type",
  type: "select",
  group: "Usage",
  options: [
    "Normal",
    "Dry",
    "Sensitive",
    "All Skin Types",
  ],
},

{
  id: "keyIngredients",
  label: "Key Ingredients",
  type: "multiselect",
  group: "Ingredients",
  options: [
    "Aloe Vera",
    "Calendula",
    "Chamomile",
    "Coconut Oil",
    "Shea Butter",
    "Vitamin E",
    "Olive Oil",
    "Jojoba Oil",
    "Oat Extract",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "100 ml / 200 ml / 100 g",
},

{
  id: "hypoallergenic",
  label: "Hypoallergenic",
  type: "checkbox",
  group: "Features",
},

{
  id: "tearFree",
  label: "Tear Free Formula",
  type: "checkbox",
  group: "Features",
},

{
  id: "parabenFree",
  label: "Paraben Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "sulfateFree",
  label: "Sulfate Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "dermatologicallyTested",
  label: "Dermatologically Tested",
  type: "checkbox",
  group: "Features",
},

{
  id: "pediatricianRecommended",
  label: "Pediatrician Recommended",
  type: "checkbox",
  group: "Features",
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
BEAUTY_ORAL_CARE: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Toothpaste",
    "Toothbrush",
    "Electric Toothbrush",
    "Mouthwash",
    "Dental Floss",
    "Tongue Cleaner",
    "Whitening Kit",
    "Tooth Powder",
    "Interdental Brush",
    "Kids Toothpaste",
    "Kids Toothbrush",
  ],
},

{
  id: "oralConcern",
  label: "Oral Concern",
  type: "multiselect",
  group: "Benefits",
  options: [
    "Cavity Protection",
    "Whitening",
    "Sensitivity",
    "Gum Care",
    "Fresh Breath",
    "Plaque Removal",
    "Tartar Control",
    "Enamel Protection",
  ],
},

{
  id: "flavor",
  label: "Flavor",
  type: "select",
  group: "Features",
  options: [
    "Mint",
    "Peppermint",
    "Spearmint",
    "Herbal",
    "Clove",
    "Lemon",
    "Strawberry",
    "Bubblegum",
    "Unflavored",
  ],
},

{
  id: "quantity",
  label: "Quantity",
  type: "text",
  group: "Packaging",
  placeholder: "100 g / 250 ml",
},

{
  id: "fluoride",
  label: "Contains Fluoride",
  type: "checkbox",
  group: "Ingredients",
},

{
  id: "alcoholFree",
  label: "Alcohol Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "sugarFree",
  label: "Sugar Free",
  type: "checkbox",
  group: "Features",
},

{
  id: "vegan",
  label: "Vegan",
  type: "checkbox",
  group: "Features",
},

{
  id: "organic",
  label: "Organic",
  type: "checkbox",
  group: "Features",
},

{
  id: "recommendedAge",
  label: "Recommended Age",
  type: "select",
  group: "Usage",
  options: [
    "Kids",
    "Adults",
    "Seniors",
    "All Ages",
  ],
},

{
  id: "expiry",
  label: "Expiry Date",
  type: "date",
  group: "Safety",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
MOBILE_PHONES: [

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Apple",
    "Samsung",
    "OnePlus",
    "Xiaomi",
    "Realme",
    "Vivo",
    "Oppo",
    "Motorola",
    "Google",
    "Nothing",
    "Honor",
    "Nokia",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
  required: true,
},

{
  id: "modelNumber",
  label: "Model Number",
  type: "text",
  group: "General",
},

{
  id: "launchYear",
  label: "Launch Year",
  type: "number",
  group: "General",
},

{
  id: "network",
  label: "Network",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "2G",
    "3G",
    "4G",
    "5G",
  ],
},

{
  id: "simType",
  label: "SIM Type",
  type: "select",
  group: "Connectivity",
  options: [
    "Single SIM",
    "Dual SIM",
    "eSIM",
    "Dual SIM + eSIM",
  ],
},

{
  id: "displaySize",
  label: "Display Size",
  type: "text",
  group: "Display",
},

{
  id: "displayType",
  label: "Display Type",
  type: "select",
  group: "Display",
  options: [
    "LCD",
    "IPS LCD",
    "OLED",
    "AMOLED",
    "Super AMOLED",
    "Dynamic AMOLED",
  ],
},

{
  id: "refreshRate",
  label: "Refresh Rate",
  type: "select",
  group: "Display",
  options: [
    "60 Hz",
    "90 Hz",
    "120 Hz",
    "144 Hz",
  ],
},

{
  id: "resolution",
  label: "Resolution",
  type: "text",
  group: "Display",
},

{
  id: "processor",
  label: "Processor",
  type: "text",
  group: "Performance",
},

{
  id: "ram",
  label: "RAM",
  type: "select",
  group: "Performance",
  options: [
    "4 GB",
    "6 GB",
    "8 GB",
    "12 GB",
    "16 GB",
    "24 GB",
  ],
},

{
  id: "storage",
  label: "Storage",
  type: "select",
  group: "Performance",
  options: [
    "64 GB",
    "128 GB",
    "256 GB",
    "512 GB",
    "1 TB",
  ],
},

{
  id: "expandableStorage",
  label: "Expandable Storage",
  type: "select",
  group: "Performance",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "rearCamera",
  label: "Rear Camera",
  type: "text",
  group: "Camera",
},

{
  id: "frontCamera",
  label: "Front Camera",
  type: "text",
  group: "Camera",
},

{
  id: "batteryCapacity",
  label: "Battery Capacity",
  type: "text",
  group: "Battery",
},

{
  id: "fastCharging",
  label: "Fast Charging",
  type: "text",
  group: "Battery",
},

{
  id: "wirelessCharging",
  label: "Wireless Charging",
  type: "select",
  group: "Battery",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "operatingSystem",
  label: "Operating System",
  type: "select",
  group: "Software",
  options: [
    "Android",
    "iOS",
  ],
},

{
  id: "fingerprint",
  label: "Fingerprint Sensor",
  type: "select",
  group: "Security",
  options: [
    "Side Mounted",
    "Rear Mounted",
    "In Display",
    "No",
  ],
},

{
  id: "faceUnlock",
  label: "Face Unlock",
  type: "select",
  group: "Security",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "waterResistance",
  label: "Water Resistance",
  type: "select",
  group: "Durability",
  options: [
    "IP52",
    "IP53",
    "IP54",
    "IP67",
    "IP68",
    "No",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
TABLETS: [

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Apple",
    "Samsung",
    "Lenovo",
    "Xiaomi",
    "OnePlus",
    "Realme",
    "Honor",
    "Huawei",
    "Nokia",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
  required: true,
},

{
  id: "modelNumber",
  label: "Model Number",
  type: "text",
  group: "General",
},

{
  id: "displaySize",
  label: "Display Size",
  type: "text",
  group: "Display",
},

{
  id: "displayType",
  label: "Display Type",
  type: "select",
  group: "Display",
  options: [
    "LCD",
    "IPS LCD",
    "OLED",
    "AMOLED",
    "Retina",
  ],
},

{
  id: "resolution",
  label: "Resolution",
  type: "text",
  group: "Display",
},

{
  id: "refreshRate",
  label: "Refresh Rate",
  type: "select",
  group: "Display",
  options: [
    "60 Hz",
    "90 Hz",
    "120 Hz",
    "144 Hz",
  ],
},

{
  id: "processor",
  label: "Processor",
  type: "text",
  group: "Performance",
},

{
  id: "ram",
  label: "RAM",
  type: "select",
  group: "Performance",
  options: [
    "4 GB",
    "6 GB",
    "8 GB",
    "12 GB",
    "16 GB",
  ],
},

{
  id: "storage",
  label: "Storage",
  type: "select",
  group: "Performance",
  options: [
    "64 GB",
    "128 GB",
    "256 GB",
    "512 GB",
    "1 TB",
  ],
},

{
  id: "expandableStorage",
  label: "Expandable Storage",
  type: "select",
  group: "Performance",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "rearCamera",
  label: "Rear Camera",
  type: "text",
  group: "Camera",
},

{
  id: "frontCamera",
  label: "Front Camera",
  type: "text",
  group: "Camera",
},

{
  id: "batteryCapacity",
  label: "Battery Capacity",
  type: "text",
  group: "Battery",
},

{
  id: "fastCharging",
  label: "Fast Charging",
  type: "text",
  group: "Battery",
},

{
  id: "operatingSystem",
  label: "Operating System",
  type: "select",
  group: "Software",
  options: [
    "Android",
    "iPadOS",
    "Windows",
  ],
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "Wi-Fi",
    "Bluetooth",
    "4G",
    "5G",
    "GPS",
    "USB Type-C",
  ],
},

{
  id: "stylusSupport",
  label: "Stylus Support",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "keyboardSupport",
  label: "Keyboard Support",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
LAPTOPS: [

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Apple",
    "Dell",
    "HP",
    "Lenovo",
    "Asus",
    "Acer",
    "MSI",
    "Samsung",
    "LG",
    "Microsoft",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
  required: true,
},

{
  id: "modelNumber",
  label: "Model Number",
  type: "text",
  group: "General",
},

{
  id: "processorBrand",
  label: "Processor Brand",
  type: "select",
  group: "Performance",
  options: [
    "Intel",
    "AMD",
    "Apple",
    "Qualcomm",
  ],
},

{
  id: "processor",
  label: "Processor",
  type: "text",
  group: "Performance",
},

{
  id: "graphics",
  label: "Graphics Card",
  type: "text",
  group: "Performance",
},

{
  id: "ram",
  label: "RAM",
  type: "select",
  group: "Performance",
  options: [
    "8 GB",
    "16 GB",
    "24 GB",
    "32 GB",
    "64 GB",
  ],
},

{
  id: "storage",
  label: "Storage",
  type: "select",
  group: "Performance",
  options: [
    "256 GB SSD",
    "512 GB SSD",
    "1 TB SSD",
    "2 TB SSD",
  ],
},

{
  id: "expandableMemory",
  label: "Upgradeable RAM",
  type: "select",
  group: "Performance",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "displaySize",
  label: "Display Size",
  type: "text",
  group: "Display",
},

{
  id: "displayResolution",
  label: "Resolution",
  type: "select",
  group: "Display",
  options: [
    "HD",
    "Full HD",
    "2K",
    "QHD",
    "4K",
  ],
},

{
  id: "displayType",
  label: "Display Type",
  type: "select",
  group: "Display",
  options: [
    "IPS",
    "OLED",
    "Mini LED",
    "Retina",
    "AMOLED",
  ],
},

{
  id: "refreshRate",
  label: "Refresh Rate",
  type: "select",
  group: "Display",
  options: [
    "60 Hz",
    "90 Hz",
    "120 Hz",
    "144 Hz",
    "165 Hz",
    "240 Hz",
  ],
},

{
  id: "operatingSystem",
  label: "Operating System",
  type: "select",
  group: "Software",
  options: [
    "Windows 11",
    "Windows 10",
    "macOS",
    "Linux",
    "DOS",
  ],
},

{
  id: "batteryBackup",
  label: "Battery Backup",
  type: "text",
  group: "Battery",
},

{
  id: "webcam",
  label: "Webcam",
  type: "text",
  group: "Camera",
},

{
  id: "keyboardType",
  label: "Keyboard",
  type: "select",
  group: "Input",
  options: [
    "Standard",
    "Backlit",
    "RGB Backlit",
  ],
},

{
  id: "fingerprintSensor",
  label: "Fingerprint Sensor",
  type: "select",
  group: "Security",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "ports",
  label: "Ports",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "USB-A",
    "USB-C",
    "Thunderbolt",
    "HDMI",
    "Ethernet",
    "3.5 mm Audio Jack",
    "SD Card Reader",
  ],
},

{
  id: "wirelessConnectivity",
  label: "Wireless",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "Wi-Fi 5",
    "Wi-Fi 6",
    "Wi-Fi 6E",
    "Wi-Fi 7",
    "Bluetooth 5.0",
    "Bluetooth 5.3",
  ],
},

{
  id: "weight",
  label: "Weight",
  type: "text",
  group: "Dimensions",
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
DESKTOPS: [

{
  id: "desktopType",
  label: "Desktop Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Tower PC",
    "Mini PC",
    "All-in-One",
    "Gaming Desktop",
    "Workstation",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Dell",
    "HP",
    "Lenovo",
    "Asus",
    "Acer",
    "MSI",
    "Apple",
    "Intel",
    "Custom Build",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
},

{
  id: "processorBrand",
  label: "Processor Brand",
  type: "select",
  group: "Performance",
  options: [
    "Intel",
    "AMD",
    "Apple",
  ],
},

{
  id: "processor",
  label: "Processor",
  type: "text",
  group: "Performance",
},

{
  id: "graphicsCard",
  label: "Graphics Card",
  type: "text",
  group: "Performance",
},

{
  id: "ram",
  label: "RAM",
  type: "select",
  group: "Performance",
  options: [
    "8 GB",
    "16 GB",
    "32 GB",
    "64 GB",
    "128 GB",
  ],
},

{
  id: "storage",
  label: "Storage",
  type: "select",
  group: "Performance",
  options: [
    "256 GB SSD",
    "512 GB SSD",
    "1 TB SSD",
    "2 TB SSD",
    "1 TB HDD",
    "2 TB HDD",
    "SSD + HDD",
  ],
},

{
  id: "operatingSystem",
  label: "Operating System",
  type: "select",
  group: "Software",
  options: [
    "Windows 11",
    "Windows 10",
    "Linux",
    "macOS",
    "DOS",
  ],
},

{
  id: "motherboard",
  label: "Motherboard",
  type: "text",
  group: "Hardware",
},

{
  id: "powerSupply",
  label: "Power Supply",
  type: "text",
  group: "Hardware",
},

{
  id: "cabinetType",
  label: "Cabinet Type",
  type: "select",
  group: "Hardware",
  options: [
    "Mini Tower",
    "Mid Tower",
    "Full Tower",
    "Small Form Factor",
  ],
},

{
  id: "ports",
  label: "Ports",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "USB-A",
    "USB-C",
    "HDMI",
    "DisplayPort",
    "Ethernet",
    "Audio Jack",
    "SD Card Reader",
  ],
},

{
  id: "wirelessConnectivity",
  label: "Wireless Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "Wi-Fi",
    "Bluetooth",
  ],
},

{
  id: "monitorIncluded",
  label: "Monitor Included",
  type: "select",
  group: "Package",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "keyboardIncluded",
  label: "Keyboard Included",
  type: "select",
  group: "Package",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "mouseIncluded",
  label: "Mouse Included",
  type: "select",
  group: "Package",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
SMARTWATCHES: [

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Apple",
    "Samsung",
    "OnePlus",
    "Amazfit",
    "boAt",
    "Noise",
    "Fire-Boltt",
    "Fastrack",
    "Realme",
    "Huawei",
    "Garmin",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
},

{
  id: "displayType",
  label: "Display Type",
  type: "select",
  group: "Display",
  options: [
    "AMOLED",
    "OLED",
    "LCD",
    "TFT",
  ],
},

{
  id: "displaySize",
  label: "Display Size",
  type: "text",
  group: "Display",
},

{
  id: "displayResolution",
  label: "Resolution",
  type: "text",
  group: "Display",
},

{
  id: "strapMaterial",
  label: "Strap Material",
  type: "select",
  group: "Design",
  options: [
    "Silicone",
    "Leather",
    "Metal",
    "Nylon",
    "Stainless Steel",
  ],
},

{
  id: "dialShape",
  label: "Dial Shape",
  type: "select",
  group: "Design",
  options: [
    "Round",
    "Square",
    "Rectangle",
  ],
},

{
  id: "batteryLife",
  label: "Battery Life",
  type: "text",
  group: "Battery",
},

{
  id: "chargingType",
  label: "Charging Type",
  type: "select",
  group: "Battery",
  options: [
    "Magnetic",
    "Wireless",
    "USB",
  ],
},

{
  id: "bluetoothVersion",
  label: "Bluetooth Version",
  type: "text",
  group: "Connectivity",
},

{
  id: "gps",
  label: "GPS",
  type: "select",
  group: "Connectivity",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "calling",
  label: "Bluetooth Calling",
  type: "select",
  group: "Connectivity",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "voiceAssistant",
  label: "Voice Assistant",
  type: "select",
  group: "Features",
  options: [
    "Google Assistant",
    "Siri",
    "Alexa",
    "None",
  ],
},

{
  id: "healthFeatures",
  label: "Health Features",
  type: "multiselect",
  group: "Health",
  options: [
    "Heart Rate",
    "SpO2",
    "ECG",
    "Sleep Tracking",
    "Stress Monitoring",
    "Step Counter",
    "Calories Burned",
    "Women's Health",
  ],
},

{
  id: "sportsModes",
  label: "Sports Modes",
  type: "text",
  group: "Fitness",
},

{
  id: "waterResistance",
  label: "Water Resistance",
  type: "select",
  group: "Durability",
  options: [
    "IP67",
    "IP68",
    "5 ATM",
    "10 ATM",
    "No",
  ],
},

{
  id: "compatibleWith",
  label: "Compatible With",
  type: "multiselect",
  group: "Compatibility",
  options: [
    "Android",
    "iPhone",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
HEADPHONES: [

{
  id: "productType",
  label: "Product Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Over Ear",
    "On Ear",
    "In Ear",
    "Neckband",
    "True Wireless (TWS)",
    "Gaming Headset",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "Sony",
    "JBL",
    "boAt",
    "Noise",
    "Realme",
    "OnePlus",
    "Samsung",
    "Apple",
    "Sennheiser",
    "Bose",
    "Skullcandy",
    "Marshall",
  ],
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "select",
  group: "Connectivity",
  options: [
    "Wired",
    "Wireless",
    "Bluetooth",
    "USB Type-C",
    "3.5 mm Jack",
  ],
},

{
  id: "bluetoothVersion",
  label: "Bluetooth Version",
  type: "text",
  group: "Connectivity",
},

{
  id: "batteryLife",
  label: "Battery Life",
  type: "text",
  group: "Battery",
},

{
  id: "fastCharging",
  label: "Fast Charging",
  type: "select",
  group: "Battery",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "noiseCancellation",
  label: "Noise Cancellation",
  type: "select",
  group: "Audio",
  options: [
    "ANC",
    "ENC",
    "Passive",
    "None",
  ],
},

{
  id: "driverSize",
  label: "Driver Size",
  type: "text",
  group: "Audio",
},

{
  id: "frequencyResponse",
  label: "Frequency Response",
  type: "text",
  group: "Audio",
},

{
  id: "microphone",
  label: "Microphone",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "waterResistance",
  label: "Water Resistance",
  type: "select",
  group: "Durability",
  options: [
    "IPX4",
    "IPX5",
    "IPX7",
    "No",
  ],
},

{
  id: "voiceAssistant",
  label: "Voice Assistant",
  type: "multiselect",
  group: "Features",
  options: [
    "Google Assistant",
    "Siri",
    "Alexa",
  ],
},

{
  id: "compatibleWith",
  label: "Compatible With",
  type: "multiselect",
  group: "Compatibility",
  options: [
    "Android",
    "iPhone",
    "Windows",
    "Mac",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
SPEAKERS: [

{
  id: "speakerType",
  label: "Speaker Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Bluetooth Speaker",
    "Portable Speaker",
    "Smart Speaker",
    "Soundbar",
    "Bookshelf Speaker",
    "Tower Speaker",
    "Home Theater Speaker",
    "Party Speaker",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "JBL",
    "Sony",
    "boAt",
    "Bose",
    "Marshall",
    "Samsung",
    "LG",
    "Mi",
    "Zebronics",
    "Philips",
    "Amazon",
    "Google",
  ],
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "Bluetooth",
    "Wi-Fi",
    "USB",
    "USB Type-C",
    "AUX",
    "HDMI ARC",
    "Optical",
    "NFC",
  ],
},

{
  id: "bluetoothVersion",
  label: "Bluetooth Version",
  type: "text",
  group: "Connectivity",
},

{
  id: "outputPower",
  label: "Output Power",
  type: "text",
  group: "Audio",
},

{
  id: "driverSize",
  label: "Driver Size",
  type: "text",
  group: "Audio",
},

{
  id: "frequencyResponse",
  label: "Frequency Response",
  type: "text",
  group: "Audio",
},

{
  id: "batteryLife",
  label: "Battery Life",
  type: "text",
  group: "Battery",
},

{
  id: "chargingType",
  label: "Charging Type",
  type: "select",
  group: "Battery",
  options: [
    "USB Type-C",
    "Micro USB",
    "DC Adapter",
  ],
},

{
  id: "waterResistance",
  label: "Water Resistance",
  type: "select",
  group: "Durability",
  options: [
    "IPX4",
    "IPX5",
    "IPX7",
    "IP67",
    "No",
  ],
},

{
  id: "voiceAssistant",
  label: "Voice Assistant",
  type: "multiselect",
  group: "Features",
  options: [
    "Google Assistant",
    "Alexa",
    "Siri",
  ],
},

{
  id: "microphone",
  label: "Built-in Microphone",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "rgbLighting",
  label: "RGB Lighting",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
CAMERAS: [

{
  id: "cameraType",
  label: "Camera Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "DSLR",
    "Mirrorless",
    "Point & Shoot",
    "Action Camera",
    "Instant Camera",
    "Camcorder",
    "Bridge Camera",
    "Cinema Camera",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "Canon",
    "Nikon",
    "Sony",
    "Fujifilm",
    "Panasonic",
    "GoPro",
    "Leica",
    "DJI",
    "Kodak",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
},

{
  id: "sensorType",
  label: "Sensor Type",
  type: "select",
  group: "Image Quality",
  options: [
    "Full Frame",
    "APS-C",
    "Micro Four Thirds",
    "1 Inch",
    "CMOS",
    "CCD",
  ],
},

{
  id: "resolution",
  label: "Resolution",
  type: "text",
  group: "Image Quality",
},

{
  id: "lensMount",
  label: "Lens Mount",
  type: "text",
  group: "Lens",
},

{
  id: "opticalZoom",
  label: "Optical Zoom",
  type: "text",
  group: "Lens",
},

{
  id: "digitalZoom",
  label: "Digital Zoom",
  type: "text",
  group: "Lens",
},

{
  id: "imageStabilization",
  label: "Image Stabilization",
  type: "select",
  group: "Features",
  options: [
    "Optical",
    "Sensor Shift",
    "Electronic",
    "None",
  ],
},

{
  id: "videoResolution",
  label: "Video Resolution",
  type: "select",
  group: "Video",
  options: [
    "Full HD",
    "4K",
    "6K",
    "8K",
  ],
},

{
  id: "screenType",
  label: "Screen Type",
  type: "select",
  group: "Display",
  options: [
    "Fixed LCD",
    "Tilting LCD",
    "Fully Articulating",
    "Touchscreen",
  ],
},

{
  id: "viewfinder",
  label: "Viewfinder",
  type: "select",
  group: "Display",
  options: [
    "Optical",
    "Electronic",
    "None",
  ],
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "Wi-Fi",
    "Bluetooth",
    "USB-C",
    "HDMI",
    "NFC",
  ],
},

{
  id: "memoryCardSupport",
  label: "Memory Card Support",
  type: "multiselect",
  group: "Storage",
  options: [
    "SD",
    "SDHC",
    "SDXC",
    "CFexpress",
    "microSD",
  ],
},

{
  id: "batteryLife",
  label: "Battery Life",
  type: "text",
  group: "Battery",
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
TELEVISIONS: [

{
  id: "tvType",
  label: "TV Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "LED",
    "QLED",
    "OLED",
    "Mini LED",
    "NanoCell",
    "Smart TV",
    "Android TV",
    "Google TV",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "Samsung",
    "LG",
    "Sony",
    "Xiaomi",
    "OnePlus",
    "TCL",
    "Hisense",
    "Panasonic",
    "Vu",
    "Acer",
    "Realme",
  ],
},

{
  id: "screenSize",
  label: "Screen Size",
  type: "select",
  group: "Display",
  options: [
    "24 Inch",
    "32 Inch",
    "40 Inch",
    "43 Inch",
    "50 Inch",
    "55 Inch",
    "65 Inch",
    "75 Inch",
    "85 Inch",
  ],
},

{
  id: "resolution",
  label: "Resolution",
  type: "select",
  group: "Display",
  options: [
    "HD Ready",
    "Full HD",
    "4K UHD",
    "8K UHD",
  ],
},

{
  id: "displayTechnology",
  label: "Display Technology",
  type: "select",
  group: "Display",
  options: [
    "LED",
    "QLED",
    "OLED",
    "Mini LED",
  ],
},

{
  id: "refreshRate",
  label: "Refresh Rate",
  type: "select",
  group: "Display",
  options: [
    "60 Hz",
    "90 Hz",
    "120 Hz",
    "144 Hz",
  ],
},

{
  id: "operatingSystem",
  label: "Operating System",
  type: "select",
  group: "Software",
  options: [
    "Android TV",
    "Google TV",
    "Tizen",
    "webOS",
    "Fire TV",
    "Roku TV",
  ],
},

{
  id: "processor",
  label: "Processor",
  type: "text",
  group: "Performance",
},

{
  id: "ram",
  label: "RAM",
  type: "text",
  group: "Performance",
},

{
  id: "storage",
  label: "Storage",
  type: "text",
  group: "Performance",
},

{
  id: "hdrSupport",
  label: "HDR Support",
  type: "multiselect",
  group: "Display",
  options: [
    "HDR10",
    "HDR10+",
    "Dolby Vision",
    "HLG",
  ],
},

{
  id: "audioOutput",
  label: "Audio Output",
  type: "text",
  group: "Audio",
},

{
  id: "speakerType",
  label: "Speaker Type",
  type: "text",
  group: "Audio",
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "Wi-Fi",
    "Bluetooth",
    "HDMI",
    "USB",
    "Ethernet",
    "Optical Audio",
  ],
},

{
  id: "voiceAssistant",
  label: "Voice Assistant",
  type: "multiselect",
  group: "Smart Features",
  options: [
    "Google Assistant",
    "Alexa",
    "Apple AirPlay",
  ],
},

{
  id: "wallMountIncluded",
  label: "Wall Mount Included",
  type: "select",
  group: "Package",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
PRINTERS: [

{
  id: "printerType",
  label: "Printer Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Inkjet",
    "Laser",
    "All-in-One",
    "Photo Printer",
    "Dot Matrix",
    "Thermal Printer",
    "Label Printer",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "HP",
    "Canon",
    "Epson",
    "Brother",
    "Xerox",
    "Pantum",
    "Ricoh",
    "Kyocera",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
},

{
  id: "printTechnology",
  label: "Print Technology",
  type: "select",
  group: "Printing",
  options: [
    "Inkjet",
    "Laser",
    "Thermal",
    "Impact",
  ],
},

{
  id: "colorPrinting",
  label: "Color Printing",
  type: "select",
  group: "Printing",
  options: [
    "Color",
    "Monochrome",
  ],
},

{
  id: "printResolution",
  label: "Print Resolution",
  type: "text",
  group: "Printing",
},

{
  id: "printSpeed",
  label: "Print Speed",
  type: "text",
  group: "Printing",
},

{
  id: "duplexPrinting",
  label: "Auto Duplex Printing",
  type: "select",
  group: "Printing",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "scanner",
  label: "Scanner",
  type: "select",
  group: "Functions",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "copier",
  label: "Copier",
  type: "select",
  group: "Functions",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "USB",
    "Wi-Fi",
    "Wi-Fi Direct",
    "Ethernet",
    "Bluetooth",
    "Mobile Printing",
  ],
},

{
  id: "paperSize",
  label: "Supported Paper Size",
  type: "multiselect",
  group: "Paper",
  options: [
    "A4",
    "A3",
    "Letter",
    "Legal",
    "Photo Paper",
  ],
},

{
  id: "inputTrayCapacity",
  label: "Input Tray Capacity",
  type: "text",
  group: "Paper",
},

{
  id: "monthlyDutyCycle",
  label: "Monthly Duty Cycle",
  type: "text",
  group: "Performance",
},

{
  id: "supportedOS",
  label: "Supported OS",
  type: "multiselect",
  group: "Compatibility",
  options: [
    "Windows",
    "macOS",
    "Linux",
    "Android",
    "iOS",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
COMPUTER_ACCESSORIES: [

{
  id: "accessoryType",
  label: "Accessory Type",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Keyboard",
    "Mouse",
    "Webcam",
    "Monitor",
    "SSD",
    "Hard Drive",
    "RAM",
    "Graphics Card",
    "Power Supply",
    "Cabinet",
    "CPU Cooler",
    "USB Hub",
    "Docking Station",
    "Memory Card",
    "Pendrive",
    "Laptop Stand",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "Logitech",
    "HP",
    "Dell",
    "Lenovo",
    "Asus",
    "Acer",
    "Samsung",
    "Kingston",
    "SanDisk",
    "WD",
    "Seagate",
    "Corsair",
    "Cooler Master",
    "MSI",
    "Zebronics",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "USB",
    "USB Type-C",
    "Bluetooth",
    "2.4 GHz Wireless",
    "Wi-Fi",
    "HDMI",
    "DisplayPort",
  ],
},

{
  id: "compatibility",
  label: "Compatibility",
  type: "multiselect",
  group: "Compatibility",
  options: [
    "Windows",
    "macOS",
    "Linux",
    "Android",
    "ChromeOS",
  ],
},

{
  id: "interface",
  label: "Interface",
  type: "text",
  group: "Hardware",
},

{
  id: "capacity",
  label: "Capacity",
  type: "text",
  group: "Storage",
},

{
  id: "speed",
  label: "Speed",
  type: "text",
  group: "Performance",
},

{
  id: "rgbLighting",
  label: "RGB Lighting",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "wireless",
  label: "Wireless",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "dimensions",
  label: "Dimensions",
  type: "text",
  group: "Dimensions",
},

{
  id: "weight",
  label: "Weight",
  type: "text",
  group: "Dimensions",
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
GAMING: [

{
  id: "gamingCategory",
  label: "Gaming Category",
  type: "select",
  group: "General",
  required: true,
  options: [
    "Gaming Console",
    "Gaming Laptop",
    "Gaming Desktop",
    "Gaming Monitor",
    "Gaming Keyboard",
    "Gaming Mouse",
    "Gaming Headset",
    "Gaming Chair",
    "Gaming Controller",
    "VR Headset",
    "Gaming Accessories",
  ],
},

{
  id: "brand",
  label: "Brand",
  type: "select",
  group: "General",
  options: [
    "Sony",
    "Microsoft",
    "Nintendo",
    "Asus",
    "MSI",
    "Acer",
    "HP",
    "Lenovo",
    "Logitech",
    "Razer",
    "HyperX",
    "SteelSeries",
    "Corsair",
    "Redragon",
  ],
},

{
  id: "modelName",
  label: "Model Name",
  type: "text",
  group: "General",
},

{
  id: "platform",
  label: "Platform",
  type: "multiselect",
  group: "Compatibility",
  options: [
    "PC",
    "PlayStation 5",
    "PlayStation 4",
    "Xbox Series X",
    "Xbox One",
    "Nintendo Switch",
    "Android",
    "iOS",
  ],
},

{
  id: "connectivity",
  label: "Connectivity",
  type: "multiselect",
  group: "Connectivity",
  options: [
    "USB",
    "USB Type-C",
    "Bluetooth",
    "2.4 GHz Wireless",
    "HDMI",
    "DisplayPort",
    "Wi-Fi",
  ],
},

{
  id: "rgbLighting",
  label: "RGB Lighting",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "wireless",
  label: "Wireless",
  type: "select",
  group: "Features",
  options: [
    "Yes",
    "No",
  ],
},

{
  id: "batteryLife",
  label: "Battery Life",
  type: "text",
  group: "Battery",
},

{
  id: "refreshRate",
  label: "Refresh Rate",
  type: "text",
  group: "Display",
},

{
  id: "resolution",
  label: "Resolution",
  type: "text",
  group: "Display",
},

{
  id: "compatibleWith",
  label: "Compatible With",
  type: "multiselect",
  group: "Compatibility",
  options: [
    "Windows",
    "macOS",
    "Linux",
    "Android",
    "iOS",
  ],
},

{
  id: "boxContents",
  label: "Box Contents",
  type: "textarea",
  group: "Package",
},

{
  id: "dimensions",
  label: "Dimensions",
  type: "text",
  group: "Dimensions",
},

{
  id: "weight",
  label: "Weight",
  type: "text",
  group: "Dimensions",
},

{
  id: "warranty",
  label: "Warranty",
  type: "text",
  group: "Warranty",
},

{
  id: "countryOfOrigin",
  label: "Country of Origin",
  type: "text",
  group: "General",
},

{
  id: "manufacturer",
  label: "Manufacturer",
  type: "text",
  group: "General",
},

],
};
