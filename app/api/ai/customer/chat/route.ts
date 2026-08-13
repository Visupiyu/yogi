import { NextResponse } from "next/server";
import { chatWithTools, type ChatTurn } from "@/lib/ai/client";
import { customerTools } from "@/lib/ai/tools/customerTools";
import { buildToolRegistry } from "@/lib/ai/tools/types";
import { verifyRequestUser } from "@/lib/ai/serverAuth";

const SYSTEM_PROMPT = `You are the YOMICO Shopping Assistant, helping customers on the YOMICO multi-vendor marketplace find products, compare options, and check their own orders. Use the available tools to look up real product and order data — never invent product names, prices, stock levels, or order details. Keep answers concise and friendly. If a customer asks about anything outside shopping/orders on YOMICO, politely redirect them. Never reveal information belonging to another customer or another seller's private data.`;

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Please sign in to use the shopping assistant." }, { status: 401 });
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

    const reply = await chatWithTools({
      systemPrompt: SYSTEM_PROMPT,
      history,
      message,
      tools: declarations,
      executeTool,
    });

    return NextResponse.json({ reply });
  } catch (error) {
    console.error("Customer AI chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to get a response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
