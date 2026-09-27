import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";

// ---------------------------------------------------------------------------
// ADMIN product management that is not moderation:
//   POST /api/admin/products/[id]/manage  { action: "feature" | "unfeature" | "delete" }
//
// Replaces the admin page's direct browser writes. Admin only (verified
// token). Every action is audit-logged in the same transaction.
//
// "delete" is PERMANENT, so it is refused for a product with sales history —
// order records and statements reference it; block it (moderation) instead.
// Products that never sold (e.g. a rejected duplicate) can still be removed.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ACTIONS = new Set(["feature", "unfeature", "delete"]);

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (!requester.isAdmin) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (
      !(await isWithinRateLimit("admin-product-manage", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
    ) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const { id } = await ctx.params;
    const productId = typeof id === "string" ? id : "";
    if (!productId || productId.includes("/") || productId.length > 200) {
      return Response.json({ error: "Missing product id." }, { status: 400 });
    }

    let body: { action?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const action = typeof body?.action === "string" ? body.action : "";
    if (!ACTIONS.has(action)) return Response.json({ error: "Invalid action." }, { status: 400 });

    const db = getAdminDb();
    const ref = db.collection("products").doc(productId);

    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { status: 404, error: "Product not found." } as const;
      const product = snap.data() || {};
      const now = Timestamp.now();

      if (action === "delete") {
        if (Number(product.sales) > 0) {
          return {
            status: 409,
            error: "This product has sales history and can't be deleted. Block it instead.",
          } as const;
        }
        tx.delete(ref);
      } else {
        tx.update(ref, { featured: action === "feature", updatedAt: now });
      }
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: `product_${action}`,
        targetId: productId,
        details: {
          title: typeof product.title === "string" ? product.title : typeof product.name === "string" ? product.name : "",
          vendorId: typeof product.vendorId === "string" ? product.vendorId : "",
        },
        createdAt: now,
      });
      return { status: 200 } as const;
    });

    if (outcome.status !== 200) {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }
    return Response.json({ success: true, productId, action });
  } catch (error) {
    console.error("admin product manage failed:", error);
    return Response.json({ error: "Could not update the product. Please try again." }, { status: 500 });
  }
}
