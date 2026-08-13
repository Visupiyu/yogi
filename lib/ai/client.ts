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

const MAX_TOOL_ROUNDS = 5;

export async function chatWithTools({
  systemPrompt,
  history,
  message,
  tools,
  executeTool,
}: ToolChatRequest): Promise<string> {
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
      return text;
    }

    contents.push({
      role: "model",
      parts: functionCalls.map((call) => ({ functionCall: call })),
    });

    const responseParts = [];
    for (const call of functionCalls) {
      const name = call.name ?? "";
      let result: unknown;
      try {
        result = await executeTool(name, call.args ?? {});
      } catch (error) {
        result = {
          error: error instanceof Error ? error.message : "Tool execution failed.",
        };
      }
      responseParts.push({
        functionResponse: { name, response: { result } },
      });
    }

    contents.push({ role: "user" as const, parts: responseParts });
  }

  throw new Error("AI could not complete the request — too many tool calls.");
}
