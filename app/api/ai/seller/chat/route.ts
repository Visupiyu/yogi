import { NextResponse } from "next/server";
import { chatWithTools, type ChatTurn } from "@/lib/ai/client";
import { sellerTools } from "@/lib/ai/tools/sellerTools";
import { buildToolRegistry } from "@/lib/ai/tools/types";
import { verifyRequestUser } from "@/lib/serverAuth";
import {
  isWithinRateLimit,
  AI_CHAT_RATE_LIMIT_MAX,
  AI_CHAT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/rateLimit";

const SYSTEM_PROMPT = `You are the YOMICO Seller Assistant, helping sellers on the YOMICO multi-vendor marketplace understand their own products, sales, and inventory. Use the available tools to look up this seller's real data — never invent sales figures, stock counts, or product details. Keep answers concise and actionable. You can only see this one seller's own data, never another seller's. If asked about anything you can't look up, say so honestly rather than guessing.`;

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Please sign in to use the seller assistant." }, { status: 401 });
    }

    // Every turn can fan out into multiple Gemini calls through the tool
    // loop, so an unbounded client costs real money. Auth alone was not a
    // budget: one signed-in account could loop this route indefinitely.
    if (
      !(await isWithinRateLimit(
        "ai-seller-chat",
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

    const { declarations, executeTool } = buildToolRegistry(sellerTools, {
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

    return NextResponse.json({ reply: result.text });
  } catch (error) {
    console.error("Seller AI chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to get a response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
