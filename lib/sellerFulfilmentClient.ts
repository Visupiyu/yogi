// Client-side entry point for advancing one line item.
//
// The seller no longer writes sellerOrders.itemFulfilment directly —
// firestore.rules refuses it. Advancing goes through
// app/api/seller/advance-item, which moves the item and recalculates the
// parent orders.status in one transaction. Routing it through here keeps the
// three seller surfaces (orders list, order detail, /seller/fulfilment) from
// growing three slightly different versions of the same call.
//
// Deliberately sends no status: the caller does not choose the next stage and
// cannot choose the parent's. The server derives both.

export type AdvanceItemResult = {
  ok: boolean;
  /** The item's new stage, when the call succeeded. */
  itemStatus?: string;
  /** The parent order's recalculated summary. */
  parentStatus?: string | null;
  allDelivered?: boolean;
  error?: string;
};

export async function requestItemAdvance(params: {
  idToken: string;
  recordId: string;
  itemKey: string;
}): Promise<AdvanceItemResult> {
  try {
    const response = await fetch("/api/seller/advance-item", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${params.idToken}`,
      },
      body: JSON.stringify({
        recordId: params.recordId,
        itemKey: params.itemKey,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return {
        ok: false,
        error: data?.error || "Could not update this product.",
      };
    }

    return {
      ok: true,
      itemStatus: data?.itemStatus,
      parentStatus: data?.parentStatus ?? null,
      allDelivered: data?.allDelivered === true,
    };
  } catch {
    return { ok: false, error: "Could not reach the server. Please retry." };
  }
}
