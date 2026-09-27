import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { Timestamp } from "firebase-admin/firestore";
import { planModeration, type ModerationAction } from "@/lib/products/moderation";
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
// moderatedAt, moderatedBy (and archived:false when an admin rejects or
// blocks a product the seller had archived). Inside a transaction, so the
// transition is validated against the product's current state. The same
// transaction appends an audit_logs entry and notifies the seller.
//
// A product the seller resubmitted after rejection (app/api/seller/
// product-status) is simply "pending" again, so approve/reject apply to it
// exactly as to a new product.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 120;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

type Outcome =
  | { kind: "ok"; from: string; to: string }
  | { kind: "error"; status: number; error: string };

function sellerNotice(action: ModerationAction, title: string, reason: string | null) {
  switch (action) {
    case "approve":
      return { title: "Product approved", message: `"${title}" was approved and is now live.` };
    case "reject":
      return {
        title: "Product rejected",
        message: `"${title}" was not approved.${reason ? ` Reason: ${reason}` : ""} You can edit it and resubmit it for review.`,
      };
    case "block":
      return { title: "Product blocked", message: `"${title}" has been taken off sale by YOMICO.` };
    case "unblock":
      return { title: "Product unblocked", message: `"${title}" is back on sale.` };
  }
}

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

      const product = snap.data() as {
        active?: unknown;
        approvalStatus?: unknown;
        archived?: unknown;
        vendorId?: unknown;
        title?: unknown;
        name?: unknown;
      };
      const plan = planModeration(product, body?.action, body?.reason);
      if (!plan.ok) {
        return { kind: "error", status: plan.status, error: plan.error };
      }
      const action = body.action as ModerationAction;
      const now = Timestamp.now();

      tx.update(ref, {
        ...plan.changes,
        moderatedAt: now,
        moderatedBy: requester.uid,
      });

      const title =
        typeof product.title === "string" && product.title
          ? product.title
          : typeof product.name === "string" && product.name
          ? product.name
          : "Your product";
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: requester.uid,
        actorEmail: requester.email || "",
        action: `product_${action}`,
        targetId: productId,
        details: {
          from: plan.from,
          to: productModerationStatus(plan.changes),
          vendorId: typeof product.vendorId === "string" ? product.vendorId : "",
          ...(plan.changes.rejectionReason ? { reason: plan.changes.rejectionReason } : {}),
        },
        createdAt: now,
      });
      // The seller's own notification feed (userId + role "seller" is what
      // app/seller/notifications and NotificationsPanel query).
      if (typeof product.vendorId === "string" && product.vendorId) {
        tx.set(db.collection("notifications").doc(), {
          ...sellerNotice(action, title, plan.changes.rejectionReason),
          userId: product.vendorId,
          role: "seller",
          type: "vendor",
          read: false,
          createdAt: now,
        });
      }

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
