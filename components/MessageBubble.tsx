"use client";

import { motion } from "framer-motion";

interface MessageBubbleProps {
  text: string;
  isOwnMessage: boolean;
  time?: string;
}

export default function MessageBubble({
  text,
  isOwnMessage,
  time,
}: MessageBubbleProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      className={`flex ${
        isOwnMessage ? "justify-end" : "justify-start"
      } mb-3`}
    >
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2 shadow-md ${
          isOwnMessage
            ? "bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-br-md"
            : "bg-white border border-gray-200 text-gray-800 rounded-bl-md"
        }`}
      >
        <p className="break-words text-sm">{text}</p>

        {time && (
          <p
            className={`mt-1 text-[11px] ${
              isOwnMessage
                ? "text-white/80"
                : "text-gray-500"
            } text-right`}
          >
            {time}
          </p>
        )}
      </div>
    </motion.div>
  );
}