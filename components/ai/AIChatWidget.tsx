"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import Link from "next/link";
import Image from "next/image";

type ProductCard = {
  id: string;
  title: string;
  image: string;
  price: number;
};

type ChatMessage = {
  role: "user" | "model";
  text: string;
  products?: ProductCard[];
};

type AIChatWidgetProps = {
  endpoint: string;
  title: string;
  subtitle?: string;
  suggestedQuestions?: string[];
  signInPrompt?: string;
};

export default function AIChatWidget({
  endpoint,
  title,
  subtitle,
  suggestedQuestions = [],
  signInPrompt = "Please sign in to use this assistant.",
}: AIChatWidgetProps) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => setSignedIn(!!user));
    return () => unsub();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;

    const user = auth.currentUser;
    if (!user) {
      setError(signInPrompt);
      return;
    }

    setError("");
    const nextMessages: ChatMessage[] = [...messages, { role: "user", text: trimmed }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const idToken = await user.getIdToken();
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          message: trimmed,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error || "Failed to get a response.");
      }

      setMessages([
        ...nextMessages,
        {
          role: "model",
          text: data.reply || "",
          products: Array.isArray(data.products) ? data.products : undefined,
        },
      ]);
    } catch (err) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden flex flex-col h-[600px] max-h-[80vh]">
      <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-6 py-4">
        <div className="flex items-center gap-2">
          <span className="text-2xl">🤖</span>
          <h2 className="text-lg font-bold">{title}</h2>
        </div>
        {subtitle && <p className="text-indigo-100 text-sm mt-1">{subtitle}</p>}
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.length === 0 && (
          <div className="text-center text-gray-400 text-sm mt-6">
            {signedIn === false ? signInPrompt : "Ask me anything to get started."}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col ${m.role === "user" ? "items-end" : "items-start"}`}>
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm whitespace-pre-line ${
                m.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
              }`}
            >
              {m.text}
            </div>

            {m.products && m.products.length > 0 && (
              <div className="mt-2 max-w-[95%] w-full overflow-x-auto">
                <div className="flex gap-3 pb-1">
                  {m.products.map((p) => (
                    <Link
                      key={p.id}
                      href={`/product/${p.id}`}
                      className="shrink-0 w-36 bg-white border border-gray-200 rounded-2xl shadow-sm hover:shadow-md transition overflow-hidden"
                    >
                      <div className="relative w-full h-24 bg-gray-50">
                        <Image
                          src={p.image || "/no-image.png"}
                          alt={p.title}
                          fill
                          className="object-contain p-2"
                          sizes="144px"
                        />
                      </div>
                      <div className="p-2">
                        <p className="text-xs font-medium text-gray-800 line-clamp-2 min-h-[2rem]">
                          {p.title}
                        </p>
                        <p className="text-sm font-bold text-indigo-700 mt-1">
                          ₹{p.price.toLocaleString("en-IN")}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-white border border-gray-200 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400 shadow-sm">
              Thinking…
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 text-sm rounded-2xl px-4 py-3">
            {error}
          </div>
        )}
      </div>

      {suggestedQuestions.length > 0 && messages.length === 0 && (
        <div className="px-4 pb-2 flex flex-wrap gap-2">
          {suggestedQuestions.map((q) => (
            <button
              key={q}
              onClick={() => sendMessage(q)}
              className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-full transition"
            >
              {q}
            </button>
          ))}
        </div>
      )}

      <div className="border-t p-3 flex gap-2 bg-white">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") sendMessage(input);
          }}
          placeholder="Type your message…"
          disabled={loading}
          className="flex-1 border rounded-2xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={loading || !input.trim()}
          className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-5 rounded-2xl font-semibold text-sm transition"
        >
          Send
        </button>
      </div>
    </div>
  );
}
