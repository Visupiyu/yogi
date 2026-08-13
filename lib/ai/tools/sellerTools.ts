import { getAdminDb } from "@/lib/firebaseAdmin";
import { computeVendorShare } from "@/lib/vendorEarnings";
import type { ToolDefinition } from "@/lib/ai/tools/types";
import type { DocumentData } from "firebase-admin/firestore";

// context.uid doubles as the vendor's document ID throughout this
// codebase (see app/seller/page.tsx's useVendor() hook) — every tool
// here scopes to context.uid directly rather than trusting any
// vendorId the model or client might pass in.

const getSellerProducts: ToolDefinition = {
  name: "getSellerProducts",
  description: "Get the signed-in seller's own product listings.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", description: "How many products to return, default 20." },
    },
  },
  execute: async (args, context) => {
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 50) : 20;

    const db = getAdminDb();
    const snap = await db
      .collection("products")
      .where("vendorId", "==", context.uid)
      .limit(limit)
      .get();

    const products = snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        title: data.title || data.name || "",
        price: typeof data.sellingPrice === "number" ? data.sellingPrice : Number(data.price || 0),
        stock: typeof data.stock === "number" ? data.stock : 0,
        active: data.active !== false,
        rating: typeof data.rating === "number" ? data.rating : 0,
      };
    });

    return { products };
  },
};

const getSellerSales: ToolDefinition = {
  name: "getSellerSales",
  description:
    "Get a sales/earnings summary for the signed-in seller across their own orders — total orders, revenue, commission, and net earnings. Use for 'how are my sales', 'how much did I earn' type questions.",
  parameters: {
    type: "object",
    properties: {
      days: { type: "number", description: "Limit to orders from the last N days. Omit for all-time." },
    },
  },
  execute: async (args, context) => {
    const db = getAdminDb();
    const snap = await db
      .collection("orders")
      .where("vendorIds", "array-contains", context.uid)
      .limit(500)
      .get();

    const days = typeof args.days === "number" ? args.days : undefined;
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;

    let totalOrders = 0;
    let totalRevenue = 0;
    let totalCommission = 0;
    let totalEarning = 0;

    for (const doc of snap.docs) {
      const data = doc.data();

      if (cutoff !== undefined) {
        const createdAtMs = data.createdAt?.toDate?.()?.getTime?.();
        if (!createdAtMs || createdAtMs < cutoff) continue;
      }

      const share = computeVendorShare(data, context.uid);
      if (!share) continue;

      totalOrders += 1;
      totalRevenue += share.vendorNetSubtotal;
      totalCommission += share.vendorCommission;
      totalEarning += share.vendorEarning;
    }

    return {
      totalOrders,
      totalRevenue: Math.round(totalRevenue),
      totalCommission: Math.round(totalCommission),
      totalEarning: Math.round(totalEarning),
    };
  },
};

const getSellerInventory: ToolDefinition = {
  name: "getSellerInventory",
  description: "Get the signed-in seller's low-stock or out-of-stock products, to flag restocking needs.",
  parameters: {
    type: "object",
    properties: {
      threshold: { type: "number", description: "Stock count at or below which a product counts as low-stock, default 5." },
    },
  },
  execute: async (args, context) => {
    const threshold = typeof args.threshold === "number" ? args.threshold : 5;

    const db = getAdminDb();
    const snap = await db
      .collection("products")
      .where("vendorId", "==", context.uid)
      .limit(200)
      .get();

    const lowStock = snap.docs
      .map((doc) => {
        const data = doc.data() as DocumentData;
        return {
          id: doc.id,
          title: data.title || data.name || "",
          stock: typeof data.stock === "number" ? data.stock : 0,
        };
      })
      .filter((p) => p.stock <= threshold)
      .sort((a, b) => a.stock - b.stock);

    return { lowStockProducts: lowStock };
  },
};

export const sellerTools: ToolDefinition[] = [
  getSellerProducts,
  getSellerSales,
  getSellerInventory,
];
