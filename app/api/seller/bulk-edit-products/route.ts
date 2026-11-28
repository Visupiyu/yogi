import { verifyRequestUser } from "@/lib/serverAuth";
import { getAdminDb } from "@/lib/firebaseAdmin";
import { isWithinRateLimit } from "@/lib/rateLimit";
import { findSellerVendor } from "@/lib/sellerBusinessServer";
import { writeSellerProductEdit } from "@/lib/products/sellerProductUpdate";
import { decideEditRow, exportRowFor } from "@/lib/products/bulkEditServer";
import {
  MAX_CHANGED_ROWS,
  MAX_EDIT_ROWS,
  checkSubmittedEditValues,
  summarizeEdits,
  type BulkEditField,
  type EditRowResult,
} from "@/lib/products/bulkEdit";

// ---------------------------------------------------------------------------
// Bulk Product Edit (V1) — server-authoritative.
//
//   mode "export" — this seller's products with their bulk-editable values
//                   and a version per product (lib/products/bulkEditServer).
//   mode "check"  — what each edited row would do; nothing is written.
//   mode "apply"  — applies each changed row independently, in its own
//                   transaction (one bad row never blocks the others).
//
// Same gates as app/api/seller/update-product: a verified seller whose ONE
// vendor record is Approved (duplicates refused, lib/sellerBusinessServer).
// Ownership is checked on the stored product (vendorId === the verified uid);
// another seller's product, or an id that does not exist, is reported the same
// way and never touched. Every change goes through the SAME edit logic the
// product form uses (lib/products/sellerProductUpdate): money/MRP/₹499 policy,
// derived discount, category lock, and re-review of an MRP change on a live
// product. Only the bulk-edit fields are accepted, and stock-bearing variant
// products never get a product-level stock write.
//
// No unintended or repeated writes: a row equal to the product is
// "unchanged" (so re-applying a file, or a double click, writes nothing), and
// a row whose product changed after export is "stale" and skipped — every
// decision is re-made inside the apply transaction on the product as stored.
// ---------------------------------------------------------------------------

const RATE_LIMIT_MAX = 30;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const NOT_YOURS = "This product was not found in your products.";

export async function POST(request: Request) {
  try {
    const requester = await verifyRequestUser(request);
    if (!requester) {
      return Response.json({ error: "Please sign in." }, { status: 401 });
    }

    if (!(await isWithinRateLimit("bulk-edit-products", requester.uid, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_MS))) {
      return Response.json({ error: "Too many requests. Please wait a few minutes and try again." }, { status: 429 });
    }

    let body: { mode?: unknown; rows?: unknown };
    try {
      body = await request.json();
    } catch {
      return Response.json({ error: "Invalid request body." }, { status: 400 });
    }
    const mode = body.mode;
    if (mode !== "export" && mode !== "check" && mode !== "apply") {
      return Response.json({ error: "Invalid mode." }, { status: 400 });
    }

    const db = getAdminDb();

    // ---- seller gate (same as update-product; duplicate records refused) ----
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
    if ((lookup.data as { status?: unknown }).status !== "Approved") {
      return Response.json({ error: "Your seller account is not approved to change products." }, { status: 403 });
    }

    // ---- export ----
    if (mode === "export") {
      const snap = await db.collection("products").where("vendorId", "==", requester.uid).get();
      const rows = snap.docs
        .map((d) => exportRowFor(d.id, d.data()))
        .sort((a, b) => a.productNumber.localeCompare(b.productNumber) || a.title.localeCompare(b.title));
      return Response.json({ mode, rows });
    }

    // ---- check / apply: request shape ----
    const rows = body.rows;
    if (!Array.isArray(rows) || rows.length === 0) {
      return Response.json({ error: "No products to update." }, { status: 400 });
    }
    if (rows.length > MAX_EDIT_ROWS) {
      return Response.json({ error: `Upload at most ${MAX_EDIT_ROWS} products at a time.` }, { status: 400 });
    }
    const rowNumbers = new Set<number>();
    for (const row of rows) {
      const r = row as { rowNumber?: unknown; productId?: unknown; version?: unknown };
      if (typeof r?.rowNumber !== "number" || !Number.isSafeInteger(r.rowNumber) || r.rowNumber < 1 || rowNumbers.has(r.rowNumber)) {
        return Response.json({ error: "Each product needs its own row number." }, { status: 400 });
      }
      rowNumbers.add(r.rowNumber);
    }

    type Prepared = { rowNumber: number; productId: string; version: string; values?: Partial<Record<BulkEditField, string | number>>; errors: string[] };
    const prepared: Prepared[] = (rows as { rowNumber: number; productId?: unknown; version?: unknown; values?: unknown }[]).map((row) => {
      const productId = typeof row.productId === "string" ? row.productId.trim() : "";
      const version = typeof row.version === "string" ? row.version : "";
      const errors: string[] = [];
      if (!productId || productId.includes("/") || productId.length > 200) errors.push("Product ID is missing or not valid.");
      if (!version) errors.push("Version is missing — download your products again and edit that file.");
      const checked = checkSubmittedEditValues(row.values);
      if (!checked.ok) errors.push(...checked.errors);
      return { rowNumber: row.rowNumber, productId, version, values: checked.ok ? checked.values : undefined, errors };
    });

    // The same product twice in one upload: neither row is applied.
    const rowsById = new Map<string, number[]>();
    for (const p of prepared) if (p.productId) rowsById.set(p.productId, [...(rowsById.get(p.productId) || []), p.rowNumber]);
    for (const p of prepared) {
      const same = rowsById.get(p.productId) || [];
      if (same.length > 1) p.errors.push(`This product is also in row ${same.filter((n) => n !== p.rowNumber).join(", ")}. Keep one row per product.`);
    }

    // ---- decide every row on the stored products (no writes) ----
    const valid = prepared.filter((p) => p.errors.length === 0);
    const snaps = valid.length ? await db.getAll(...valid.map((p) => db.collection("products").doc(p.productId))) : [];
    const stored = new Map(snaps.map((s) => [s.id, s]));
    const results: EditRowResult[] = [];
    const toApply: Prepared[] = [];

    for (const p of prepared) {
      if (p.errors.length) {
        results.push({ rowNumber: p.rowNumber, productId: p.productId, status: "error", errors: [...new Set(p.errors)] });
        continue;
      }
      const snap = stored.get(p.productId);
      const existing = snap?.exists ? (snap.data() as Record<string, unknown>) : null;
      if (!existing || existing.vendorId !== requester.uid) {
        results.push({ rowNumber: p.rowNumber, productId: p.productId, status: "error", errors: [NOT_YOURS] });
        continue;
      }
      const title = typeof existing.title === "string" ? existing.title : "";
      const decision = decideEditRow(existing, p.values!, p.version);
      if (decision.status === "ready") {
        results.push({ rowNumber: p.rowNumber, productId: p.productId, title, status: "ready", changes: decision.changes, reReview: decision.plan.reReview.length > 0 });
        toApply.push(p);
      } else {
        results.push({ rowNumber: p.rowNumber, productId: p.productId, title, status: decision.status, ...("errors" in decision ? { errors: decision.errors } : {}) });
      }
    }

    if (mode === "apply" && toApply.length > MAX_CHANGED_ROWS) {
      return Response.json(
        { error: `This file changes ${toApply.length} products. Apply at most ${MAX_CHANGED_ROWS} changes at a time — split the file.` },
        { status: 400 }
      );
    }

    if (mode === "apply") {
      for (const p of toApply) {
        const index = results.findIndex((r) => r.rowNumber === p.rowNumber);
        const ref = db.collection("products").doc(p.productId);
        try {
          // Re-decided on the product as stored NOW, inside the transaction:
          // a sale, a concurrent edit or a second apply since the check above
          // turns this row into unchanged / stale instead of a blind write.
          const result = await db.runTransaction<EditRowResult>(async (tx) => {
            const snap = await tx.get(ref);
            const existing = snap.exists ? (snap.data() as Record<string, unknown>) : null;
            if (!existing || existing.vendorId !== requester.uid) {
              return { rowNumber: p.rowNumber, productId: p.productId, status: "error", errors: [NOT_YOURS] };
            }
            const title = typeof existing.title === "string" ? existing.title : "";
            const decision = decideEditRow(existing, p.values!, p.version);
            if (decision.status !== "ready") {
              return { rowNumber: p.rowNumber, productId: p.productId, title, status: decision.status, ...("errors" in decision ? { errors: decision.errors } : {}) };
            }
            writeSellerProductEdit(tx, db, ref, existing, decision.plan);
            return { rowNumber: p.rowNumber, productId: p.productId, title, status: "updated", changes: decision.changes, reReview: decision.plan.reReview.length > 0 };
          });
          results[index] = result;
        } catch (error) {
          console.error("bulk-edit-products row failed:", p.rowNumber, error);
          results[index] = { ...results[index], status: "error", changes: undefined, errors: ["Could not save this change. Please try again."] };
        }
      }
    }

    return Response.json({ mode, results, summary: summarizeEdits(results) });
  } catch (error) {
    console.error("bulk-edit-products failed:", error);
    return Response.json({ error: "Could not process the file. Please try again." }, { status: 500 });
  }
}
