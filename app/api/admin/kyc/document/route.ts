import { verifyRequestUser } from "@/lib/serverAuth";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { getAdminDb, getAdminBucket } from "@/lib/firebaseAdmin";

// ---------------------------------------------------------------------------
// ADMIN-ONLY seller KYC document download.
//   GET /api/admin/kyc/document?vendorId=<id>&type=gst|aadhaar|cheque
//   Authorization: Bearer <idToken>
//
// The client never supplies a Storage URL — only a vendor id and one of the
// three fixed document types. The server resolves the actual document itself
// from the vendor's OWN Firestore record (gstDocUrl / aadhaarDocUrl /
// chequeDocUrl) and reads the file via the Admin SDK, bypassing
// storage.rules the same way every other Admin SDK read does (that read
// itself is what's being authorized here, by the isAdmin check below —
// storage.rules already separately allow admin reads of vendor-kyc/**, so
// this route grants no more access than the rules already intend, and rules
// are left completely unchanged).
//
// Never logs the resolved download URL, the decoded storage object path, or
// document bytes — only static, content-free messages on error.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

const DOC_FIELDS = {
  gst: { field: "gstDocUrl", label: "GST-Certificate" },
  aadhaar: { field: "aadhaarDocUrl", label: "Aadhaar" },
  cheque: { field: "chequeDocUrl", label: "Cancelled-Cheque" },
} as const;

type DocType = keyof typeof DOC_FIELDS;

function isDocType(value: string): value is DocType {
  return value === "gst" || value === "aadhaar" || value === "cheque";
}

// Firebase Storage download URLs look like:
//   https://firebasestorage.googleapis.com/v0/b/<bucket>/o/<url-encoded-path>?alt=media&token=...
// Extracts just the decoded object path (e.g. "vendor-kyc/uid/gst-169...-x.pdf"),
// never the token. Returns null for anything that doesn't match — callers
// must treat that as "cannot resolve", never fall back to fetching the URL
// directly (that would reintroduce the token-trusting behavior this route
// replaces).
function extractStorageObjectPath(downloadUrl: string): string | null {
  try {
    const parsed = new URL(downloadUrl);
    const match = parsed.pathname.match(/\/o\/(.+)$/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

// Keeps the Content-Disposition filename readable and header-safe: only
// alphanumerics, dash, underscore, dot survive.
function sanitizeFilenamePart(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9-_]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return cleaned.slice(0, 60) || "document";
}

export async function GET(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }
    // Authorization is enforced SERVER-SIDE from the verified token, never a
    // client-supplied uid/role — same rule verifyRequestUser encodes for
    // every other admin route.
    if (!requester.isAdmin) {
      return Response.json({ error: "Not authorized." }, { status: 403 });
    }

    if (
      !(await isWithinRateLimit(
        "admin-kyc-document",
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

    const { searchParams } = new URL(request.url);
    const vendorId = (searchParams.get("vendorId") || "").trim();
    const typeParam = (searchParams.get("type") || "").trim();

    if (!vendorId) {
      return Response.json({ error: "Missing vendor id." }, { status: 400 });
    }
    if (!isDocType(typeParam)) {
      return Response.json({ error: "Invalid document type." }, { status: 400 });
    }

    const db = getAdminDb();
    const snap = await db.collection("vendors").doc(vendorId).get();
    if (!snap.exists) {
      return Response.json({ error: "Vendor not found." }, { status: 404 });
    }

    const vendor = snap.data() as {
      uid?: string;
      businessName?: string;
      gstDocUrl?: string;
      aadhaarDocUrl?: string;
      chequeDocUrl?: string;
    };

    const { field, label } = DOC_FIELDS[typeParam];
    const downloadUrl = vendor[field as "gstDocUrl" | "aadhaarDocUrl" | "chequeDocUrl"];

    if (!downloadUrl) {
      return Response.json({ error: "Document not uploaded." }, { status: 404 });
    }

    const objectPath = extractStorageObjectPath(downloadUrl);
    // Defense in depth: only ever serve an object that actually lives under
    // this vendor's own vendor-kyc/{uid}/ folder, even though downloadUrl
    // came from the vendor's own trusted Firestore record and was never
    // client-supplied.
    if (!objectPath || !vendor.uid || !objectPath.startsWith(`vendor-kyc/${vendor.uid}/`)) {
      console.error("Admin KYC document download: could not resolve a valid storage object path.");
      return Response.json({ error: "Could not resolve this document." }, { status: 500 });
    }

    const file = getAdminBucket().file(objectPath);
    const [exists] = await file.exists();
    if (!exists) {
      return Response.json({ error: "Document not found in storage." }, { status: 404 });
    }

    const [metadata] = await file.getMetadata();
    const [buffer] = await file.download();

    const contentType =
      typeof metadata.contentType === "string" && metadata.contentType
        ? metadata.contentType
        : "application/octet-stream";

    const extMatch = objectPath.match(/\.([a-zA-Z0-9]+)$/);
    const ext = extMatch ? `.${extMatch[1].toLowerCase()}` : "";
    const vendorNamePart = sanitizeFilenamePart(vendor.businessName || vendorId);
    const filename = `${sanitizeFilenamePart(label)}-${vendorNamePart}${ext}`;

    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(buffer.length),
        // Sensitive PII — never cached by shared/browser caches.
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    console.error(
      "Admin KYC document download failed:",
      error instanceof Error ? error.name : "unknown error"
    );
    return Response.json(
      { error: "Could not download this document." },
      { status: 500 }
    );
  }
}
