// Item-level fulfilment — the source of truth for fulfilment progress.
//
// From Confirmed onwards each ordered LINE ITEM advances independently:
// Confirmed -> Packed -> Shipped -> Out For Delivery -> Delivered. One product
// being packed says nothing about the seller's other products.
//
// Stored as a MAP keyed by itemKey, not as status fields inside the items
// array, for one concrete reason: firestore.rules can diff a map and prove
// that exactly one key changed (`.diff().affectedKeys().hasOnly([key])`), but
// it cannot validate a mutation of one element of an array — a seller could
// rewrite the whole array in a single write. The map is what makes per-item
// isolation enforceable rather than merely intended.
//
// The seller-level and order-level statuses are DERIVED from this map on
// read (see deriveFulfilmentStage). They are summaries for dashboards and
// never a second place where progress lives.

export const ITEM_FULFILMENT_STAGES = [
  "Confirmed",
  "Packed",
  "Shipped",
  "Out For Delivery",
  "Delivered",
] as const;

export type ItemFulfilmentStage = (typeof ITEM_FULFILMENT_STAGES)[number];

export type ItemFulfilmentEntry = {
  status: string;
  updatedAt?: unknown;
  deliveredAt?: unknown;
};

export type ItemFulfilmentMap = Record<string, ItemFulfilmentEntry>;

/**
 * Stable per-line key.
 *
 * The index is part of it because one product can legitimately appear twice
 * on an order in two variants, and both lines must progress independently.
 * The items array is immutable once the record is created (firestore.rules
 * pins it), so an index can never drift.
 */
export function itemKeyFor(index: number, productId: unknown): string {
  const id =
    typeof productId === "string" && productId ? productId : "unknown";

  return `i${index}_${id}`;
}

/** Forward one step only. No skipping, no reversing, no cancelling. */
export function isLegalItemTransition(from: string, to: string): boolean {
  const stages = ITEM_FULFILMENT_STAGES as readonly string[];
  const fromIndex = stages.indexOf(from);
  const toIndex = stages.indexOf(to);

  if (fromIndex < 0 || toIndex < 0) return false;

  return toIndex === fromIndex + 1;
}

/** The next stage a given item may move to, or null at the end of the chain. */
export function nextItemStage(from: string): ItemFulfilmentStage | null {
  const stages = ITEM_FULFILMENT_STAGES;
  const index = (stages as readonly string[]).indexOf(from);

  if (index < 0 || index >= stages.length - 1) return null;

  return stages[index + 1];
}

function stageIndex(status: unknown): number {
  const stages = ITEM_FULFILMENT_STAGES as readonly string[];
  return typeof status === "string" ? stages.indexOf(status) : -1;
}

/**
 * The summary stage for a set of items: the LEAST advanced one.
 *
 * A seller order is only "Shipped" when everything in it has shipped —
 * reporting the most advanced item would tell an admin the order is further
 * along than it is. Returns null when there is nothing to summarise.
 */
export function deriveFulfilmentStage(
  map: ItemFulfilmentMap | null | undefined
): ItemFulfilmentStage | null {
  const entries = Object.values(map || {});
  if (entries.length === 0) return null;

  let lowest = ITEM_FULFILMENT_STAGES.length - 1;

  for (const entry of entries) {
    const index = stageIndex(entry?.status);
    // An unrecognised status is treated as not-yet-started rather than
    // silently ignored, so a corrupt entry cannot inflate the summary.
    if (index < 0) return ITEM_FULFILMENT_STAGES[0];
    if (index < lowest) lowest = index;
  }

  return ITEM_FULFILMENT_STAGES[lowest];
}

/** How many items sit at each stage — for the dashboard summaries. */
export function stageCounts(
  map: ItemFulfilmentMap | null | undefined
): Record<string, number> {
  const counts: Record<string, number> = {};

  for (const entry of Object.values(map || {})) {
    const status = typeof entry?.status === "string" ? entry.status : "Unknown";
    counts[status] = (counts[status] || 0) + 1;
  }

  return counts;
}

export function allItemsDelivered(
  map: ItemFulfilmentMap | null | undefined
): boolean {
  const entries = Object.values(map || {});
  return entries.length > 0 && entries.every((e) => e?.status === "Delivered");
}

/**
 * The write that advances ONE item, in the exact shape firestore.rules
 * validates. Shared by every seller surface so the list, the detail page and
 * /seller/fulfilment cannot drift into three slightly different payloads.
 *
 * The whole map goes back with a single key changed: the rule rejects a write
 * whose diff touches anything else, and omitting the other entries would read
 * as deleting them. `itemUpdateKey` names the changed key because rules cannot
 * index into a set — a mis-stated key simply fails the diff check.
 *
 * `serverTs` is passed in rather than imported so this stays free of any
 * Firestore dependency; callers hand it `serverTimestamp()`.
 */
export function buildItemAdvancePayload(
  map: ItemFulfilmentMap | null | undefined,
  itemKey: string,
  serverTs: unknown
): Record<string, unknown> | null {
  const current = map?.[itemKey]?.status;
  const next = nextItemStage(String(current));

  if (!next) return null;

  return {
    itemFulfilment: {
      ...(map || {}),
      [itemKey]: {
        status: next,
        updatedAt: serverTs,
        // Per-item completion time, only on the move into Delivered. The rule
        // accepts it only when it equals request.time.
        ...(next === "Delivered" ? { deliveredAt: serverTs } : {}),
      },
    },
    itemUpdateKey: itemKey,
    updatedAt: serverTs,
  };
}

/**
 * Should this stage render as complete (green) for an item at `current`?
 *
 * Confirmed is deliberately never green: it is the admin's action, and at
 * that point the seller has packed nothing. Packed is the first stage that
 * represents work the seller actually did, so it is the first to light up.
 *
 * Both indexes come from the same array — the earlier order-wide version of
 * this compared positions across two different arrays and lit Packed up
 * while the order was merely Confirmed.
 */
export function isStageComplete(
  step: string,
  current: string | null | undefined
): boolean {
  const stages = ITEM_FULFILMENT_STAGES as readonly string[];

  const stepIdx = stages.indexOf(step);
  const currentIdx = stages.indexOf(current || "");
  const firstGreen = stages.indexOf("Packed");

  if (stepIdx < 0 || currentIdx < 0) return false;
  if (stepIdx < firstGreen) return false;

  return stepIdx <= currentIdx;
}

/**
 * The parent order's stage: the least advanced item across EVERY seller on
 * the order.
 *
 * Product A Delivered, B Packed, C Shipped => Packed. The order is only as
 * far along as its slowest line, so the parent can never claim to be ahead of
 * any item, and can only read Delivered when every item is Delivered.
 *
 * Keys are namespaced per record before merging because two sellers on one
 * order can legitimately use the same itemKey (each record numbers its own
 * lines from zero) — without this, one seller's entry would silently shadow
 * another's and the roll-up would ignore it.
 */
export function deriveStageAcross(
  maps: (ItemFulfilmentMap | null | undefined)[]
): ItemFulfilmentStage | null {
  const merged: ItemFulfilmentMap = {};

  maps.forEach((map, index) => {
    for (const [key, entry] of Object.entries(map || {})) {
      merged[`${index}:${key}`] = entry;
    }
  });

  return deriveFulfilmentStage(merged);
}

// --- display terminology -----------------------------------------------------
//
// The stored stage values are unchanged — Firestore, the rules, the API and
// every test still speak "Shipped" / "Out For Delivery" / "Delivered". Only
// what a human reads is different, and it is mapped in exactly one place so a
// button, a badge and a progress strip can never disagree.

export const FULFILMENT_STAGE_LABELS: Record<string, string> = {
  Confirmed: "Confirmed",
  Packed: "Accept",
  Shipped: "Ready for Delivery",
  "Out For Delivery": "Handed Over to Courier",
  Delivered: "Final Delivery",
};

/**
 * What to show a human for a stored stage.
 *
 * Falls back to the raw value so an unmapped status (a legacy one, or
 * "Cancelled") still renders as itself rather than blank.
 */
export function fulfilmentStageLabel(
  stage: string | null | undefined
): string {
  if (!stage) return "—";
  return FULFILMENT_STAGE_LABELS[stage] ?? stage;
}

/**
 * The seller-facing ACTION wording for the button that advances an item TO a
 * given target stage. Separate from FULFILMENT_STAGE_LABELS (which names a
 * stage as a noun for a badge) because an action reads differently from a
 * badge: the badge for `Packed` is "Accept", but the button that reaches it
 * is "MARK ACCEPT"; and the button that reaches `Delivered` is "Complete 🟢",
 * not "Mark Final Delivery".
 *
 * These are display strings only — the stored stage values are unchanged.
 */
export const FULFILMENT_ACTION_LABELS: Record<string, string> = {
  Packed: "MARK ACCEPT",
  Shipped: "Mark Ready for Delivery",
  "Out For Delivery": "Mark Handed Over to Courier",
  Delivered: "Complete 🟢",
};

/**
 * What the advance button reads for a target stage. Falls back to
 * `Mark <label>` so an unmapped target still produces sensible wording, and
 * returns "" when there is no next stage (the caller shows its own terminal
 * state instead of a button).
 */
export function fulfilmentActionLabel(
  next: string | null | undefined
): string {
  if (!next) return "";
  return FULFILMENT_ACTION_LABELS[next] ?? `Mark ${fulfilmentStageLabel(next)}`;
}

/**
 * Terminal outcomes that are NOT part of the forward chain and should read as
 * red wherever they appear.
 *
 * "Returned" is listed for display only. It is deliberately NOT a member of
 * ITEM_FULFILMENT_STAGES and no transition leads to it — the return workflow
 * lives in its own collection and no rule here creates or advances one. This
 * exists so that if a returned outcome is surfaced later, the terminology and
 * colour are already single-sourced rather than invented at the call site.
 */
export function isTerminalNegative(status: string | null | undefined): boolean {
  return status === "Returned" || status === "Cancelled";
}
