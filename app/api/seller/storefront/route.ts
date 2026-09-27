import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { loadSellerStorefront } from "@/lib/storefront/storefrontServer";
import { MAX_ABOUT_LENGTH, cleanAbout, isOwnStoreImageUrl } from "@/lib/storefront/publicStorefront";

// ---------------------------------------------------------------------------
// The signed-in seller's OWN storefront.
//
//   GET  /api/seller/storefront   status, public link, appearance, a preview
//                                 of the public storefront, product counts
//   POST /api/seller/storefront   { storeLogo?, storeBanner?, aboutStore? }
//
// Identity is the verified token — no seller or vendor id is read from the
// request, so a seller can only ever see or change their own store.
//
// POST changes only the three existing Store Settings fields (the source of
// truth — nothing new is stored): logo and banner must be Storage download
// URLs in the seller's OWN vendor-store/{uid}/ folder (or "" to clear), and
// the About text is length-limited plain text. Logo/banner are mirrored to
// vendors_public exactly as Store Settings does. Only an Approved seller may
// change their store; store VISIBILITY stays admin-controlled (vendors.status).
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const EDITABLE = new Set(["storeLogo", "storeBanner", "aboutStore"]);

function bad(error: string, status = 400) {
  return Response.json({ error }, { status });
}

async function authorize(request: Request) {
  const requester = await verifyRequestUser(request);
  if (!requester) return { error: bad("Please sign in.", 401) } as const;
  if (!(await isWithinRateLimit("seller-storefront", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
    return { error: bad("Too many requests. Please try again shortly.", 429) } as const;
  }
  const db = getAdminDb();
  const vendor = await findSellerVendor(db, requester.uid);
  if (vendor.kind === "none") return { error: bad("No seller account found for this login.", 403) } as const;
  if (vendor.kind === "duplicate") {
    return { error: bad("More than one seller record exists for this login. Please contact support.", 409) } as const;
  }
  return { requester, db, vendor } as const;
}

export async function GET(request: Request) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;
    const view = await loadSellerStorefront(auth.db, auth.requester.uid, auth.vendor.data);
    return Response.json(view);
  } catch (error) {
    console.error("seller storefront load failed:", error);
    return bad("Could not load your store.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await authorize(request);
    if ("error" in auth) return auth.error;
    const { requester, db, vendor } = auth;
    if (vendor.data.status !== "Approved") {
      return bad("Your seller account is not approved to change your store.", 403);
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid request body.");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) return bad("Invalid request body.");
    const input = body as Record<string, unknown>;
    const keys = Object.keys(input);
    const unknown = keys.filter((k) => !EDITABLE.has(k));
    if (unknown.length) return bad(`These store fields can't be changed here: ${unknown.join(", ")}`);
    if (keys.length === 0) return bad("Nothing to update.");

    const uid = requester.uid;
    const changes: Record<string, string> = {};
    for (const field of ["storeLogo", "storeBanner"] as const) {
      if (!(field in input)) continue;
      const value = input[field];
      if (value === "") {
        changes[field] = "";
      } else if (typeof value === "string" && isOwnStoreImageUrl(uid, value)) {
        changes[field] = value;
      } else {
        return bad("Upload the store image again — it must be an image uploaded to your own store folder.");
      }
    }
    if ("aboutStore" in input) {
      if (typeof input.aboutStore !== "string") return bad("About text must be text.");
      const about = cleanAbout(input.aboutStore);
      if (input.aboutStore.trim().length > MAX_ABOUT_LENGTH) {
        return bad(`About text must be at most ${MAX_ABOUT_LENGTH} characters.`);
      }
      changes.aboutStore = about;
    }

    const now = Timestamp.now();
    const publicRef = db.collection("vendors_public").doc(uid);
    await db.runTransaction(async (tx) => {
      const publicSnap = await tx.get(publicRef);
      tx.update(vendor.ref, { ...changes, updatedAt: now });
      // Same mirror Store Settings keeps: logo and banner only.
      const mirror: Record<string, string> = {};
      if ("storeLogo" in changes) mirror.storeLogo = changes.storeLogo;
      if ("storeBanner" in changes) mirror.storeBanner = changes.storeBanner;
      if (publicSnap.exists && Object.keys(mirror).length) tx.update(publicRef, { ...mirror, updatedAt: now });
    });

    const view = await loadSellerStorefront(db, uid, { ...vendor.data, ...changes });
    return Response.json({ success: true, ...view });
  } catch (error) {
    console.error("seller storefront update failed:", error);
    return bad("Could not update your store.", 500);
  }
}
