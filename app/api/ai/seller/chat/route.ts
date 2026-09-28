import { NextResponse } from "next/server";
import { chatWithTools, type ChatTurn } from "@/lib/ai/client";
import { sellerTools } from "@/lib/ai/tools/sellerTools";
import { buildToolRegistry } from "@/lib/ai/tools/types";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import {
  isWithinRateLimit,
  AI_CHAT_RATE_LIMIT_MAX,
  AI_CHAT_RATE_LIMIT_WINDOW_MS,
} from "@/lib/rateLimit";

const SYSTEM_PROMPT = `You are the YOMICO Seller Assistant, helping sellers on the YOMICO multi-vendor marketplace understand their own products, sales, and inventory. Use the available tools to look up this seller's real data — never invent sales figures, stock counts, or product details. Keep answers concise and actionable. You can only see this one seller's own data, never another seller's. If asked about anything you can't look up, say so honestly rather than guessing.`;

// The client resends the conversation each turn. It is only ever text the
// model sees (never tool output), but it is still bounded — in count and size —
// so one request cannot carry an unbounded prompt, and any role other than
// user/model is dropped.
const MAX_HISTORY_TURNS = 20;
const MAX_TURN_CHARS = 4000;
const MAX_MESSAGE_CHARS = 2000;

function sanitizeHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  const turns: ChatTurn[] = [];
  for (const turn of value.slice(-MAX_HISTORY_TURNS)) {
    const role = (turn as { role?: unknown })?.role;
    const text = (turn as { text?: unknown })?.text;
    if ((role !== "user" && role !== "model") || typeof text !== "string" || !text.trim()) continue;
    turns.push({ role, text: text.slice(0, MAX_TURN_CHARS) });
  }
  return turns;
}

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

    // Server-side seller gate. The tools only ever read the caller's own
    // data (context.uid), but the assistant is a seller-dashboard feature
    // that spends real Gemini budget, so it is for APPROVED sellers only —
    // the same gate app/seller/layout.js applies in the browser, now enforced
    // here instead of trusted to the client.
    const vendor = await findSellerVendor(getAdminDb(), user.uid);
    if (vendor.kind !== "ok" || vendor.data.status !== "Approved") {
      return NextResponse.json({ error: "The seller assistant is available to approved sellers only." }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const message = String(body?.message || "").trim();
    const history = sanitizeHistory(body?.history);

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (message.length > MAX_MESSAGE_CHARS) {
      return NextResponse.json({ error: "That message is too long." }, { status: 400 });
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
    // Log the real cause server-side only — provider and Firestore errors can
    // carry internal details that shouldn't reach the browser.
    console.error("Seller AI chat error:", error);
    return NextResponse.json({ error: "Couldn't get a response right now. Please try again." }, { status: 500 });
  }
}
