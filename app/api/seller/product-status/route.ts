import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { canSellerList, sellerListingBlockReason } from "@/lib/sellerTax";
import {
  isApprovedForSale,
  productModerationStatus,
} from "@/lib/products/visibility";

// ---------------------------------------------------------------------------
// POST /api/seller/product-status — a seller's own product lifecycle.
//
//   { productId, action: "archive" | "unarchive" | "resubmit" }
//
// archive    Takes the product off sale without deleting it: archived:true
//            and active:false. active:false is what already hides a product
//            on every customer surface, every server order path and the
//            Customer App, so an archived product can never be bought, while
//            the document — and every order that references it — stays.
//            The moderation state it was archived from is recorded.
// unarchive  Puts it back as it was. It goes live again ONLY if it was live
//            when archived AND is still approved for sale; a product that was
//            pending, rejected or admin-blocked (or was edited into re-review
//            meanwhile) comes back hidden. Approved sellers only.
// resubmit   A REJECTED product goes back to "pending" admin review (hidden).
//            rejectionReason is cleared — the product is no longer rejected —
//            and kept as lastRejectionReason so the reviewer can see what was
//            wrong last time. Approved sellers who may list only.
//
// Identity is the verified token; the product must be the caller's own. No
// approval field is taken from the request — each action writes a fixed set
// of server-decided values, and none can make a product approved.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const ACTIONS = new Set(["archive", "unarchive", "resubmit"]);

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return bad("Please sign in.", 401);
    if (
      !(await isWithinRateLimit("seller-product-status", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
    ) {
      return bad("Too many requests. Please try again shortly.", 429);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid request body.");
    const input = body as Record<string, unknown>;
    const productId = typeof input.productId === "string" ? input.productId.trim() : "";
    if (!productId || productId.length > 200 || productId.includes("/")) return bad("Missing product id.");
    const action = typeof input.action === "string" ? input.action : "";
    if (!ACTIONS.has(action)) return bad("Invalid action.");

    const db = getAdminDb();
    const uid = requester.uid;

    const vendorSnap = await db.collection("vendors").where("uid", "==", uid).limit(1).get();
    if (vendorSnap.empty) return bad("No seller account found for this login.", 403);
    const vendor = vendorSnap.docs[0].data() as {
      status?: string;
      businessName?: string;
      taxProfile?: { gstStatus?: string; gstin?: string };
      taxVerificationStatus?: string;
    };
    // Taking a product OFF sale is always allowed to its owner; putting one
    // back on sale or back into review needs an approved seller account.
    if (action !== "archive" && vendor.status !== "Approved") {
      return bad("Your seller account is not approved for listing products.", 403);
    }
    if (action === "resubmit") {
      const profile = {
        gstStatus: vendor.taxProfile?.gstStatus,
        gstin: vendor.taxProfile?.gstin,
        taxVerificationStatus: vendor.taxVerificationStatus,
      };
      if (!canSellerList(profile)) {
        return bad(sellerListingBlockReason(profile) || "Your GST profile does not allow listing yet.", 403);
      }
    }

    const ref = db.collection("products").doc(productId);
    type Outcome =
      | { kind: "error"; status: number; error: string }
      | { kind: "ok"; status: string };

    const outcome = await db.runTransaction<Outcome>(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { kind: "error", status: 404, error: "Product not found." };
      const product = snap.data() as Record<string, unknown>;
      if (product.vendorId !== uid) {
        return { kind: "error", status: 403, error: "You can only manage your own products." };
      }
      const now = Timestamp.now();
      const title = typeof product.title === "string" ? product.title : "Product";
      const from = productModerationStatus(product);
      let changes: Record<string, unknown>;

      if (action === "archive") {
        if (product.archived === true) return { kind: "error", status: 409, error: "This product is already archived." };
        changes = { archived: true, archivedAt: now, archivedFromStatus: from, active: false, updatedAt: now };
      } else if (action === "unarchive") {
        if (product.archived !== true) return { kind: "error", status: 409, error: "This product is not archived." };
        const wasLive = product.archivedFromStatus === "live";
        changes = {
          archived: false,
          archivedAt: FieldValue.delete(),
          archivedFromStatus: FieldValue.delete(),
          // Only a product that was live, and is still approved for sale,
          // goes back on sale. Everything else stays hidden as it was.
          active: wasLive && isApprovedForSale(product),
          unarchivedAt: now,
          updatedAt: now,
        };
      } else {
        if (product.archived === true) {
          return { kind: "error", status: 409, error: "Restore this product before resubmitting it." };
        }
        if (product.approvalStatus !== "rejected") {
          return { kind: "error", status: 409, error: "Only a rejected product can be resubmitted for review." };
        }
        changes = {
          approvalStatus: "pending",
          approved: false,
          active: false,
          lastRejectionReason: typeof product.rejectionReason === "string" ? product.rejectionReason : null,
          rejectionReason: null,
          resubmittedAt: now,
          resubmissionCount: FieldValue.increment(1),
          updatedAt: now,
        };
      }

      tx.update(ref, changes);
      tx.set(db.collection("audit_logs").doc(), {
        actorUid: uid,
        actorEmail: requester.email || "",
        action: `seller_product_${action}`,
        targetId: productId,
        details: { from, title },
        createdAt: now,
      });
      if (action === "resubmit") {
        tx.set(db.collection("notifications").doc(), {
          title: "Product resubmitted for review",
          message: `${vendor.businessName || "A seller"} resubmitted "${title}" for review.`,
          role: "admin",
          type: "vendor",
          read: false,
          createdAt: now,
        });
      }
      return {
        kind: "ok",
        status: productModerationStatus({ ...product, ...changes, archived: action === "archive" }),
      };
    });

    if (outcome.kind === "error") return bad(outcome.error, outcome.status);
    return Response.json({ success: true, productId, status: outcome.status });
  } catch (error) {
    console.error("seller product-status failed:", error);
    return bad("Could not update the product. Please try again.", 500);
  }
}
