"use client";

import { useState } from "react";
import { Send } from "lucide-react";

interface ChatInputProps {
  onSend: (message: string) => void;
  loading?: boolean;
}

export default function ChatInput({
  onSend,
  loading = false,
}: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    const text = message.trim();

    if (!text || loading) return;

    onSend(text);
    setMessage("");
  };

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>
  ) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t bg-white p-4">
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={message}
          placeholder="Type your message..."
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={loading}
          className="flex-1 rounded-full border border-gray-300 px-4 py-3 outline-none focus:border-green-500 focus:ring-2 focus:ring-green-200"
        />

        <button
          onClick={handleSend}
          disabled={loading || !message.trim()}
          className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-green-600 to-blue-600 text-white transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send size={20} />
        </button>
      </div>
    </div>
  );
}