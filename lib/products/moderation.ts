// ==========================================
// YOMICO Marketplace
// lib/products/moderation.ts
// ==========================================
//
// Pure admin moderation transitions for a product. The admin route
// (app/api/admin/products/[id]/moderation) reads the product, asks this
// module what the action should change, and writes exactly those fields plus
// moderatedAt/moderatedBy. Dependency-free so it can be unit-tested.
//
//   approve  pending | rejected         -> approved, visible
//   reject   pending | live | blocked   -> rejected, hidden, reason stored
//   block    live                       -> approved, hidden (active:false)
//   unblock  blocked                    -> approved, visible
//
// Anything else is refused, so e.g. "block" can never be used to approve a
// product that was never reviewed, and "unblock" can never publish a
// pending or rejected one.

import { productModerationStatus, type ModerationStatus } from "@/lib/products/visibility";

export const MODERATION_ACTIONS = ["approve", "reject", "block", "unblock"] as const;
export type ModerationAction = (typeof MODERATION_ACTIONS)[number];

export const MAX_REJECTION_REASON_LENGTH = 500;

export type ModerationChanges = {
  approvalStatus: "approved" | "rejected";
  approved: boolean;
  active: boolean;
  rejectionReason: string | null;
};

export type ModerationPlan =
  | { ok: true; from: ModerationStatus; changes: ModerationChanges }
  | { ok: false; status: number; error: string };

const ALLOWED_FROM: Record<ModerationAction, ModerationStatus[]> = {
  approve: ["pending", "rejected"],
  reject: ["pending", "live", "blocked"],
  block: ["live"],
  unblock: ["blocked"],
};

export function isModerationAction(value: unknown): value is ModerationAction {
  return typeof value === "string" && (MODERATION_ACTIONS as readonly string[]).includes(value);
}

export function planModeration(
  product: { active?: unknown; approvalStatus?: unknown },
  action: unknown,
  reason?: unknown
): ModerationPlan {
  if (!isModerationAction(action)) {
    return { ok: false, status: 400, error: "Invalid moderation action." };
  }

  const from = productModerationStatus(product);

  if (!ALLOWED_FROM[action].includes(from)) {
    return {
      ok: false,
      status: 409,
      error: `Cannot ${action} a product that is ${from}.`,
    };
  }

  switch (action) {
    case "approve":
      return {
        ok: true,
        from,
        changes: { approvalStatus: "approved", approved: true, active: true, rejectionReason: null },
      };
    case "reject": {
      const text = typeof reason === "string" ? reason.trim() : "";
      if (!text) {
        return { ok: false, status: 400, error: "A rejection reason is required." };
      }
      if (text.length > MAX_REJECTION_REASON_LENGTH) {
        return {
          ok: false,
          status: 400,
          error: `Rejection reason must be at most ${MAX_REJECTION_REASON_LENGTH} characters.`,
        };
      }
      return {
        ok: true,
        from,
        changes: { approvalStatus: "rejected", approved: false, active: false, rejectionReason: text },
      };
    }
    case "block":
      return {
        ok: true,
        from,
        changes: { approvalStatus: "approved", approved: true, active: false, rejectionReason: null },
      };
    case "unblock":
      return {
        ok: true,
        from,
        changes: { approvalStatus: "approved", approved: true, active: true, rejectionReason: null },
      };
  }
}
