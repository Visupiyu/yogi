import { NextResponse } from "next/server";
import { chatWithTools, type ChatTurn } from "@/lib/ai/client";
import { adminTools } from "@/lib/ai/tools/adminTools";
import { buildToolRegistry } from "@/lib/ai/tools/types";
import { verifyRequestUser } from "@/lib/serverAuth";

const SYSTEM_PROMPT = `You are the YOMICO Admin Assistant, helping the marketplace admin understand sales, vendor performance, commission, and inventory across the whole platform. Use the available tools to look up real, authorized data — never invent figures. Keep answers concise and point out anything unusual you notice in the data (e.g. an unusually large single order, a vendor with unusually high refund/cancellation rates) when relevant. You are read-only: you cannot change prices, approve vendors, issue refunds, or modify orders — if asked to take such an action, explain that it must be done manually in the admin panel.`;

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request);
    if (!user) {
      return NextResponse.json({ error: "Please sign in to use the admin assistant." }, { status: 401 });
    }

    if (!user.isAdmin) {
      return NextResponse.json({ error: "Not authorized." }, { status: 403 });
    }

    const body = await request.json();
    const message = String(body?.message || "").trim();
    const history: ChatTurn[] = Array.isArray(body?.history) ? body.history : [];

    if (!message) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }

    const { declarations, executeTool } = buildToolRegistry(adminTools, {
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
    console.error("Admin AI chat error:", error);
    const message = error instanceof Error ? error.message : "Failed to get a response.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
