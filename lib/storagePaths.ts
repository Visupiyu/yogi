// Owner-scoped Firebase Storage paths.
//
// Every upload used to land in a flat namespace — products/{timestamp}-{name},
// chat/{timestamp}-{name} and so on — which cannot express ownership. Because
// the exact object path is published inside each product's public download
// URL, any signed-in user could overwrite or delete another vendor's images
// with no discovery step at all (ST-2). The uid segment is what storage.rules
// matches `request.auth.uid == uid` against, so it is the whole mechanism.
//
// Centralised here rather than repeated at each call site: five files build
// these paths, and a single one drifting back to the flat namespace silently
// reopens the hole.

/**
 * Storage object names are matched one path segment at a time, so a "/" in a
 * user-supplied filename would push the object into a deeper path that the
 * `{fileName}` wildcard no longer matches — the write would be denied by the
 * catch-all. Anything outside a conservative set is replaced.
 */
function sanitizeFileName(original?: string): string {
  const name = (original || "file").trim();
  const cleaned = name.replace(/[^A-Za-z0-9._-]/g, "_").replace(/_{2,}/g, "_");
  // Keep the tail: extensions matter, very long prefixes do not.
  return cleaned.slice(-120) || "file";
}

/**
 * The previous scheme was `${Date.now()}-${file.name}` built inside a `for`
 * loop over the picked images. Date.now() has millisecond resolution, so two
 * files uploaded in the same tick produced the SAME object path and the second
 * silently overwrote the first. The random suffix removes that collision.
 */
export function uniqueFileName(original?: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${rand}-${sanitizeFileName(original)}`;
}

/** Guard so a signed-out session can never produce `products/undefined/...`. */
function assertUid(uid: string | null | undefined, context: string): string {
  if (!uid) {
    throw new Error(`Not signed in — cannot upload ${context}.`);
  }
  return uid;
}

export function productImagePath(uid: string | null | undefined, file: File): string {
  return `products/${assertUid(uid, "product image")}/${uniqueFileName(file?.name)}`;
}

export function vendorStorePath(uid: string | null | undefined, file: File): string {
  return `vendor-store/${assertUid(uid, "store image")}/${uniqueFileName(file?.name)}`;
}

export function chatImagePath(uid: string | null | undefined, file: File): string {
  return `chat/${assertUid(uid, "chat image")}/${uniqueFileName(file?.name)}`;
}

/**
 * Delivery proof keeps the order id — it was the only traceability the old
 * `delivery-proof/{orderId}-{timestamp}` path carried, and losing it would
 * make a proof photo impossible to tie back to its delivery. The uid now owns
 * the folder and the order id moves into the filename.
 */
export function deliveryProofPath(
  uid: string | null | undefined,
  orderId: string,
  file: File
): string {
  const safeOrderId = sanitizeFileName(orderId);
  return `delivery-proof/${assertUid(uid, "delivery proof")}/${safeOrderId}-${uniqueFileName(
    file?.name
  )}`;
}
