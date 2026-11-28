// SERVER-ONLY (node:crypto, firebase-admin via sellerProductUpdate). Bulk Edit
// helpers: the product version stamped into an export, the exported row, and
// the per-row decision both "check" and "apply" use.
import crypto from "node:crypto";
import { hasStockBearingVariants } from "@/lib/products/inventory";
import { stableStringify } from "@/lib/products/sellerProductFields";
import { productModerationStatus } from "@/lib/products/visibility";
import { planSellerProductEdit, type SellerEditPlan } from "@/lib/products/sellerProductUpdate";
import {
  BULK_EDIT_FIELDS,
  type BulkEditField,
  type ExportRow,
  type FieldChange,
} from "@/lib/products/bulkEdit";

/**
 * A short fingerprint of the product's bulk-editable values (and whether its
 * stock lives on variants). Written into the export; a row whose product no
 * longer matches it — a stock change from a sale, an edit made elsewhere — is
 * skipped rather than overwritten with what the seller saw earlier.
 */
export function productVersion(product: Record<string, unknown>): string {
  const basis = Object.fromEntries(BULK_EDIT_FIELDS.map((f) => [f, product[f] ?? null]));
  const payload = stableStringify({ ...basis, variantStock: hasStockBearingVariants(product.variants) });
  return crypto.createHash("sha256").update(payload).digest("hex").slice(0, 16);
}

const STATUS_LABEL: Record<string, string> = {
  live: "Live", pending: "Pending review", rejected: "Rejected", blocked: "Blocked", archived: "Archived",
};

/** The export row for one of the seller's products. */
export function exportRowFor(id: string, product: Record<string, unknown>): ExportRow {
  const str = (v: unknown) => (typeof v === "string" ? v : typeof v === "number" ? String(v) : "");
  const values: ExportRow["values"] = {};
  for (const f of BULK_EDIT_FIELDS) {
    const v = product[f];
    if (typeof v === "number" && Number.isFinite(v)) values[f] = v;
    else if (typeof v === "string" && v !== "") values[f] = v;
  }
  const variantCount = Array.isArray(product.variants) ? product.variants.length : 0;
  const status = productModerationStatus(product as never);
  return {
    productId: id,
    productNumber: str(product.productNumber),
    sku: str(product.sku),
    title: str(product.title) || str(product.name),
    status: STATUS_LABEL[status] || status,
    variants: hasStockBearingVariants(product.variants) ? `Yes (${variantCount})` : "No",
    values,
    version: productVersion(product),
  };
}

export type EditDecision =
  | { status: "unchanged" }
  | { status: "stale"; errors: string[] }
  | { status: "error"; errors: string[] }
  | { status: "ready"; changes: FieldChange[]; plan: Extract<SellerEditPlan, { ok: true }> };

/**
 * What one row would do to `existing` (already confirmed to be this seller's
 * product). Order matters: a row equal to the product is "unchanged" (so
 * re-uploading an applied file is a no-op), then a product that changed since
 * export is "stale", then the shared edit rules decide.
 */
export function decideEditRow(
  existing: Record<string, unknown>,
  values: Partial<Record<BulkEditField, string | number>>,
  version: string
): EditDecision {
  const incoming: Record<string, unknown> = {};
  const changes: FieldChange[] = [];
  for (const f of BULK_EDIT_FIELDS) {
    if (values[f] === undefined) continue;
    if (JSON.stringify(existing[f]) === JSON.stringify(values[f])) continue;
    incoming[f] = values[f];
    changes.push({ field: f, from: existing[f] ?? null, to: values[f] });
  }
  if (changes.length === 0) return { status: "unchanged" };

  if (version !== productVersion(existing)) {
    return {
      status: "stale",
      errors: ["This product changed after you downloaded the file (for example, stock sold). Download your products again and re-apply this change."],
    };
  }

  // Stock-bearing variants own the stock; product.stock is their derived sum
  // (lib/products/inventory.ts, Strategy 1). It is never set directly.
  if ("stock" in incoming && hasStockBearingVariants(existing.variants)) {
    return { status: "error", errors: ["This product has variants — change its stock per variant with Edit."] };
  }

  const plan = planSellerProductEdit(existing, incoming);
  if (!plan.ok) return { status: "error", errors: plan.errors || [plan.error] };
  return { status: "ready", changes, plan };
}
