// Save-for-later / move-back-to-cart (client only).
//
// Both work on the cart and saved list AS THEY ARE IN STORAGE when they run, not
// on a React snapshot, and use the same line identity as the cart (product id +
// variantId, or id + size + color for lines that never had one):
//   * saving the same line twice keeps one saved entry;
//   * moving a saved line back MERGES into an existing identical cart line
//     instead of creating a duplicate, never exceeds current stock, and refuses a
//     product that is deleted / blocked / out of stock / missing its variant —
//     in every refusal (and on a failed read) the item STAYS in saved-for-later.
import { getCartItems, isSameLine, type CartItem } from "@/lib/cart";
import { checkLine, fetchProducts, ISSUE_LABEL, type LineIssue } from "@/lib/cartReconcile";

const SAVED_KEY = "savedItems";

export function getSavedItems(): CartItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(SAVED_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCart(cart: CartItem[]) {
  localStorage.setItem("cart", JSON.stringify(cart));
  window.dispatchEvent(new Event("cartUpdated"));
}

function writeSaved(saved: CartItem[]) {
  localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
}

export function saveLineForLater(line: CartItem): void {
  const cart = getCartItems().filter((item) => !isSameLine(item, line));
  writeCart(cart);

  const saved = getSavedItems();
  if (!saved.some((item) => isSameLine(item, line))) saved.push(line);
  writeSaved(saved);
}

export type MoveResult =
  | { ok: true; kind: "moved" | "merged" | "already-in-cart"; capped: boolean }
  | { ok: false; reason: LineIssue | "read-failed"; message: string };

export async function moveSavedToCart(item: CartItem): Promise<MoveResult> {
  let check;
  try {
    const products = await fetchProducts([item.id]);
    check = checkLine(item, products.get(item.id) ?? null);
  } catch {
    return {
      ok: false,
      reason: "read-failed",
      message: "Couldn't check this item right now. It is still saved — please try again.",
    };
  }

  if (check.issue) {
    return {
      ok: false,
      reason: check.issue,
      message: `${ISSUE_LABEL[check.issue]} — it stays in Saved for Later.`,
    };
  }

  const stock = check.line.stock;
  const cart = getCartItems();
  const index = cart.findIndex((c) => isSameLine(c, check.line));

  let kind: "moved" | "merged" | "already-in-cart";
  let capped = false;

  if (index > -1) {
    const have = Math.max(1, Math.floor(Number(cart[index].qty)) || 1);
    const wanted = have + check.line.qty;
    const qty = Math.min(wanted, stock);
    capped = qty < wanted;
    kind = qty > have ? "merged" : "already-in-cart";
    cart[index] = { ...cart[index], qty, stock, price: check.line.price };
  } else {
    cart.push(check.line);
    capped = check.qtyReduced !== null;
    kind = "moved";
  }
  writeCart(cart);

  // Only now (it is safely in the cart) remove it from saved — first match only.
  const saved = getSavedItems();
  const at = saved.findIndex((s) => isSameLine(s, item));
  if (at > -1) saved.splice(at, 1);
  writeSaved(saved);

  return { ok: true, kind, capped };
}
