"use client";

import { useEffect, useState } from "react";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { productModerationStatus, type ModerationStatus } from "@/lib/products/visibility";
import type { ModerationAction } from "@/lib/products/moderation";
import { toast } from "sonner";
import ProductImage from "@/components/ProductImage";

type Product = {
  id: string;
  name: string;
  image: string;
  category: string;
  vendorName: string;
  price: number;
  stock: number;
  sales: number;
  status?: string;
  moderation: ModerationStatus;
  rejectionReason?: string | null;
  featured?: boolean;
  /** Display only — never an identifier. The document id is the identity. */
  productNumber?: string | null;
};

// ---------------------------------------------------------------------------
// Exact-identity safety. The Firestore document id is the ONLY identity an
// admin confirms against: names, vendor names and product numbers are
// seller-written or optional and can collide. Risky actions require typing
// the last characters of the exact id of the card the button belongs to.
// ---------------------------------------------------------------------------

/** Suggested wording for unverified legacy listings — shown as help text, never pre-filled. */
const NEUTRAL_REJECTION_REASON =
  "This listing could not be linked to an approved seller account and is hidden pending verification.";

const CONFIRM_CODE_LENGTH = 6;

/** The confirmation code for a document id: its last 6 characters (the whole id if shorter). */
function confirmationCodeFor(id: string): string {
  return id.length <= CONFIRM_CODE_LENGTH ? id : id.slice(-CONFIRM_CODE_LENGTH);
}

/**
 * Untrusted text (a product name) shown inside a confirmation dialog: control
 * characters and line breaks are flattened so a crafted name cannot fake an
 * extra "Document ID:" line, and it is length-capped.
 */
function dialogSafe(text: string): string {
  const flat = String(text).replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").trim();
  return flat.length > 80 ? `${flat.slice(0, 80)}…` : flat;
}

/** Document ids normally use only these characters. */
const ORDINARY_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function hasUnusualIdChars(id: string): boolean {
  return !ORDINARY_ID_PATTERN.test(id);
}

/**
 * DISPLAY ONLY: every character outside [A-Za-z0-9_-] as \u{hex}, so
 * invisible, look-alike or direction-control characters become visible.
 * Never used for targeting, requests or confirmation checks — those always
 * use the raw product.id.
 */
function visibleIdForm(id: string): string {
  return Array.from(id)
    .map((ch) => (/^[A-Za-z0-9_-]$/.test(ch) ? ch : `\\u{${ch.codePointAt(0)!.toString(16)}}`))
    .join("");
}

/** A search term that should be treated as a document id, never as name/vendor text. */
function looksLikeDocumentId(term: string): boolean {
  return term.length >= 15 && !/\s/.test(term);
}

function identityBlock(product: Product, actionLabel: string, note?: string): string {
  return [
    `ACTION: ${actionLabel}`,
    "",
    `Document ID: ${product.id}`,
    ...(hasUnusualIdChars(product.id)
      ? [
          "⚠ WARNING: this document ID contains unusual characters (outside A–Z a–z 0–9 _ -).",
          `Escaped form: ${visibleIdForm(product.id)}`,
        ]
      : []),
    `Current status: ${product.status ?? product.moderation}`,
    `Name (for reference only — not an identifier): ${dialogSafe(product.name)}`,
    ...(note ? ["", note] : []),
  ].join("\n");
}

/**
 * Typed-code confirmation: the admin must type the last 6 characters of THIS
 * card's exact document id (case-sensitive). Anything else aborts.
 */
function confirmWithIdCode(product: Product, actionLabel: string, note?: string): boolean {
  const code = confirmationCodeFor(product.id);
  const typed = window.prompt(
    `${identityBlock(product, actionLabel, note)}\n\nType the last ${code.length} characters of the document ID to confirm:`
  );
  if (typed === null) return false;
  if (typed.trim() !== code) {
    toast.error("Confirmation code does not match this product's document ID. Nothing was changed.");
    return false;
  }
  return true;
}

/** Simple confirmation that still shows the exact document id. */
function confirmWithId(product: Product, actionLabel: string): boolean {
  return window.confirm(`${identityBlock(product, actionLabel)}\n\nProceed?`);
}

// Labels for the moderation state from lib/products/visibility.ts. "Active"
// is kept as the label for live products so the existing stats/CSV read the
// same as before.
const STATUS_LABEL: Record<ModerationStatus, string> = {
  live: "Active",
  pending: "Pending",
  rejected: "Rejected",
  blocked: "Blocked",
  archived: "Archived",
};

const STATUS_BADGE_CLASS: Record<ModerationStatus, string> = {
  live: "bg-green-100 text-green-700",
  pending: "bg-yellow-100 text-yellow-700",
  rejected: "bg-red-100 text-red-700",
  blocked: "bg-gray-200 text-gray-700",
  archived: "bg-slate-100 text-slate-600",
};

const MODERATION_TOAST: Record<ModerationAction, string> = {
  approve: "Product approved and live.",
  reject: "Product rejected.",
  block: "Product blocked.",
  unblock: "Product unblocked.",
};

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [vendorFilter, setVendorFilter] = useState("All");
  const [statusFilter, setStatusFilter] = useState("All");
  

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    try {
      const snapshot = await getDocs(
        query(collection(db, "products"), orderBy("createdAt", "desc"))
      );
      const items: Product[] = [];
      snapshot.forEach((docSnap) => {
        const data: any = docSnap.data();
        items.push({
          id: docSnap.id,
          name: data.title || data.name || "Product",
          image:
            data.thumbnail ||
            (Array.isArray(data.images) ? data.images[0] : "") ||
            data.image ||
            "",
          category: data.categoryId || data.category || "Others",
          vendorName: data.vendorName || "Unknown",
          price: typeof data.sellingPrice === "number" ? data.sellingPrice : data.price || 0,
          stock: data.stock || 0,
          sales: data.sales || 0,
          // Moderation state from the shared publication rule
          // (lib/products/visibility.ts): pending / rejected / blocked / live.
          moderation: productModerationStatus(data),
          status: STATUS_LABEL[productModerationStatus(data)],
          rejectionReason:
            typeof data.rejectionReason === "string" ? data.rejectionReason : null,
          featured: data.featured === true,
          productNumber: typeof data.productNumber === "string" && data.productNumber ? data.productNumber : null,
        });
      });
      setProducts(items);
    } catch (error) {
      console.error(error);
      toast.error("Couldn't load this page's data. Please check your connection and refresh to try again.");
    } finally {
      setLoading(false);
    }
  };

  // Approve / reject / block / unblock go through the server moderation
  // route (app/api/admin/products/[id]/moderation), which checks the admin,
  // validates the transition and stamps moderatedAt/moderatedBy. The browser
  // no longer writes approval or visibility fields directly.
  const moderate = async (product: Product, action: ModerationAction) => {
    // Exact-identity confirmation first, tied to THIS card's document id.
    if (action === "reject") {
      if (!confirmWithIdCode(product, "REJECT")) return;
    } else if (action === "block") {
      if (
        !confirmWithIdCode(
          product,
          "BLOCK",
          "Block takes the product off sale and records it as approved-but-blocked. To hide an unverified listing, use REJECT instead."
        )
      ) {
        return;
      }
    } else if (action === "approve") {
      if (!confirmWithId(product, "APPROVE (product goes live)")) return;
    } else if (action === "unblock") {
      if (!confirmWithId(product, "UNBLOCK (product goes back on sale)")) return;
    }

    let reason: string | undefined;
    if (action === "reject") {
      // Empty by default: the admin must type the reason. The neutral wording
      // is only a suggestion for unverified legacy listings (M2).
      const input = window.prompt(
        `Rejection reason for document ID ${product.id} (stored on the product and shown to the seller). Type a reason:\n\nSuggested wording ONLY for an unverified legacy listing:\n"${NEUTRAL_REJECTION_REASON}"`
      );
      if (input === null) return;
      reason = input.trim();
      if (!reason) {
        toast.error("A rejection reason is required.");
        return;
      }
    }

    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in again.");
        return;
      }
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(product.id)}/moderation`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action, ...(reason ? { reason } : {}) }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error || "Failed to update product.");
        return;
      }
      toast.success(MODERATION_TOAST[action]);
      loadProducts();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update product.");
    }
  };

  // Featured and delete go through /api/admin/products/[id]/manage (admin
  // verified on the server, audit-logged). The homepage's "Featured
  // Products" section filters on `featured`. Delete is refused by the server
  // for a product with sales history — block it instead.
  const manage = async (product: Product, action: "feature" | "unfeature" | "delete") => {
    try {
      const user = auth.currentUser;
      if (!user) {
        toast.error("Please sign in again.");
        return;
      }
      const token = await user.getIdToken();
      const response = await fetch(
        `/api/admin/products/${encodeURIComponent(product.id)}/manage`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ action }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        toast.error(data?.error || "Failed to update product.");
        return;
      }
      toast.success(
        action === "delete"
          ? "Product deleted."
          : action === "feature"
          ? "Marked as Featured."
          : "Removed from Featured."
      );
      loadProducts();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update product.");
    }
  };

  const toggleFeatured = (product: Product) =>
    manage(product, product.featured ? "unfeature" : "feature");

  const deleteProduct = (product: Product) => {
    if (
      !confirmWithIdCode(
        product,
        "DELETE PERMANENTLY",
        "This permanently deletes the product document and cannot be undone. (The server still refuses to delete a product with sales history.)"
      )
    ) {
      return;
    }
    void manage(product, "delete");
  };

  const copyId = async (product: Product) => {
    try {
      await navigator.clipboard.writeText(product.id);
      toast.success("Document ID copied.");
    } catch {
      toast.error("Couldn't copy — select the ID text and copy it manually.");
    }
  };

  // Exact document-id search: when the trimmed search text IS a document id,
  // only that product matches (names / vendor names are not consulted). An
  // id-LIKE term (no whitespace, 15+ chars) that matches no id never falls
  // back to name/vendor matching (L1), so a product NAMED like an id cannot
  // stand in for it.
  const searchTerm = search.trim();
  const exactIdMatch = searchTerm !== "" && products.some((p) => p.id === searchTerm);
  const idLikeWithoutMatch = !exactIdMatch && looksLikeDocumentId(searchTerm);

  const filtered = products.filter((item) => {
    const searchMatch = exactIdMatch
      ? item.id === searchTerm
      : idLikeWithoutMatch
      ? false
      : item.name.toLowerCase().includes(search.toLowerCase()) ||
        item.vendorName.toLowerCase().includes(search.toLowerCase());
    const categoryMatch =
      categoryFilter === "All" || item.category === categoryFilter;
    const vendorMatch =
      vendorFilter === "All" || item.vendorName === vendorFilter;
    const statusMatch =
      statusFilter === "All" || item.status === statusFilter;
    return searchMatch && categoryMatch && vendorMatch && statusMatch;
  });

  // M1: the exact-match message must agree with what is actually listed.
  const exactIdShown = exactIdMatch && filtered.some((p) => p.id === searchTerm);
  const exactIdHiddenByFilters = exactIdMatch && !exactIdShown;
  const searchNotice: { tone: "ok" | "warn"; text: string } | null = exactIdShown
    ? { tone: "ok", text: "Exact document-ID match — showing only that product." }
    : exactIdHiddenByFilters
    ? {
        tone: "warn",
        text: "A product with this exact document ID exists but is hidden by the active category / vendor / status filters. Reset the filters to All to see it.",
      }
    : idLikeWithoutMatch
    ? { tone: "warn", text: "No product with this document ID." }
    : null;
  const emptyMessage = exactIdHiddenByFilters
    ? "The exact document-ID match is hidden by the active filters."
    : idLikeWithoutMatch
    ? "No product with this document ID."
    : "No products found.";

  const totalProducts = products.length;
  const activeProducts = products.filter((p) => p.status === "Active").length;
  const pendingProducts = products.filter((p) => p.moderation === "pending").length;
  const outOfStock = products.filter((p) => p.stock <= 0).length;
  const lowStock = products.filter((p) => p.stock > 0 && p.stock <= 5).length;

  const categories = ["All", ...new Set(products.map((p) => p.category))];
  const vendors = ["All", ...new Set(products.map((p) => p.vendorName))];

  const exportCSV = () => {
    const rows = [
      ["Product", "Vendor", "Category", "Price", "Stock", "Sales", "Status"],
      ...filtered.map((p) => [
        p.name,
        p.vendorName,
        p.category,
        p.price,
        p.stock,
        p.sales,
        p.status,
      ]),
    ];
    const csv = rows.map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "products.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        <div className="bg-gradient-to-r from-green-600 to-blue-600 text-white rounded-3xl p-8 mb-8">
          <h1 className="text-4xl font-bold">📦 Marketplace Products</h1>
          <p className="mt-2 opacity-90">Manage all marketplace products</p>
        </div>

        {/* STATS */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-5 mb-8">
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Total Products</p>
            <h2 className="text-3xl font-bold">{totalProducts}</h2>
          </div>
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Active</p>
            <h2 className="text-3xl font-bold text-green-600">
              {activeProducts}
            </h2>
          </div>
          <button
            type="button"
            onClick={() => setStatusFilter("Pending")}
            className="bg-white rounded-2xl shadow p-6 text-left hover:ring-2 hover:ring-yellow-400 transition"
          >
            <p>Pending Review</p>
            <h2 className="text-3xl font-bold text-yellow-600">
              {pendingProducts}
            </h2>
          </button>
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Low Stock</p>
            <h2 className="text-3xl font-bold text-yellow-600">{lowStock}</h2>
          </div>
          <div className="bg-white rounded-2xl shadow p-6">
            <p>Out Of Stock</p>
            <h2 className="text-3xl font-bold text-red-600">{outOfStock}</h2>
          </div>
        </div>

        <div className="flex justify-end mb-5">
          <button
            onClick={exportCSV}
            className="bg-green-600 hover:bg-green-700 transition text-white px-6 py-3 rounded-xl"
          >
            📥 Export CSV
          </button>
        </div>

        {/* FILTERS */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div>
            <input
              placeholder="Search product, vendor or exact document ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="border rounded-xl p-4 w-full"
            />
            {searchNotice ? (
              <p
                role="status"
                className={`mt-1 text-xs font-semibold ${
                  searchNotice.tone === "ok" ? "text-indigo-700" : "text-amber-700"
                }`}
              >
                {searchNotice.text}
              </p>
            ) : null}
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-xl p-4"
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="border rounded-xl p-4"
          >
            {vendors.map((vendor) => (
              <option key={vendor} value={vendor}>
                {vendor}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="border rounded-xl p-4"
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending Review</option>
            <option value="Active">Active</option>
            <option value="Blocked">Blocked</option>
            <option value="Rejected">Rejected</option>
            <option value="Archived">Archived</option>
          </select>
        </div>

        {/* GRID */}
        {loading ? (
          <div className="bg-white rounded-2xl p-10 text-center">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl p-10 text-center text-gray-500">
            {emptyMessage}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {filtered.map((product) => (
              <div
                key={product.id}
                className="bg-white rounded-2xl shadow-sm hover:shadow-md transition p-3"
              >
                <div className="relative h-32">
                  <ProductImage
                    src={product.image}
                    alt={product.name}
                    className="w-full h-full object-cover rounded-xl"
                  />
                </div>

                {/* Exact identity: the document id is what every action targets. */}
                <div className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 p-1.5">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-indigo-700">
                    Document ID
                  </p>
                  <code className="block select-all break-all font-mono text-[11px] text-gray-900">
                    {product.id}
                  </code>
                  {hasUnusualIdChars(product.id) ? (
                    <div className="mt-1 rounded border border-amber-300 bg-amber-50 p-1 text-[10px] text-amber-800">
                      <p className="font-semibold">⚠ Unusual characters in this document ID</p>
                      <p>Escaped (display only):</p>
                      <code className="block break-all font-mono">{visibleIdForm(product.id)}</code>
                    </div>
                  ) : null}
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void copyId(product)}
                      className="rounded border border-indigo-300 bg-white px-2 py-0.5 text-[11px] font-medium text-indigo-700 hover:bg-indigo-100"
                    >
                      Copy ID
                    </button>
                    {product.productNumber ? (
                      <span className="font-mono text-[10px] text-gray-600" title="Product number (display only)">
                        No. {product.productNumber}
                      </span>
                    ) : null}
                  </div>
                </div>

                <h2 className="text-sm font-bold mt-2 line-clamp-1">
                  {product.name}
                </h2>
                <p className="text-gray-500 text-xs line-clamp-1">🏪 {product.vendorName}</p>
                <p className="text-gray-500 text-xs line-clamp-1">📂 {product.category}</p>
                <p className="font-bold text-sm mt-1">₹{Number(product.price).toLocaleString("en-IN")}</p>
                <p className="text-gray-500 text-xs">Stock: {product.stock} • Sales: {product.sales}</p>
                

                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-bold ${
                      STATUS_BADGE_CLASS[product.moderation]
                    }`}
                  >
                    {product.status}
                  </span>

                  {product.stock <= 0 ? (
                    <span className="bg-red-100 text-red-700 px-3 py-1 rounded-full text-xs">
                      Out Of Stock
                    </span>
                  ) : product.stock <= 5 ? (
                    <span className="bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full text-xs">
                      Low Stock
                    </span>
                  ) : null}
                </div>

                {product.moderation === "rejected" && product.rejectionReason ? (
                  <p className="text-xs text-red-600 mt-1 line-clamp-2">
                    Rejected: {product.rejectionReason}
                  </p>
                ) : null}

                {/* Primary moderation row: Approve / Reject / Unblock (+ Feature). */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {(product.moderation === "pending" ||
                    product.moderation === "rejected") && (
                    <button
                      onClick={() => moderate(product, "approve")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-green-600 hover:bg-green-700"
                    >
                      Approve
                    </button>
                  )}

                  {product.moderation !== "rejected" && (
                    <button
                      onClick={() => moderate(product, "reject")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-orange-600 hover:bg-orange-700"
                    >
                      Reject
                    </button>
                  )}

                  {product.moderation === "blocked" && (
                    <button
                      onClick={() => moderate(product, "unblock")}
                      className="flex-1 py-1.5 text-sm rounded-lg text-white transition bg-green-600 hover:bg-green-700"
                    >
                      Unblock
                    </button>
                  )}

                  <button
                    onClick={() => toggleFeatured(product)}
                    className={`flex-1 py-1.5 text-sm rounded-lg text-white transition ${
                      product.featured
                        ? "bg-purple-600 hover:bg-purple-700"
                        : "bg-gray-500 hover:bg-gray-600"
                    }`}
                  >
                    {product.featured ? "★ Featured" : "☆ Feature"}
                  </button>
                </div>

                {/* Secondary risk row: Block and Delete, set apart and outlined
                    so they cannot be mistaken for Reject. Both require typing
                    the last 6 characters of this card's document ID. */}
                <div className="mt-2 border-t border-dashed border-gray-300 pt-2">
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
                    Risk actions
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(product.moderation === "live" || product.moderation === "archived") && (
                      <button
                        onClick={() => moderate(product, "block")}
                        className="flex-1 py-1.5 text-sm rounded-lg border-2 border-gray-700 bg-white text-gray-800 font-semibold transition hover:bg-gray-100"
                      >
                        ⛔ Block
                      </button>
                    )}

                    <button
                      onClick={() => deleteProduct(product)}
                      className="flex-1 py-1.5 text-sm rounded-lg border-2 border-red-700 bg-white text-red-700 font-semibold transition hover:bg-red-50"
                    >
                      🗑 Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
