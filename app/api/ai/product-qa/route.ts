import { NextResponse } from "next/server";
import { answerProductQuestion } from "@/lib/ai/customer/productQA";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";

// This route spends real money on every call (Gemini), so it must not be
// reachable anonymously: previously any unauthenticated request could use it
// as a free general-purpose LLM proxy billed to YOMICO, since the whole
// prompt context arrives in the request body. Requiring sign-in matches every
// other API route, and matches this page's own sibling actions — asking the
// seller a question and leaving a review already require login.
//
// Rate limiting copies the pattern in app/api/create-order/route.ts. That
// helper is module-local and not exported, so it is duplicated rather than
// imported (app/api/auth/send-verification-email/route.ts does the same).
// Its own key namespace keeps it from consuming another route's budget.
const QA_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const QA_RATE_LIMIT_MAX = 20;

async function isWithinProductQARateLimit(uid: string): Promise<boolean> {
  const ref = getAdminDb().collection("rateLimits").doc(`product-qa_${uid}`);
  const now = Date.now();

  return getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists
      ? (snap.data() as { windowStart: number; count: number })
      : null;

    if (!data || now - data.windowStart > QA_RATE_LIMIT_WINDOW_MS) {
      tx.set(ref, { windowStart: now, count: 1 });
      return true;
    }

    if (data.count >= QA_RATE_LIMIT_MAX) {
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
        { error: "Please sign in to ask a question." },
        { status: 401 }
      );
    }

    if (!(await isWithinProductQARateLimit(user.uid))) {
      return NextResponse.json(
        {
          error:
            "Too many questions. Please wait a few minutes and try again.",
        },
        { status: 429 }
      );
    }

    const body = await request.json();
    const question = String(body?.question || "").trim();
    const productName = String(body?.productName || "").trim();

    if (!question) {
      return NextResponse.json(
        { error: "Question is required." },
        { status: 400 }
      );
    }

    if (!productName) {
      return NextResponse.json(
        { error: "Product name is required." },
        { status: 400 }
      );
    }

    const answer = await answerProductQuestion({
      question,
      productName,
      description: body?.description ? String(body.description) : undefined,
      category: body?.category ? String(body.category) : undefined,
      brand: body?.brand ? String(body.brand) : undefined,
      price: typeof body?.price === "number" ? body.price : undefined,
      specifications:
        body?.specifications && typeof body.specifications === "object"
          ? body.specifications
          : undefined,
    });

    return NextResponse.json({ answer });
  } catch (error) {
    // Log the real cause server-side only — provider errors can carry
    // internal details that shouldn't reach the browser.
    console.error("Product Q&A AI error:", error);
    return NextResponse.json(
      { error: "Couldn't answer that right now. Please try again." },
      { status: 500 }
    );
  }
}
