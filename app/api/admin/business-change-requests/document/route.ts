import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminBucket, getAdminDb } from "@/lib/firebaseAdmin";
import { isOwnKycDocumentPath } from "@/lib/sellerBusiness";
import { CHANGE_REQUESTS } from "@/lib/sellerBusinessServer";

// ---------------------------------------------------------------------------
// ADMIN-ONLY: the proof document attached to a seller's bank-change request.
//   GET /api/admin/business-change-requests/document?requestId=<id>&mode=view|download
//
// Same model as app/api/admin/kyc/document: the client names only the request;
// the server resolves the stored object path from the request itself, serves
// it ONLY if it lies in that seller's own vendor-kyc/{uid}/ folder, and never
// logs the path or the bytes.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) return Response.json({ error: "Please sign in." }, { status: 401 });
    if (requester.isAdmin !== true) return Response.json({ error: "Not authorized." }, { status: 403 });
    if (
      !(await isWithinRateLimit("admin-business-change-doc", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))
    ) {
      return Response.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
    }

    const params = new URL(request.url).searchParams;
    const requestId = (params.get("requestId") || "").trim();
    const mode = (params.get("mode") || "view").trim();
    if (!requestId || requestId.length > 200 || requestId.includes("/")) {
      return Response.json({ error: "Missing request id." }, { status: 400 });
    }
    if (mode !== "view" && mode !== "download") {
      return Response.json({ error: "Invalid mode." }, { status: 400 });
    }

    const snap = await getAdminDb().collection(CHANGE_REQUESTS).doc(requestId).get();
    if (!snap.exists) return Response.json({ error: "Request not found." }, { status: 404 });
    const d = snap.data() || {};
    const vendorUid = typeof d.vendorUid === "string" ? d.vendorUid : "";
    if (!d.documentPath) return Response.json({ error: "No document on this request." }, { status: 404 });
    if (!isOwnKycDocumentPath(vendorUid, d.documentPath)) {
      console.error("Business change document: stored path is not in the seller's KYC folder.");
      return Response.json({ error: "Could not resolve this document." }, { status: 500 });
    }

    const file = getAdminBucket().file(d.documentPath);
    const [exists] = await file.exists();
    if (!exists) return Response.json({ error: "Document not found in storage." }, { status: 404 });
    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();
    const contentType =
      typeof metadata.contentType === "string" && metadata.contentType
        ? metadata.contentType
        : "application/octet-stream";
    const ext = (d.documentPath.match(/\.([a-zA-Z0-9]+)$/)?.[1] || "").toLowerCase();
    const filename = `bank-proof-${requestId.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 60)}${ext ? "." + ext : ""}`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `${mode === "view" ? "inline" : "attachment"}; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(
      "Business change document access failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return Response.json({ error: "Could not access this document." }, { status: 500 });
  }
}
