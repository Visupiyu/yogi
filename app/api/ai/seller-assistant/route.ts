import { NextResponse } from "next/server";
import { generateProductContent } from "@/lib/ai/seller/contentGenerator";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

// Same reasoning as app/api/ai/product-qa/route.ts: every call costs real
// Gemini spend, and this route was previously reachable with no credentials
// at all. Sign-in mirrors app/api/ai/seller/chat/route.ts, the closest
// sibling — no extra role gate there either, since the seller dashboard
// (app/seller/layout.js) already restricts this page to approved vendors and
// the generated content is not scoped to any seller's private data.
//
// Rate limiting copies app/api/create-order/route.ts's module-local helper
// (not exported, so duplicated by convention) under its own key namespace.
const ASSISTANT_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ASSISTANT_RATE_LIMIT_MAX = 20;

async function isWithinSellerAssistantRateLimit(
  uid: string
): Promise<boolean> {
  const ref = getAdminDb()
    .collection("rateLimits")
    .doc(`seller-assistant_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > ASSISTANT_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= ASSISTANT_RATE_LIMIT_MAX) {
      return false;
    }

    tx.update(ref, { count: data.count + 1 });
    return true;
  });
}

export async function POST(request: Request) {
  try {
    const user = await verifyRequestUser(request);

    if (!user) {
      return NextResponse.json(
        { error: "Please sign in to use the seller assistant." },
        { status: 401 }
      );
    }

    if (!(await isWithinSellerAssistantRateLimit(user.uid))) {
      return NextResponse.json(
        {
          error:
            "Too many requests. Please wait a few minutes and try again.",
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const productName = String(body?.productName || "").trim();
    const category = body?.category ? String(body.category).trim() : "";

    if (!productName) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }

    const content = await generateProductContent({ productName, category });

    return NextResponse.json(content);
  } catch (error) {
    // Log the real cause server-side only — provider errors can carry
    // internal details that shouldn't reach the browser.
    console.error("Seller AI content generation error:", error);
    return NextResponse.json(
      { error: "Couldn't generate content right now. Please try again." },
      { status: 500 }
    );
  }
}
