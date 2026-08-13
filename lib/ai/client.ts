// ==========================================
// YOMICO AI Engine — central client
// ==========================================
//
// Every AI-powered feature (Customer AI, Seller AI, Admin AI) calls
// through this one module rather than importing @google/genai directly.
// That keeps the API key access, error handling, and JSON-parsing
// contract in exactly one place instead of duplicated per feature.
//
// Server-only. GEMINI_API_KEY must never be exposed to the client (no
// NEXT_PUBLIC_ prefix) — this file must only ever be imported from
// app/api/** route handlers, never from a "use client" component.

import { GoogleGenAI, type Content } from "@google/genai";

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY is not set. Add it to .env.local (see the comment above that line) to enable AI features."
    );
  }

  if (!client) {
    client = new GoogleGenAI({ apiKey });
  }

  return client;
}

// gemini-2.5-flash was retired for new API keys as of this writing —
// confirmed live against the real API, not just docs. gemini-3.5-flash
// is on Gemini's free tier as of August 2026; if Google moves the free
// tier again, this is the one line to update.
const MODEL = "gemini-3.5-flash";

export type AIRequest = {
  systemPrompt: string;
  userPrompt: string;
};

// Calls Gemini and returns raw text — for free-form chat-style responses
// (e.g. an assistant answering an open question).
export async function generateText({
  systemPrompt,
  userPrompt,
}: AIRequest): Promise<string> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
    },
  });

  const text = response.text;

  if (!text) {
    throw new Error("AI returned an empty response.");
  }

  return text;
}

// Calls Gemini and parses the response as JSON matching the given
// schema — for structured outputs (e.g. "generate these 5 fields").
// responseSchema uses Gemini's own schema format (a subset of OpenAPI).
export async function generateJSON<T>({
  systemPrompt,
  userPrompt,
  responseSchema,
}: AIRequest & { responseSchema: object }): Promise<T> {
  const response = await getClient().models.generateContent({
    model: MODEL,
    contents: userPrompt,
    config: {
      systemInstruction: systemPrompt,
      responseMimeType: "application/json",
      responseSchema,
    },
  });

  const text = response.text;

  if (!text) {
    throw new Error("AI returned an empty response.");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("AI returned a response that wasn't valid JSON.");
  }
}

// ==========================================
// Function calling (tool use)
// ==========================================
//
// Shared by Customer AI / Seller AI / Admin AI chat assistants — each
// role passes its own system prompt and its own scoped set of tools
// (lib/ai/tools/**); Gemini decides which tool(s) to call, this runs
// the actual tool function server-side, and feeds the result back until
// Gemini produces a final answer. Gemini never touches Firestore
// directly — see lib/ai/tools/** for the trusted, scoped implementations.

export type ToolDeclaration = {
  name: string;
  description: string;
  parameters: object;
};

export type ChatTurn = {
  role: "user" | "model";
  text: string;
};

export type ToolChatRequest = {
  systemPrompt: string;
  history: ChatTurn[];
  message: string;
  tools: ToolDeclaration[];
  executeTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
};

// A record of every tool call that succeeded during the loop — kept
// generic (no product/order-specific shape) since this module is
// shared by all three AI roles. Callers (the chat API routes) know
// their own tools' output shapes and can pick out whatever's useful
// to surface structurally to the UI (e.g. product cards).
export type ToolCallRecord = {
  name: string;
  args: Record<string, unknown>;
  output: unknown;
};

export type ToolChatResult = {
  text: string;
  toolCalls: ToolCallRecord[];
};

const MAX_TOOL_ROUNDS = 5;

export async function chatWithTools({
  systemPrompt,
  history,
  message,
  tools,
  executeTool,
}: ToolChatRequest): Promise<ToolChatResult> {
  const contents: Content[] = [
    ...history.map((turn) => ({
      role: turn.role,
      parts: [{ text: turn.text }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  const config = {
    systemInstruction: systemPrompt,
    tools: tools.length > 0 ? [{ functionDeclarations: tools }] : undefined,
  };

  const toolCalls: ToolCallRecord[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await getClient().models.generateContent({
      model: MODEL,
      contents,
      config,
    });

    const functionCalls = response.functionCalls;

    if (!functionCalls || functionCalls.length === 0) {
      const text = response.text;
      if (!text) {
        throw new Error("AI returned an empty response.");
      }
      return { text, toolCalls };
    }

    // Use the raw parts from the response rather than rebuilding them
    // from response.functionCalls (a convenience getter that strips
    // sibling Part fields) — Gemini 3's thinking models attach a
    // thoughtSignature alongside each functionCall part and reject the
    // next turn if it isn't echoed back unchanged.
    const modelParts =
      response.candidates?.[0]?.content?.parts ??
      functionCalls.map((call) => ({ functionCall: call }));

    contents.push({
      role: "model",
      parts: modelParts,
    });

    const responseParts = [];
    for (const call of functionCalls) {
      const name = call.name ?? "";
      let response: Record<string, unknown>;
      try {
        const args = call.args ?? {};
        const output = await executeTool(name, args);
        console.log(`AI Engine: tool ${name} round ${round + 1} ->`, JSON.stringify(output).slice(0, 500));
        toolCalls.push({ name, args, output });
        response = { output };
      } catch (error) {
        const message = error instanceof Error ? error.message : "Tool execution failed.";
        console.error(`AI Engine: tool ${name} round ${round + 1} threw:`, error);
        response = { error: message };
      }
      responseParts.push({
        functionResponse: { id: call.id, name, response },
      });
    }

    contents.push({ role: "user" as const, parts: responseParts });
  }

  throw new Error("AI could not complete the request — too many tool calls.");
}
