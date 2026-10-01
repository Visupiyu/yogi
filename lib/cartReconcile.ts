// Cart / checkout line revalidation (client-side, advisory).
//
// A cart line is a SNAPSHOT of a product taken when it was added. The product can
// since have been deleted, blocked or sent back for review, sold out, repriced or
// had its stock reduced — and the customer only learned that from the server's
// final refusal. This re-reads each product and reports, per line, what is wrong
// and what the line should now look like.
//
// It deliberately reuses the existing rules instead of adding a parallel system:
//   * visibility            lib/products/visibility.ts   (isProductVisible)
//   * variant identity      lib/products/variantSelection.ts
//   * stock-bearing variants lib/products/inventory.ts
//   * line identity         lib/cart.ts isSameLine (product id + variantId, or
//                           id + size + color for lines that never had one)
//   * price rule            the same one the server charges by (lib/orderPricing.ts):
//                           a variant priced > 0 wins, otherwise the sellingPrice
// The server stays authoritative; nothing here is trusted by it.
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { getCartItems, isSameLine, type CartItem } from "@/lib/cart";
import { isProductVisible } from "@/lib/products/visibility";
import { findVariantById } from "@/lib/products/variantSelection";
import { hasStockBearingVariants } from "@/lib/products/inventory";

export type LineIssue =
  | "unavailable" // deleted, blocked or not for sale
  | "option-unavailable" // the exact variant no longer exists
  | "needs-options" // product now has variants and this line names none
  | "out-of-stock";

export const ISSUE_LABEL: Record<LineIssue, string> = {
  unavailable: "No longer available",
  "option-unavailable": "This option is no longer available",
  "needs-options": "Please choose options on the product page",
  "out-of-stock": "Out of stock",
};

export type LineCheck = {
  /** The line as it should now be (fresh price/stock, quantity within stock). */
  line: CartItem;
  issue: LineIssue | null;
  priceChanged: { from: number; to: number } | null;
  qtyReduced: { from: number; to: number } | null;
};

export function lineKey(item: {
  id: string;
  variantId?: string;
  size?: string;
  color?: string;
}): string {
  return `${item.id}|${item.variantId || `${item.size || ""}|${item.color || ""}`}`;
}

const money = (n: number) => `₹${Number(n).toLocaleString("en-IN")}`;

/** `productData` is the product document's data, or null if it does not exist. */
export function checkLine(item: CartItem, productData: Record<string, any> | null): LineCheck {
  const unchanged = (issue: LineIssue): LineCheck => ({
    line: item,
    issue,
    priceChanged: null,
    qtyReduced: null,
  });

  if (!productData || !isProductVisible(productData)) return unchanged("unavailable");

  const variants = Array.isArray(productData.variants) ? productData.variants : [];
  const variant = item.variantId ? findVariantById(variants, item.variantId) : null;

  if (item.variantId && !variant) return unchanged("option-unavailable");
  if (!item.variantId && hasStockBearingVariants(productData.variants)) {
    return unchanged("needs-options");
  }

  const sellingPrice =
    typeof productData.sellingPrice === "number"
      ? productData.sellingPrice
      : Number(productData.price ?? item.price ?? 0);
  const variantPrice = variant ? Number((variant as any).price) : NaN;
  const price = Number.isFinite(variantPrice) && variantPrice > 0 ? variantPrice : sellingPrice;

  const rawStock = variant ? Number((variant as any).stock) : Number(productData.stock ?? 0);
  const stock = Number.isFinite(rawStock) ? Math.max(0, Math.floor(rawStock)) : 0;

  if (stock <= 0) {
    return { line: { ...item, stock: 0, price }, issue: "out-of-stock", priceChanged: null, qtyReduced: null };
  }

  const oldQty = Math.max(1, Math.floor(Number(item.qty)) || 1);
  const qty = Math.min(oldQty, stock);
  const oldPrice = Number(item.price);

  return {
    line: { ...item, stock, price, qty },
    issue: null,
    priceChanged:
      Number.isFinite(oldPrice) && Math.abs(oldPrice - price) > 0.0001
        ? { from: oldPrice, to: price }
        : null,
    qtyReduced: qty < oldQty ? { from: oldQty, to: qty } : null,
  };
}

/** Customer-facing sentences for what changed (one per meaningful change). */
export function describeChecks(checks: LineCheck[]): string[] {
  const out: string[] = [];
  for (const c of checks) {
    const name = c.line.name || "An item";
    if (c.issue) {
      out.push(`${name}: ${ISSUE_LABEL[c.issue]}. Remove it to continue.`);
      continue;
    }
    if (c.priceChanged) {
      out.push(`${name}: price changed from ${money(c.priceChanged.from)} to ${money(c.priceChanged.to)}.`);
    }
    if (c.qtyReduced) {
      out.push(`${name}: only ${c.qtyReduced.to} left — quantity reduced from ${c.qtyReduced.from} to ${c.qtyReduced.to}.`);
    }
  }
  return out;
}

/**
 * Reads every distinct product once. THROWS if any read fails — a failed read is
 * "could not verify", never "product deleted".
 */
export async function fetchProducts(ids: string[]): Promise<Map<string, Record<string, any> | null>> {
  const unique = Array.from(new Set(ids));
  const entries = await Promise.all(
    unique.map(async (id) => {
      const snap = await getDoc(doc(db, "products", id));
      return [id, snap.exists() ? (snap.data() as Record<string, any>) : null] as const;
    })
  );
  return new Map(entries);
}

export async function revalidateLines(lines: CartItem[]): Promise<LineCheck[]> {
  const products = await fetchProducts(lines.map((l) => l.id));
  return lines.map((l) => checkLine(l, products.get(l.id) ?? null));
}

/**
 * Applies refresh results to the cart AS IT IS NOW. The cart is re-read here,
 * synchronously with the write, so a quantity change, removal, add or
 * save-for-later made while the async product reads were in flight is kept: lines
 * the refresh knows nothing about are untouched, removed lines stay removed, and
 * quantity is judged from the CURRENT quantity, never the snapshot's.
 *
 * Unavailable (deleted / blocked / option gone) lines are left exactly as they are
 * — the customer is asked to remove them; sold-out lines are stamped stock 0.
 * Returns the sentences for what actually changed in the stored cart, so a change
 * is reported once (the next refresh finds the cart already current).
 */
export function mergeRefreshIntoCart(checks: LineCheck[]): { notices: string[]; changed: boolean } {
  const current = getCartItems();
  const applied: LineCheck[] = [];
  let changed = false;

  const next = current.map((line) => {
    const check = checks.find((c) => isSameLine(line, c.line));
    if (!check) return line;

    if (check.issue === "out-of-stock") {
      if (Number(line.stock) === 0) return line;
      changed = true;
      return { ...line, stock: 0 };
    }
    if (check.issue) return line;

    const stock = check.line.stock;
    const price = check.line.price;
    const qty = Math.max(1, Math.min(Math.floor(Number(line.qty)) || 1, stock));
    const oldPrice = Number(line.price);
    const priceChanged = !Number.isFinite(oldPrice) || Math.abs(oldPrice - price) > 0.0001;
    const qtyReduced = qty < (Math.floor(Number(line.qty)) || 1);

    if (!priceChanged && !qtyReduced && Number(line.stock) === stock) return line;

    changed = true;
    const merged = { ...line, stock, price, qty };
    applied.push({
      line: merged,
      issue: null,
      priceChanged: priceChanged && Number.isFinite(oldPrice) ? { from: oldPrice, to: price } : null,
      qtyReduced: qtyReduced ? { from: Math.floor(Number(line.qty)) || 1, to: qty } : null,
    });
    return merged;
  });

  if (changed) {
    localStorage.setItem("cart", JSON.stringify(next));
    window.dispatchEvent(new Event("cartUpdated"));
  }
  return { notices: describeChecks(applied), changed };
}
