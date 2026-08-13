// ==========================================
// YOMICO AI Engine — Seller AI: product content generator
// ==========================================
//
// Powers the "Generate AI Content" button on app/seller/assistant.
// One structured-JSON call generates every field the page needs at
// once, rather than one call per field — cheaper, faster, and keeps a
// consistent voice across all the generated copy.

import { generateJSON } from "@/lib/ai/client";

export type ProductContentInput = {
  productName: string;
  category?: string;
};

export type ProductContentResult = {
  description: string;
  seoTitle: string;
  tags: string;
  tips: string[];
  socialPost: string;
  emailContent: string;
  offerText: string;
  hindiDescription: string;
  whatsappMessage: string;
  googleHeadline: string;
  bulletPoints: string[];
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    description: {
      type: "string",
      description:
        "A genuine, specific 3-4 sentence product description highlighting real, plausible selling points for this exact product — not generic boilerplate.",
    },
    seoTitle: {
      type: "string",
      description: "An SEO-friendly product title, under 70 characters, ending with | YOMICO.",
    },
    tags: {
      type: "string",
      description: "6-10 comma-separated SEO keywords relevant to this specific product.",
    },
    tips: {
      type: "array",
      items: { type: "string" },
      description: "5-6 short, actionable selling tips specific to this product/category, each prefixed with a relevant emoji.",
    },
    socialPost: {
      type: "string",
      description: "A short, punchy social media post (Instagram/Facebook style) for this product, with relevant hashtags.",
    },
    emailContent: {
      type: "string",
      description: "A promotional email, including a Subject: line, body, and sign-off from Team YOMICO.",
    },
    offerText: {
      type: "string",
      description: "A short limited-time-offer style promotional line for this product.",
    },
    hindiDescription: {
      type: "string",
      description: "A 2-3 sentence product description written in Hindi (Devanagari script).",
    },
    whatsappMessage: {
      type: "string",
      description: "A short WhatsApp broadcast message for this product, ending with a link placeholder https://yomico.in.",
    },
    googleHeadline: {
      type: "string",
      description: "A Google Ads style headline for this product, under 30 characters if possible.",
    },
    bulletPoints: {
      type: "array",
      items: { type: "string" },
      description: "5 short product highlight bullet points, specific to this product where possible.",
    },
  },
  required: [
    "description",
    "seoTitle",
    "tags",
    "tips",
    "socialPost",
    "emailContent",
    "offerText",
    "hindiDescription",
    "whatsappMessage",
    "googleHeadline",
    "bulletPoints",
  ],
};

const SYSTEM_PROMPT = `You are the YOMICO Seller AI assistant, helping small and medium sellers on the YOMICO multi-vendor marketplace create marketing content for their product listings. Write in a friendly, professional tone suited to an Indian e-commerce audience. Be specific to the product given, not generic. Never invent false claims (e.g. certifications, awards, guarantees) that weren't provided to you.`;

export async function generateProductContent(
  input: ProductContentInput
): Promise<ProductContentResult> {
  const userPrompt = `Generate marketing content for this product:
Product name: ${input.productName}
Category: ${input.category || "Not specified"}`;

  return generateJSON<ProductContentResult>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
    responseSchema: RESPONSE_SCHEMA,
  });
}
