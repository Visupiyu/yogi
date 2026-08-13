import { getAdminDb } from "@/lib/firebaseAdmin";
import { computeVendorShare } from "@/lib/vendorEarnings";
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
      totalCommission += data.commission || 0;

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
    "Get sales performance for a specific vendor by their ID, or the top-performing vendors marketplace-wide if no vendor ID is given.",
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

    const ordersSnap = vendorId
      ? await db.collection("orders").where("vendorIds", "array-contains", vendorId).limit(500).get()
      : await db.collection("orders").limit(500).get();

    const perVendor = new Map<string, { orders: number; revenue: number; commission: number; earning: number }>();

    for (const doc of ordersSnap.docs) {
      const data = doc.data();
      const vendorIds: string[] = Array.isArray(data.vendorIds) ? data.vendorIds : [];

      for (const vId of vendorIds) {
        const share = computeVendorShare(data, vId);
        if (!share) continue;

        const existing = perVendor.get(vId) || { orders: 0, revenue: 0, commission: 0, earning: 0 };
        existing.orders += 1;
        existing.revenue += share.vendorNetSubtotal;
        existing.commission += share.vendorCommission;
        existing.earning += share.vendorEarning;
        perVendor.set(vId, existing);
      }
    }

    if (vendorId) {
      const stats = perVendor.get(vendorId);
      if (!stats) return { vendorId, orders: 0, revenue: 0, commission: 0, earning: 0 };
      return {
        vendorId,
        orders: stats.orders,
        revenue: Math.round(stats.revenue),
        commission: Math.round(stats.commission),
        earning: Math.round(stats.earning),
      };
    }

    const limit = typeof args.limit === "number" ? Math.min(args.limit, 20) : 5;
    const ranked = Array.from(perVendor.entries())
      .map(([id, stats]) => ({
        vendorId: id,
        orders: stats.orders,
        revenue: Math.round(stats.revenue),
        commission: Math.round(stats.commission),
        earning: Math.round(stats.earning),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit);

    return { topVendors: ranked };
  },
};

const getCommissionSummary: ToolDefinition = {
  name: "getCommissionSummary",
  description: "Get total commission collected by the marketplace across all orders, optionally over a recent time window.",
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

      totalCommission += data.commission || 0;
      orderCount += 1;
    }

    return { totalCommission: Math.round(totalCommission), orderCount };
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
