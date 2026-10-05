import { getAdminDb } from "@/lib/firebaseAdmin";
import {
  computeEarningsBreakdownByVendor,
  type VendorEarningsBreakdown,
} from "@/lib/vendorPayable";
import { loadVendorPayableBreakdown } from "@/lib/vendorPayableServer";
import { YOMICO_COMMISSION_AMOUNT, YOMICO_COMMISSION_RATE } from "@/lib/commissionPolicy";
import type { ToolDefinition } from "@/lib/ai/tools/types";

// These tools are only ever registered for a request whose verified
// identity has isAdmin === true (see app/api/ai/admin/chat/route.ts) —
// the context.isAdmin check inside each execute() is a defensive second
// gate, not the primary one.
function requireAdmin(context: { isAdmin: boolean }) {
  if (!context.isAdmin) {
    throw new Error("Not authorized for admin data.");
  }
}

const getAdminSalesSummary: ToolDefinition = {
  name: "getAdminSalesSummary",
  description: "Get a marketplace-wide sales and revenue summary across all vendors.",
  parameters: {
    type: "object",
    properties: {
      days: { type: "number", description: "Limit to orders from the last N days. Omit for all-time (capped at the 500 most recent orders)." },
    },
  },
  execute: async (args, context) => {
    requireAdmin(context);

    const db = getAdminDb();
    const snap = await db.collection("orders").limit(500).get();

    const days = typeof args.days === "number" ? args.days : undefined;
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;

    let totalOrders = 0;
    let totalRevenue = 0;
    let totalCommission = 0;
    const statusCounts: Record<string, number> = {};

    for (const doc of snap.docs) {
      const data = doc.data();

      if (cutoff !== undefined) {
        const createdAtMs = data.createdAt?.toDate?.()?.getTime?.();
        if (!createdAtMs || createdAtMs < cutoff) continue;
      }

      totalOrders += 1;
      totalRevenue += data.total || 0;
      // Always ₹0 (lib/commissionPolicy.ts) — never summed from legacy order fields.
      totalCommission += YOMICO_COMMISSION_AMOUNT;

      const status = data.status || "Unknown";
      statusCounts[status] = (statusCounts[status] || 0) + 1;
    }

    return {
      totalOrders,
      totalRevenue: Math.round(totalRevenue),
      totalCommission: Math.round(totalCommission),
      statusCounts,
    };
  },
};

const getVendorPerformance: ToolDefinition = {
  name: "getVendorPerformance",
  description:
    "Get settled sales performance (delivered + paid orders) for a specific vendor by their ID, or the top vendors marketplace-wide if no vendor ID is given: gross sales, discount share, commission (always ₹0), seller delivery charges, return deductions and net earnings.",
  parameters: {
    type: "object",
    properties: {
      vendorId: { type: "string", description: "Optional — a specific vendor's document/user ID." },
      limit: { type: "number", description: "How many top vendors to return when vendorId is omitted, default 5." },
    },
  },
  execute: async (args, context) => {
    requireAdmin(context);

    const db = getAdminDb();
    const vendorId = args.vendorId ? String(args.vendorId) : undefined;

    // Same shape for every vendor: lib/vendorPayable's shared breakdown
    // (commission ₹0, stored sellerDeliveryCharge, returns). Settled figures —
    // Delivered + Paid orders only.
    const summarize = (b: VendorEarningsBreakdown) => ({
      settledOrders: b.eligibleOrders,
      grossSales: b.grossSales,
      sellerDiscountShare: b.discountShare,
      // H3: YOMICO-funded coupon cost on this seller's items (not deducted).
      yomicoCouponShare: b.yomicoCouponShare,
      commission: b.commission,
      sellerDeliveryCharges: b.sellerDeliveryCharges,
      returnDeductions: b.returnDeductions,
      returnLogisticsCharges: b.returnLogisticsCharges,
      netEarnings: b.adjustedEarnings,
    });

    if (vendorId) {
      // Exactly the seller's own payable (same read set and calculation as
      // /api/seller/payable).
      const b = await loadVendorPayableBreakdown(db, vendorId);
      return { vendorId, ...summarize(b), payable: b.payable, withdrawableNow: b.available };
    }

    const [ordersSnap, sellerOrdersSnap, itemRequestsSnap, refundedReturnsSnap] = await Promise.all([
      db.collection("orders").limit(500).get(),
      db.collection("sellerOrders").get(),
      db.collection("itemRequests").get(),
      db.collection("returns").where("status", "==", "Refunded").get(),
    ]);
    const byVendor = computeEarningsBreakdownByVendor({
      orders: ordersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
      sellerOrders: sellerOrdersSnap.docs.map((d) => d.data()),
      itemRequests: itemRequestsSnap.docs.map((d) => d.data()),
      legacyReturns: refundedReturnsSnap.docs.map((d) => d.data()),
    });

    const limit = typeof args.limit === "number" ? Math.min(args.limit, 20) : 5;
    const ranked = Object.entries(byVendor)
      .map(([id, b]) => ({ vendorId: id, ...summarize(b) }))
      .sort((a, b) => b.grossSales - a.grossSales)
      .slice(0, limit);

    return { topVendors: ranked };
  },
};

const getCommissionSummary: ToolDefinition = {
  name: "getCommissionSummary",
  description: "Get total commission collected by the marketplace. YOMICO charges sellers 0% commission, so this is always ₹0; also returns how many orders the window covers.",
  parameters: {
    type: "object",
    properties: {
      days: { type: "number", description: "Limit to orders from the last N days. Omit for all-time (capped at the 500 most recent orders)." },
    },
  },
  execute: async (args, context) => {
    requireAdmin(context);

    const db = getAdminDb();
    const snap = await db.collection("orders").limit(500).get();

    const days = typeof args.days === "number" ? args.days : undefined;
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;

    let totalCommission = 0;
    let orderCount = 0;

    for (const doc of snap.docs) {
      const data = doc.data();

      if (cutoff !== undefined) {
        const createdAtMs = data.createdAt?.toDate?.()?.getTime?.();
        if (!createdAtMs || createdAtMs < cutoff) continue;
      }

      // Always ₹0 (lib/commissionPolicy.ts) — never summed from legacy order fields.
      totalCommission += YOMICO_COMMISSION_AMOUNT;
      orderCount += 1;
    }

    return { totalCommission: Math.round(totalCommission), commissionRate: YOMICO_COMMISSION_RATE, orderCount };
  },
};

const getLowStockProducts: ToolDefinition = {
  name: "getLowStockProducts",
  description: "Get products across the entire marketplace that are low on stock or out of stock.",
  parameters: {
    type: "object",
    properties: {
      threshold: { type: "number", description: "Stock count at or below which a product counts as low-stock, default 5." },
      limit: { type: "number", description: "Max results, default 20." },
    },
  },
  execute: async (args, context) => {
    requireAdmin(context);

    const threshold = typeof args.threshold === "number" ? args.threshold : 5;
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;

    const db = getAdminDb();
    const snap = await db.collection("products").limit(1000).get();

    const lowStock = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          title: data.title || data.name || "",
          vendorName: data.vendorName || "",
          stock: typeof data.stock === "number" ? data.stock : 0,
        };
      })
      .filter((p) => p.stock <= threshold)
      .sort((a, b) => a.stock - b.stock)
      .slice(0, limit);

    return { lowStockProducts: lowStock };
  },
};

export const adminTools: ToolDefinition[] = [
  getAdminSalesSummary,
  getVendorPerformance,
  getCommissionSummary,
  getLowStockProducts,
];
