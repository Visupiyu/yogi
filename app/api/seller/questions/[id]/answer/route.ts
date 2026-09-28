import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { isValidDocId } from "@/lib/customerAccount/customerGuards";

// ---------------------------------------------------------------------------
// POST /api/seller/questions/[id]/answer { answer } — a seller answers a
// customer's question about THEIR product.
//
// Ownership is the PRODUCT's vendorId, read here with the Admin SDK — not the
// question's own vendorId, which the asker used to be able to choose (and so
// route a question on a competitor's product to themselves and "answer" it).
// The seller is the verified token and must be an Approved seller.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_ANSWER_CHARS = 1000;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("seller-question-answer", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { id } = await params;
    if (!isValidDocId(id)) return Response.json({ error: "Question not found." }, { status: 404 });

    let body: { answer?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";
    if (!answer || answer.length > MAX_ANSWER_CHARS) {
      return Response.json({ error: `Write an answer of up to ${MAX_ANSWER_CHARS} characters.` }, { status: 400 });
    }

    const db = getAdminDb();
    const vendor = await findSellerVendor(db, requester.uid);
    if (vendor.kind !== "ok" || vendor.data.status !== "Approved") {
      return Response.json({ error: "Only approved sellers can answer questions." }, { status: 403 });
    }

    const questionRef = db.collection("productQuestions").doc(id);
    const questionSnap = await questionRef.get();
    const productId = questionSnap.exists ? questionSnap.get("productId") : null;
    const productSnap = isValidDocId(productId) ? await db.collection("products").doc(productId).get() : null;
    // One answer for "no such question" and "not your product".
    if (!productSnap?.exists || productSnap.get("vendorId") !== requester.uid) {
      return Response.json({ error: "Question not found." }, { status: 404 });
    }

    await questionRef.update({
      answer,
      status: "Answered",
      // Re-pinned to the product's real owner, whatever the question said.
      vendorId: requester.uid,
      answeredAt: Timestamp.now(),
    });
    return Response.json({ success: true });
  } catch (error) {
    console.error("seller question answer failed:", error);
    return Response.json({ error: "Couldn't save your answer. Please try again." }, { status: 500 });
  }
}
