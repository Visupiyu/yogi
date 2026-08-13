import { NextResponse } from "next/server";
import { generateProductContent } from "@/lib/ai/seller/contentGenerator";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const productName = String(body?.productName || "").trim();
    const category = body?.category ? String(body.category).trim() : "";

    if (!productName) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }

    const content = await generateProductContent({ productName, category });

    return NextResponse.json(content);
  } catch (error) {
    console.error("Seller AI content generation error:", error);
    const message = error instanceof Error ? error.message : "Failed to generate content.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
