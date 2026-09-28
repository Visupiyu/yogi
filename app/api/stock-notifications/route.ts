import { Timestamp } from "firebase-admin/firestore";
import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { isValidDocId, loadCustomerProfile } from "@/lib/customerAccount/customerGuards";

// ---------------------------------------------------------------------------
// POST /api/stock-notifications { productId } — "tell me when this is back in
// stock". The customer is the verified token and the vendorId is the
// PRODUCT's own vendor (the browser used to supply it). One request per
// customer per product: the document id is {productId}_{uid}, and an older
// request by the same email also counts.
//
// Sellers never read these documents any more — they carried the waiting
// customers' emails. app/api/seller/stock-notifications shows the seller a
// count per product and sends the in-app "back in stock" notice.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!(await isWithinRateLimit("stock-notification", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    let body: { productId?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const productId = typeof body.productId === "string" ? body.productId.trim() : "";
    if (!isValidDocId(productId)) return Response.json({ error: "Product not found." }, { status: 404 });

    const db = getAdminDb();
    const profile = await loadCustomerProfile(db, requester.uid);
    if (profile.blocked) {
      return Response.json({ error: "Your account can't do this. Please contact support." }, { status: 403 });
    }

    const productSnap = await db.collection("products").doc(productId).get();
    const vendorId = productSnap.exists ? productSnap.get("vendorId") : null;
    if (typeof vendorId !== "string" || !vendorId) {
      return Response.json({ error: "Product not found." }, { status: 404 });
    }

    const ref = db.collection("stockNotifications").doc(`${productId}_${requester.uid}`);
    const email = requester.email || "";
    const [existing, legacy] = await Promise.all([
      ref.get(),
      email
        ? db.collection("stockNotifications").where("productId", "==", productId).where("userEmail", "==", email).limit(1).get()
        : Promise.resolve(null),
    ]);
    if (existing.exists || (legacy && !legacy.empty)) {
      return Response.json({ success: true, alreadySubscribed: true });
    }

    const title = productSnap.get("title");
    const name = productSnap.get("name");
    await ref.create({
      productId,
      productName: typeof title === "string" ? title : typeof name === "string" ? name : "",
      vendorId,
      userId: requester.uid,
      userEmail: email,
      userName: profile.displayName,
      createdAt: Timestamp.now(),
    });
    return Response.json({ success: true, alreadySubscribed: false });
  } catch (error) {
    // create() on a doc that appeared concurrently lands here too: same result.
    if ((error as { code?: unknown })?.code === 6) {
      return Response.json({ success: true, alreadySubscribed: true });
    }
    console.error("stock notification failed:", error);
    return Response.json({ error: "Couldn't save your request. Please try again." }, { status: 500 });
  }
}
