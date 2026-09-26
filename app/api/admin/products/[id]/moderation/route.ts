import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { planModeration } from "@/lib/products/moderation";
import { productModerationStatus } from "@/lib/products/visibility";

// ---------------------------------------------------------------------------
// ADMIN product moderation: approve / reject / block / unblock.
//
// Server-authoritative and ADMIN-ONLY (same check as the other admin routes:
// requester.isAdmin, which matches firestore.rules' isAdmin()). The client
// sends only the action and, for reject, a reason — never field values. The
// allowed transitions and the exact fields each one writes come from
// lib/products/moderation.ts, so this route cannot be used to make arbitrary
// product writes, and e.g. "block"/"unblock" can never publish a product that
// was never approved.
//
// Writes only: approvalStatus, approved, active, rejectionReason,
// moderatedAt, moderatedBy. Inside a transaction, so the transition is
// validated against the product's current state.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type Outcome =
  | { kind: "ok"; from: string; to: string }
  | { kind: "error"; status: number; error: string };

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    if (!requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (
      !(await isWithinRateLimit(
        "admin-product-moderation",
        requester.uid,
        RATE_LIMIT_MAX,
        RATE_LIMIT_WINDOW_MS
      ))
    ) {
      return Response.json(
        { error: "Too many requests. Please try again shortly." },
        { status: 429 }
      );
    }

    const { id } = await ctx.params;
    const productId = typeof id === "string" ? id : "";
    if (!productId || productId.includes("/") || productId.length > 200) {
      return Response.json({ error: "Missing product id." }, { status: 400 });
    }

    let body: { action?: unknown; reason?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const db = getAdminDb();
    const ref = db.collection("products").doc(productId);

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { kind: "error", status: 404, error: "Product not found." };
      }

      const product = snap.data() as { active?: unknown; approvalStatus?: unknown };
      const plan = planModeration(product, body?.action, body?.reason);
      if (!plan.ok) {
        return { kind: "error", status: plan.status, error: plan.error };
      }

      tx.update(ref, {
        ...plan.changes,
        moderatedAt: Timestamp.now(),
        moderatedBy: requester.uid,
      });

      return {
        kind: "ok",
        from: plan.from,
        to: productModerationStatus(plan.changes),
      };
    });

    if (outcome.kind === "error") {
      return Response.json({ error: outcome.error }, { status: outcome.status });
    }

    return Response.json({ success: true, productId, from: outcome.from, status: outcome.to });
  } catch (error) {
    console.error("admin product moderation failed:", error);
    return Response.json(
      { error: "Could not update the product. Please try again." },
      { status: 500 }
    );
  }
}
