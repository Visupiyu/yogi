import { getAdminDb } from "@/lib/firebaseAdmin";
import { computeVendorEarningsBreakdown, computeVendorPayableBreakdown } from "@/lib/vendorPayable";
import { loadVendorPayableInputs } from "@/lib/vendorPayableServer";
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
    "Get a sales/earnings summary for the signed-in seller: booked orders, and settled (delivered + paid) gross sales, discount share, commission (always ₹0 — YOMICO charges no commission), delivery charges, return deductions and net earnings, plus the withdrawable balance when no day window is given. Use for 'how are my sales', 'how much did I earn' type questions.",
  parameters: {
    type: "object",
    properties: {
      days: { type: "number", description: "Limit to orders from the last N days. Omit for all-time." },
    },
  },
  execute: async (args, context) => {
    const db = getAdminDb();
    const inputs = await loadVendorPayableInputs(db, context.uid);

    const days = typeof args.days === "number" ? args.days : undefined;
    const cutoff = days ? Date.now() - days * 24 * 60 * 60 * 1000 : undefined;
    const inWindow = (order: Record<string, unknown>) => {
      if (cutoff === undefined) return true;
      const createdAtMs = (order.createdAt as { toDate?: () => Date } | undefined)?.toDate?.()?.getTime?.();
      return !!createdAtMs && createdAtMs >= cutoff;
    };
    const windowOrders = inputs.orders.filter((o) => inWindow(o as Record<string, unknown>));
    const windowOrderIds = new Set(windowOrders.map((o) => String(o.id || "")));

    // Booked activity: non-cancelled orders in the window carrying this seller's items.
    const totalOrders = windowOrders.filter(
      (o) =>
        o.status !== "Cancelled" &&
        Array.isArray(o.items) &&
        (o.items as { vendorId?: unknown }[]).some((i) => i?.vendorId === context.uid)
    ).length;

    // Money: lib/vendorPayable's shared breakdown — the same calculation as
    // the seller wallet / payout report (commission ₹0, the stored
    // sellerDeliveryCharge, returns) — over the window's orders.
    const earnings = computeVendorEarningsBreakdown({
      vendorUid: context.uid,
      orders: windowOrders,
      itemRequests: inputs.itemRequests.filter((ir) => windowOrderIds.has(String(ir?.orderId || ""))),
      legacyReturns: inputs.legacyReturns,
      sellerOrders: inputs.sellerOrders,
    });
    // Withdrawable balance is all-time by nature, so only reported without a window.
    const payable =
      cutoff === undefined ? computeVendorPayableBreakdown({ vendorUid: context.uid, ...inputs }) : null;

    return {
      totalOrders,
      settledOrders: earnings.eligibleOrders,
      grossSales: earnings.grossSales,
      sellerDiscountShare: earnings.discountShare,
      commission: earnings.commission,
      sellerDeliveryCharges: earnings.sellerDeliveryCharges,
      returnDeductions: earnings.returnDeductions,
      returnLogisticsCharges: earnings.returnLogisticsCharges,
      netEarnings: earnings.adjustedEarnings,
      ...(payable
        ? { withdrawableNow: payable.available, paidOut: payable.paidOut, reserved: payable.reserved }
        : {}),
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
