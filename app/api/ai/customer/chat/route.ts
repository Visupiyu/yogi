import { NextResponse } from "next/server";
import { chatWithTools, type ChatTurn, type ToolCallRecord } from "@/lib/ai/client";
import { customerTools } from "@/lib/ai/tools/customerTools";
import { buildToolRegistry } from "@/lib/ai/tools/types";
import { verifyRequestUser } from "@/lib/serverAuth";
import {
  isWithinRateLimit,
  AI_CHAT_RATE_LIMIT_MAX,
  AI_CHAT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/rateLimit";

const SYSTEM_PROMPT = `You are the YOMICO Shopping Assistant, helping customers on the YOMICO multi-vendor marketplace find products, compare options, and check their own orders. Use the available tools to look up real product and order data — never invent product names, prices, stock levels, or order details. Keep answers concise and friendly. If a customer asks about anything outside shopping/orders on YOMICO, politely redirect them. Never reveal information belonging to another customer or another seller's private data.`;

type ProductCard = {
  id: string;
  title: string;
  image: string;
  price: number;
};

// The chat loop itself is domain-agnostic (lib/ai/client.ts) — this
// route knows the shape of ITS OWN tools' outputs and picks out
// whichever ones look like product results to surface as cards in
// the UI, rather than leaving the customer to parse plain text.
function extractProductCards(toolCalls: ToolCallRecord[]): ProductCard[] {
  const cards = new Map<string, ProductCard>();

  const addIfProduct = (item: unknown) => {
    if (!item || typeof item !== "object") return;
    const p = item as Record<string, unknown>;
    if (typeof p.id !== "string" || typeof p.title !== "string") return;
    if (cards.has(p.id)) return;
    cards.set(p.id, {
      id: p.id,
      title: p.title,
      image: typeof p.image === "string" ? p.image : "",
      price: typeof p.price === "number" ? p.price : 0,
    });
  };

  for (const call of toolCalls) {
    if (
      call.name !== "searchProducts" &&
      call.name !== "getProductRecommendations" &&
      call.name !== "getProduct"
    ) {
      continue;
    }

    const output = call.output as Record<string, unknown>;
    if (Array.isArray(output?.results)) {
      output.results.forEach(addIfProduct);
    } else {
      addIfProduct(output);
    }
  }

  return [...cards.values()].slice(0, 8);
}

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Please sign in to use the shopping assistant." }, { status: 401 });
    }

    // Every turn can fan out into multiple Gemini calls through the tool
    // loop, so an unbounded client costs real money. Auth alone was not a
    // budget: one signed-in account could loop this route indefinitely.
    if (
      !(await isWithinRateLimit(
        "ai-customer-chat",
        user.uid,
        AI_CHAT_RATE_LIMIT_MAX,
        AI_CHAT_RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return NextResponse.json(
        { error: "Too many requests. Please wait a few minutes and try again." },
        { status: 429 }
      );
    }

    const body = await request.json();
    const message = String(body?.message || "").trim();
    const history: ChatTurn[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const { declarations, executeTool } = buildToolRegistry(customerTools, {
      uid: user.uid,
      email: user.email,
      isAdmin: user.isAdmin,
    });

    const result = await chatWithTools({
      systemPrompt: SYSTEM_PROMPT,
      history,
      message,
      tools: declarations,
      executeTool,
    });

    return NextResponse.json({
      reply: result.text,
      products: extractProductCards(result.toolCalls),
    });
  } catch (error) {
    console.error("Customer AI chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to get a response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
