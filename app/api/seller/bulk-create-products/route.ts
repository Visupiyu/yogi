import { verifyRequestUser } from "@/lib/serverAuth";
import { bulkProductDocId } from "@/lib/products/bulkUploadServer";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { Timestamp } from "firebase-admin/firestore";
import { mintSequential } from "@/lib/humanIds";
import { canSellerList, sellerListingBlockReason } from "@/lib/sellerTax";
import { deriveDiscountPercent } from "@/lib/products/sellerProductValidation";
import { NEW_PRODUCT_MODERATION } from "@/lib/products/visibility";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { selectFirebaseConfig } from "@/lib/firebaseConfig";
import {
  MAX_BULK_ROWS,
  checkSubmittedBulkProduct,
  normalizeSku,
  summarize,
  type BulkMode,
  type BulkRowResult,
} from "@/lib/products/bulkUpload";

// ---------------------------------------------------------------------------
// Bulk Product Upload (V1) — server-authoritative creation of up to
// MAX_BULK_ROWS simple products from one Excel upload.
//
// Same gates as app/api/seller/create-product, applied once per request:
// verified identity, an admin-Approved seller (one vendor record — duplicates
// are refused, lib/sellerBusinessServer), GST listing eligibility. Each row is
// then checked and REBUILT by lib/products/bulkUpload (only bulk product
// fields, the existing money rules incl. the ₹499 floor, a real category,
// photos this seller uploaded) — the browser's object is never stored as sent.
//
//   mode "check"  — validate only (photos not required yet); nothing written.
//   mode "import" — create every valid row; each row independently, so one
//                   bad row never blocks the others (partial success).
//
// Duplicates: a product's document id is derived from (seller, SKU), and the
// row is written with a create-only transaction, so a double click, a retry
// after a dropped connection, or re-uploading the same file can never create
// the same SKU twice — the second attempt reports "duplicate". A SKU the
// seller already uses on any other product (e.g. one added with the form) is
// a duplicate too. Every created product starts exactly like a form-created
// one: pending admin review and hidden (NEW_PRODUCT_MODERATION), vendorId and
// vendorName from the server, counters at zero, a freshly minted
// productNumber, and the server-derived discount.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinRateLimit("bulk-create-products", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many uploads. Please wait a few minutes and try again." }, { status: 429 });
    }

    let body: { mode?: unknown; rows?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }

    const mode = body.mode;
    if (mode !== "check" && mode !== "import") {
      return Response.json({ error: "Invalid mode." }, { status: 400 });
    }
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "No products to upload." }, { status: 400 });
    }
    if (rows.length > MAX_BULK_ROWS) {
      return Response.json({ error: `Upload at most ${MAX_BULK_ROWS} products at a time.` }, { status: 400 });
    }
    const rowNumbers = new Set<number>();
    for (const row of rows) {
      const n = (row as { rowNumber?: unknown })?.rowNumber;
      if (typeof n !== "number" || !Number.isSafeInteger(n) || n < 1 || rowNumbers.has(n)) {
        return Response.json({ error: "Each product needs its own row number." }, { status: 400 });
      }
      rowNumbers.add(n);
    }

    const db = getAdminDb();

    // ---- seller gates (once per request; same as create-product) ----
    const lookup = await findSellerVendor(db, requester.uid);
    if (lookup.kind !== "ok") {
      return Response.json(
        {
          error:
            lookup.kind === "duplicate"
              ? "Your seller account has more than one record. Please contact YOMICO support."
              : "No seller account found for this login.",
        },
        { status: 403 }
      );
    }
    const vendor = lookup.data as {
      status?: string;
      businessName?: string;
      fullName?: string;
      taxProfile?: { gstStatus?: string; gstin?: string };
      taxVerificationStatus?: string;
    };
    if (vendor.status !== "Approved") {
      return Response.json({ error: "Your seller account is not approved for listing products." }, { status: 403 });
    }
    const listingProfile = {
      gstStatus: vendor.taxProfile?.gstStatus,
      gstin: vendor.taxProfile?.gstin,
      taxVerificationStatus: vendor.taxVerificationStatus,
    };
    if (!canSellerList(listingProfile)) {
      return Response.json(
        {
          error: sellerListingBlockReason(listingProfile) || "Your GST profile does not allow listing yet.",
          code: "GST_LISTING_BLOCKED",
        },
        { status: 403 }
      );
    }

    // ---- per-row checks (nothing written yet) ----
    const imagePolicy = {
      bucket: selectFirebaseConfig().storageBucket,
      allowEmulator: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true",
    };
    type Checked = { rowNumber: number; sku: string; product?: Record<string, unknown>; errors: string[] };
    const checked: Checked[] = (rows as { rowNumber: number; product?: unknown }[]).map((row) => {
      const result = checkSubmittedBulkProduct(row.product, {
        uid: requester.uid,
        requireImages: mode === "import",
        images: imagePolicy,
      });
      const rawSku = (row.product as { sku?: unknown } | undefined)?.sku;
      const sku = result.ok ? String(result.product.sku) : typeof rawSku === "string" ? rawSku.trim() : "";
      return result.ok
        ? { rowNumber: row.rowNumber, sku, product: result.product, errors: [] }
        : { rowNumber: row.rowNumber, sku, errors: result.errors };
    });

    // The same SKU twice in one upload: neither row is created.
    const rowsBySku = new Map<string, number[]>();
    for (const c of checked) {
      const key = normalizeSku(c.sku);
      if (key) rowsBySku.set(key, [...(rowsBySku.get(key) || []), c.rowNumber]);
    }
    for (const c of checked) {
      const same = rowsBySku.get(normalizeSku(c.sku)) || [];
      if (same.length > 1) {
        c.errors.push(`SKU "${c.sku}" is also used in row ${same.filter((r) => r !== c.rowNumber).join(", ")}. Each product needs its own SKU.`);
        c.product = undefined;
      }
    }

    // SKUs this seller already uses on any product.
    const existing = await db.collection("products").where("vendorId", "==", requester.uid).select("sku").get();
    const existingSkus = new Set(existing.docs.map((d) => normalizeSku(d.get("sku"))).filter(Boolean));

    const results: BulkRowResult[] = [];
    const vendorName = vendor.businessName || vendor.fullName || "";

    for (const c of checked) {
      if (!c.product || c.errors.length) {
        results.push({ rowNumber: c.rowNumber, sku: c.sku, status: "error", errors: c.errors });
        continue;
      }
      const ref = db.collection("products").doc(bulkProductDocId(requester.uid, c.sku));
      if (existingSkus.has(normalizeSku(c.sku))) {
        results.push({ rowNumber: c.rowNumber, sku: c.sku, status: "duplicate" });
        continue;
      }
      if (mode === "check") {
        results.push({ rowNumber: c.rowNumber, sku: c.sku, status: "ready" });
        continue;
      }

      const product = c.product;
      try {
        const outcome = await db.runTransaction(async (tx) => {
          // All reads before any write: the row's own document, then the
          // product counter (mintSequential reads, then writes it).
          const snap = await tx.get(ref);
          if (snap.exists) return { created: false as const };
          const productNumber = await mintSequential(tx, db, "product");
          // Exactly the server-owned fields app/api/seller/create-product
          // stores (the bulk-upload harness compares the two key sets).
          tx.create(ref, {
            ...product,
            discount: deriveDiscountPercent(product.mrp, product.sellingPrice),
            ...NEW_PRODUCT_MODERATION,
            vendorId: requester.uid,
            vendorName,
            sales: 0,
            rating: 0,
            reviewCount: 0,
            views: 0,
            wishlistCount: 0,
            productNumber,
            createdAt: Timestamp.now(),
          });
          return { created: true as const, productNumber };
        });
        existingSkus.add(normalizeSku(c.sku));
        results.push(
          outcome.created
            ? { rowNumber: c.rowNumber, sku: c.sku, status: "created", productId: ref.id, productNumber: outcome.productNumber }
            : { rowNumber: c.rowNumber, sku: c.sku, status: "duplicate", productId: ref.id }
        );
      } catch (error) {
        console.error("bulk-create-products row failed:", c.rowNumber, error);
        results.push({ rowNumber: c.rowNumber, sku: c.sku, status: "error", errors: ["Could not save this product. Please try again."] });
      }
    }

    return Response.json({ mode: mode as BulkMode, results, summary: summarize(results) });
  } catch (error) {
    console.error("bulk-create-products failed:", error);
    return Response.json({ error: "Could not process the upload. Please try again." }, { status: 500 });
  }
}
