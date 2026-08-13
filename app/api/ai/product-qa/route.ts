import { NextResponse } from "next/server";
import { answerProductQuestion } from "@/lib/ai/customer/productQA";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const question = String(body?.question || "").trim();
    const productName = String(body?.productName || "").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
    }

    if (!productName) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }

    const answer = await answerProductQuestion({
      question,
      productName,
      description: body?.description ? String(body.description) : undefined,
      category: body?.category ? String(body.category) : undefined,
      brand: body?.brand ? String(body.brand) : undefined,
      price: typeof body?.price === "number" ? body.price : undefined,
      specifications:
        body?.specifications && typeof body.specifications === "object"
          ? body.specifications
          : undefined,
    });

    return NextResponse.json({ answer });
  } catch (error) {
    console.error("Product Q&A AI error:", error);
    const message =
      error instanceof Error ? error.message : "Failed to answer question.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
