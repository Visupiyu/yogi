import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId, loadCustomerProfile } from "@/lib/customerAccount/customerGuards";
import { PUBLIC_LIST_MAX, newestFirst, toPublicQuestion } from "@/lib/reviews/publicReviews";

// ---------------------------------------------------------------------------
// /api/products/[id]/questions — a product's public Q&A.
//
// GET  (public)  the allow-listed questions (lib/reviews/publicReviews):
//      question, asker's name, the seller's answer only when the seller gave
//      it through app/api/seller/questions/[id]/answer, dates. Never an email
//      or uid (questions written by the Customer App carry customerEmail).
// POST (signed in) { question } — ask a question. The asker is the verified
//      token, the vendorId is the PRODUCT's own vendor, there is no answer and
//      the date is the server's. Previously the browser wrote the document and
//      could pre-fill an "answer" the page showed as the "Seller Reply".
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const MAX_QUESTION_CHARS = 1000;

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    if (!isValidDocId(id)) return Response.json({ questions: [] });
    const snap = await getAdminDb().collection("productQuestions").where("productId", "==", id).get();
    const questions = newestFirst(
      snap.docs.map((d) => toPublicQuestion(d.id, d.data() as Record<string, unknown>))
    ).slice(0, PUBLIC_LIST_MAX);
    return Response.json({ questions });
  } catch (error) {
    console.error("public questions failed:", error);
    return Response.json({ error: "Could not load questions." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("question-create", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { id: productId } = await params;
    if (!isValidDocId(productId)) return Response.json({ error: "Product not found." }, { status: 404 });

    let body: { question?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const question = typeof body.question === "string" ? body.question.trim() : "";
    if (!question || question.length > MAX_QUESTION_CHARS) {
      return Response.json({ error: `Write a question of up to ${MAX_QUESTION_CHARS} characters.` }, { status: 400 });
    }

    const db = getAdminDb();
    const profile = await loadCustomerProfile(db, requester.uid);
    if (profile.blocked) {
      return Response.json({ error: "Your account can't ask questions. Please contact support." }, { status: 403 });
    }

    const productSnap = await db.collection("products").doc(productId).get();
    const product = productSnap.exists ? (productSnap.data() as Record<string, unknown>) : null;
    const vendorId = typeof product?.vendorId === "string" ? product.vendorId : "";
    if (!product || !vendorId) return Response.json({ error: "Product not found." }, { status: 404 });

    const ref = await db.collection("productQuestions").add({
      productId,
      productName: typeof product.title === "string" ? product.title : typeof product.name === "string" ? product.name : "",
      vendorId,
      userId: requester.uid,
      customerName: profile.displayName,
      question,
      answer: "",
      status: "Pending",
      createdAt: Timestamp.now(),
    });
    return Response.json({ success: true, id: ref.id });
  } catch (error) {
    console.error("question create failed:", error);
    return Response.json({ error: "Couldn't submit your question. Please try again." }, { status: 500 });
  }
}
