"use client";

import AIChatWidget from "@/components/ai/AIChatWidget";

export default function AdminAIAssistantPage() {
  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">🤖 Admin AI Assistant</h1>
        <p className="text-gray-500 mt-1">
          Ask about sales, vendor performance, commission, and inventory across the marketplace.
        </p>
      </div>

      <AIChatWidget
        endpoint="/api/ai/admin/chat"
        title="Admin Assistant"
        subtitle="Read-only — data lookups only, no automatic actions"
        suggestedQuestions={[
          "Which vendors had the highest sales this month?",
          "What's our total commission so far?",
          "Which products are low on stock?",
        ]}
      />
    </div>
  );
}
