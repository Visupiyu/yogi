"use client";

import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import ChatInput from "./ChatInput";

interface Message {
  id: string;
  text: string;
  senderId: string;
  createdAt?: any;
}

interface ChatWindowProps {
  messages: Message[];
  currentUserId: string;
  onSend: (message: string) => void;
  loading?: boolean;
}

export default function ChatWindow({
  messages,
  currentUserId,
  onSend,
  loading = false,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
    });
  }, [messages]);

  return (
    <div className="flex h-full flex-col bg-gray-100 rounded-xl overflow-hidden border">

      {/* Messages */}

      <div className="flex-1 overflow-y-auto p-4">

        {messages.length === 0 ? (

          <div className="flex h-full items-center justify-center text-gray-500">
            No messages yet. Start the conversation.
          </div>

        ) : (

          messages.map((message) => (
            <MessageBubble
              key={message.id}
              text={message.text}
              isOwnMessage={
                message.senderId === currentUserId
              }
              time={
                message.createdAt?.toDate?.()?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                }) || ""
              }
            />
          ))

        )}

        <div ref={bottomRef} />

      </div>

      {/* Input */}

      <ChatInput
        onSend={onSend}
        loading={loading}
      />

    </div>
  );
}