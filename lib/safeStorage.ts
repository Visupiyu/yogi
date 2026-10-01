// Defensive localStorage JSON reads (client only).
//
// Cart, wishlist, compare, recently-viewed, saved items, search history and the
// cached user are all JSON in localStorage. A browser extension, an old build, a
// manual edit or a quota-truncated write can leave any of them corrupt, and a bare
// JSON.parse then throws inside render/effects — and because the Navbar reads the
// cart and wishlist on EVERY page, one bad value used to take the whole site down.
// These return the fallback instead of throwing, and also reject a value of the
// wrong shape (an object where a list is expected, etc.).
export function readJsonArray<T = any>(key: string): T[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export function readJsonObject<T extends Record<string, any> = Record<string, any>>(key: string): T {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as T) : ({} as T);
  } catch {
    return {} as T;
  }
}

/** JSON.parse that returns null instead of throwing (for a value already read). */
export function parseJson<T = any>(raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}
