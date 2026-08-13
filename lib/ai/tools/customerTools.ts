import { getAdminDb } from "@/lib/firebaseAdmin";
import type { ToolDefinition } from "@/lib/ai/tools/types";
import type { Query, DocumentData } from "firebase-admin/firestore";

function summarizeProduct(id: string, data: DocumentData) {
  return {
    id,
    title: data.title || data.name || "",
    price:
      typeof data.sellingPrice === "number"
        ? data.sellingPrice
        : Number(data.price || 0),
    mrp: data.mrp,
    stock: typeof data.stock === "number" ? data.stock : 0,
    category: data.categoryId || data.category || "",
    brand: data.brand || "",
    rating: typeof data.rating === "number" ? data.rating : 0,
    vendorName: data.vendorName || "",
  };
}

const searchProducts: ToolDefinition = {
  name: "searchProducts",
  description:
    "Search YOMICO's live product catalog by keyword and optional filters. Use this whenever the customer describes what they're looking for in their own words.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Keywords describing what the customer wants, e.g. 'wireless earbuds under 1000'.",
      },
      category: {
        type: "string",
        description: "Optional category to narrow the search to, if the customer mentioned one.",
      },
      maxPrice: {
        type: "number",
        description: "Optional maximum price in INR.",
      },
    },
    required: ["query"],
  },
  execute: async (args) => {
    const queryText = String(args.query || "").toLowerCase();
    const category = args.category ? String(args.category).toLowerCase() : "";
    const maxPrice = typeof args.maxPrice === "number" ? args.maxPrice : undefined;

    const db = getAdminDb();
    const snap = await db.collection("products").limit(400).get();

    const terms = queryText.split(/\s+/).filter(Boolean);

    const scored = snap.docs
      .map((doc) => ({ id: doc.id, data: doc.data() }))
      .filter(({ data }) => data.active !== false)
      .map(({ id, data }) => {
        const haystack = `${data.title || data.name || ""} ${data.description || ""} ${data.category || data.categoryId || ""} ${data.brand || ""}`.toLowerCase();
        const score = terms.reduce((s, term) => (haystack.includes(term) ? s + 1 : s), 0);
        return { id, data, score };
      })
      .filter(({ data, score }) => {
        if (score === 0) return false;
        if (category && !`${data.category || data.categoryId || ""}`.toLowerCase().includes(category)) return false;
        const price = typeof data.sellingPrice === "number" ? data.sellingPrice : Number(data.price || 0);
        if (maxPrice !== undefined && price > maxPrice) return false;
        return true;
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return {
      results: scored.map(({ id, data }) => summarizeProduct(id, data)),
    };
  },
};

const getProduct: ToolDefinition = {
  name: "getProduct",
  description: "Get full details for a single product by its product ID.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "string", description: "The product's document ID." },
    },
    required: ["productId"],
  },
  execute: async (args) => {
    const productId = String(args.productId || "");
    if (!productId) return { error: "productId is required" };

    const db = getAdminDb();
    const snap = await db.collection("products").doc(productId).get();

    if (!snap.exists) return { error: "Product not found" };

    const data = snap.data() as DocumentData;

    return {
      id: snap.id,
      title: data.title || data.name || "",
      description: data.description || "",
      price: typeof data.sellingPrice === "number" ? data.sellingPrice : Number(data.price || 0),
      mrp: data.mrp,
      stock: typeof data.stock === "number" ? data.stock : 0,
      category: data.categoryId || data.category || "",
      brand: data.brand || "",
      rating: typeof data.rating === "number" ? data.rating : 0,
      reviewCount: typeof data.reviewCount === "number" ? data.reviewCount : 0,
      vendorName: data.vendorName || "",
      specifications: data.specifications || {},
    };
  },
};

const getProductRecommendations: ToolDefinition = {
  name: "getProductRecommendations",
  description:
    "Get similar/recommended products for a given product ID or category — use for 'find something similar', 'compare products', or general recommendation requests.",
  parameters: {
    type: "object",
    properties: {
      productId: { type: "string", description: "Optional product ID to find similar items for." },
      category: { type: "string", description: "Optional category to browse instead." },
      limit: { type: "number", description: "How many results to return, default 6." },
    },
  },
  execute: async (args) => {
    const db = getAdminDb();
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 12) : 6;

    let category = args.category ? String(args.category) : "";
    let excludeId = "";

    if (args.productId) {
      excludeId = String(args.productId);
      const snap = await db.collection("products").doc(excludeId).get();
      if (snap.exists) {
        const data = snap.data() as DocumentData;
        category = data.categoryId || data.category || category;
      }
    }

    let q: Query = db.collection("products").where("active", "!=", false);
    if (category) {
      q = db.collection("products").where("categoryId", "==", category);
    }

    const snap = await q.limit(limit + 1).get();

    const results = snap.docs
      .filter((doc) => doc.id !== excludeId)
      .slice(0, limit)
      .map((doc) => summarizeProduct(doc.id, doc.data()));

    return { results };
  },
};

const getCustomerOrders: ToolDefinition = {
  name: "getCustomerOrders",
  description: "Get the signed-in customer's own recent orders. Never returns another customer's orders.",
  parameters: {
    type: "object",
    properties: {
      limit: { type: "number", description: "How many recent orders to return, default 10." },
    },
  },
  execute: async (args, context) => {
    const limit = typeof args.limit === "number" ? Math.min(args.limit, 25) : 10;

    const db = getAdminDb();
    const snap = await db
      .collection("orders")
      .where("userId", "==", context.uid)
      .limit(limit)
      .get();

    const orders = snap.docs
      .map((doc) => {
        const data = doc.data();
        return {
          id: doc.id,
          status: data.status || "",
          total: data.total || 0,
          itemCount: Array.isArray(data.items) ? data.items.length : 0,
          createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
        };
      })
      .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));

    return { orders };
  },
};

const getOrderStatus: ToolDefinition = {
  name: "getOrderStatus",
  description: "Get the status and details of one specific order belonging to the signed-in customer.",
  parameters: {
    type: "object",
    properties: {
      orderId: { type: "string", description: "The order's document ID." },
    },
    required: ["orderId"],
  },
  execute: async (args, context) => {
    const orderId = String(args.orderId || "");
    if (!orderId) return { error: "orderId is required" };

    const db = getAdminDb();
    const snap = await db.collection("orders").doc(orderId).get();

    if (!snap.exists) return { error: "Order not found" };

    const data = snap.data() as DocumentData;

    // Never confirm the existence of, or return details for, an order
    // that doesn't belong to this signed-in customer.
    if (data.userId !== context.uid) {
      return { error: "Order not found" };
    }

    return {
      id: snap.id,
      status: data.status || "",
      total: data.total || 0,
      items: (data.items || []).map((item: DocumentData) => ({
        name: item.name || item.title || "",
        qty: item.qty || 0,
        price: item.price || 0,
      })),
      createdAt: data.createdAt?.toDate?.()?.toISOString?.() || null,
      paymentMethod: data.paymentMethod || "",
    };
  },
};

export const customerTools: ToolDefinition[] = [
  searchProducts,
  getProduct,
  getProductRecommendations,
  getCustomerOrders,
  getOrderStatus,
];
