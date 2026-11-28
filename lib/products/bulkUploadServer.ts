// SERVER-ONLY (node:crypto). Bulk Product Upload helpers that do not belong in
// the browser-safe lib/products/bulkUpload.ts.
import crypto from "node:crypto";
import { normalizeSku } from "@/lib/products/bulkUpload";

/**
 * The product document id a bulk-uploaded SKU is created under: stable for
 * (seller, SKU) and opaque (neither appears in it). Creating it with a
 * create-only transaction is what makes a repeated upload of the same SKU a
 * no-op instead of a second product.
 */
export function bulkProductDocId(uid: string, sku: string): string {
  const hash = crypto.createHash("sha256").update(`${uid}\u0000${normalizeSku(sku)}`).digest("hex");
  return `bp_${hash.slice(0, 32)}`;
}
