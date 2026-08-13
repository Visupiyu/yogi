import { generateText } from "@/lib/ai/client";

export type ProductQAInput = {
  question: string;
  productName: string;
  description?: string;
  category?: string;
  brand?: string;
  price?: number;
  specifications?: Record<string, string>;
};

const SYSTEM_PROMPT = `You are the YOMICO Product Q&A assistant, helping shoppers on the YOMICO multi-vendor marketplace decide whether a product is right for them. Answer the customer's question using ONLY the product details given to you below. Keep answers short (2-4 sentences), direct, and helpful. If the details given don't contain enough information to answer confidently, say so honestly and suggest the customer use the "Ask the Seller" feature instead — never guess or invent product facts (materials, certifications, compatibility, dimensions, etc.) that weren't provided.`;

function buildProductContext(input: ProductQAInput): string {
  const lines = [
    `Product name: ${input.productName}`,
    input.brand ? `Brand: ${input.brand}` : "",
    input.category ? `Category: ${input.category}` : "",
    typeof input.price === "number" ? `Price: ₹${input.price}` : "",
    input.description ? `Description: ${input.description}` : "",
  ];

  const specEntries = Object.entries(input.specifications || {}).filter(
    ([, value]) => value
  );

  if (specEntries.length > 0) {
    lines.push(
      "Specifications: " +
        specEntries.map(([key, value]) => `${key}: ${value}`).join(", ")
    );
  }

  return lines.filter(Boolean).join("\n");
}

export async function answerProductQuestion(
  input: ProductQAInput
): Promise<string> {
  const userPrompt = `Product details:\n${buildProductContext(input)}\n\nCustomer question: ${input.question}`;

  const answer = await generateText({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  });

  return answer.trim();
}
