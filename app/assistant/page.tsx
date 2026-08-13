"use client";

import AIChatWidget from "@/components/ai/AIChatWidget";

export default function CustomerAssistantPage() {
  return (
    <div className="min-h-screen bg-gray-100 p-3 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white rounded-3xl p-6 sm:p-8 mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold">🤖 YOMICO Shopping Assistant</h1>
          <p className="mt-2 text-indigo-100">
            Ask me to find products, compare options, or check your orders.
          </p>
        </div>

        <AIChatWidget
          endpoint="/api/ai/customer/chat"
          title="Shopping Assistant"
          subtitle="Powered by YOMICO AI"
          suggestedQuestions={[
            "Find me wireless earbuds under ₹1500",
            "What's the status of my last order?",
            "Suggest something for a birthday gift",
          ]}
        />
      </div>
    </div>
  );
}
