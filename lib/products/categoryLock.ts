// Category lock for approved products.
//
// A product's category decides how it is classified today and, later, which
// category commission applies to it — so once a product has been approved it
// must not be possible for its seller to move it to a different category.
//
// Only an EXPLICITLY pending or rejected product may still change category.
// Everything else is locked: "approved" (live or blocked), a legacy product
// with no approvalStatus at all (live under lib/products/visibility.ts's
// isApprovedForSale), and any unknown value (fail closed). Admins are not
// subject to this — it is enforced only on seller write paths.
//
// firestore.rules applies the same rule to direct SDK writes (products owner
// update branch); keep the two in step.

export const PRODUCT_CATEGORY_FIELDS = [
  "categoryId",
  "subCategoryId",
  "leafCategoryId",
] as const;

const EDITABLE_APPROVAL_STATUSES = new Set(["pending", "rejected"]);

/** Whether this product's category fields are locked against seller edits. */
export function isCategoryLocked(product: { approvalStatus?: unknown } | null | undefined): boolean {
  const status = product?.approvalStatus;
  return !(typeof status === "string" && EDITABLE_APPROVAL_STATUSES.has(status));
}

// Absent, null and "" are the SAME "no category" value. The seller product
// form fills missing fields from its defaults ({ subCategoryId: "", ... }), so
// a product stored without a category field is re-sent with "" on every save —
// that is not a category change and must not block the rest of the edit.
function normalizedCategory(value: unknown): string {
  return value === undefined || value === null ? "" : JSON.stringify(value);
}
const EMPTY = JSON.stringify("");

/**
 * The category fields a seller update would really change on a locked product
 * — empty when the product is not locked or no category field changes.
 */
export function changedLockedCategoryFields(
  existing: Record<string, unknown> | null | undefined,
  changes: Record<string, unknown>
): string[] {
  if (!isCategoryLocked(existing)) return [];
  return PRODUCT_CATEGORY_FIELDS.filter((field) => {
    if (!(field in changes)) return false;
    const before = normalizedCategory(existing?.[field]);
    const after = normalizedCategory(changes[field]);
    const same = before === after || ((before === "" || before === EMPTY) && (after === "" || after === EMPTY));
    return !same;
  });
}
