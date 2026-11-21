// ==========================================
// YOMICO Marketplace
// lib/products/rejectionNotice.ts
// ==========================================
//
// What a seller is TOLD when an admin rejects their product. It must match
// what the seller can actually do: app/api/seller/product-status only lets a
// seller whose vendors record (looked up by uid) is "Approved" resubmit, and
// app/seller/products shows the Resubmit button only to an Approved seller.
// A seller without such a record — none at all, Pending, Rejected, Blocked,
// or an identity the approval model refuses — cannot, so they are never
// promised resubmission. When the seller's standing cannot be established,
// the answer is "no" (fail closed).
//
// Dependency-free.

export type SellerNotice = { title: string; message: string };

/** The rejection notification. `sellerCanResubmit` must be true only when verified. */
export function rejectionNoticeFor(params: {
  title: string;
  reason: string | null;
  sellerCanResubmit: boolean;
}): SellerNotice {
  const reasonText = params.reason ? ` Reason: ${params.reason}` : "";
  if (params.sellerCanResubmit === true) {
    return {
      title: "Product rejected",
      message: `"${params.title}" was not approved.${reasonText} You can edit it and resubmit it for review.`,
    };
  }
  return {
    title: "Product rejected",
    message: `"${params.title}" was not approved and is hidden pending seller verification.${reasonText}`,
  };
}
