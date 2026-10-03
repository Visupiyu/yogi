// Storefront text-search matching + relevance ordering. Pure and
// dependency-free: the search page and the Navbar suggestions run it over the
// shared catalog scan (lib/storefront/catalogScan.ts — paged, cached, no 300
// ceiling, already filtered to storefront-visible products), and tests run it
// directly.
//
// Previously a product matched only when the WHOLE query appeared verbatim as
// one substring ("red shirt" missed "Red Cotton Shirt"), brand-only, model,
// keyword and category-name queries were inconsistent, and results came back in
// Firestore document-id order — effectively random. Now:
//   * every query word must appear somewhere in the product's real fields
//     (title/shortTitle/name, brand, model, keywords, category names,
//     description) — words, not one fixed phrase;
//   * results are ordered by an explainable tier, then by name, then by id, so
//     the same catalog + query always yields the same order.
// Only fields products actually store are read; nothing is invented.

export type SearchableProduct = { id: string; data: Record<string, unknown> };

/** lowercase, accents stripped, punctuation → space, whitespace collapsed. */
export function normalizeSearchText(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function searchTokens(query: string): string[] {
  return [...new Set(normalizeSearchText(query).split(" ").filter(Boolean))];
}

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// Tier weights, highest wins. Exposed so tests and docs can name them.
export const RELEVANCE_TIERS = {
  EXACT_NAME: 1000,
  NAME_PREFIX: 800,
  NAME_PHRASE: 600,
  ALL_WORDS_IN_NAME: 400,
  BRAND_OR_MODEL: 300,
  CATEGORY: 200,
  KEYWORDS: 150,
  DESCRIPTION: 50,
} as const;

export type RelevanceOptions = {
  /** Category names for a product (e.g. resolved from categoryId via the catalog tree). */
  categoryNames?: (data: Record<string, unknown>) => string[];
};

const containsWord = (haystack: string, needle: string) => ` ${haystack} `.includes(` ${needle} `);
const allIn = (haystack: string, tokens: string[]) => tokens.every((t) => haystack.includes(t));

/**
 * Relevance score for one product, or null when it does not match (some query
 * word appears in none of its fields). Higher is better.
 */
export function relevanceScore(
  data: Record<string, unknown>,
  query: string,
  options: RelevanceOptions = {}
): number | null {
  const q = normalizeSearchText(query);
  const tokens = searchTokens(query);
  if (!q || tokens.length === 0) return null;

  const names = [str(data.title) || str(data.name), str(data.shortTitle)]
    .map(normalizeSearchText)
    .filter(Boolean);
  const brand = normalizeSearchText(data.brand);
  const model = normalizeSearchText(data.model);
  const keywords = Array.isArray(data.keywords) ? data.keywords.map(normalizeSearchText).filter(Boolean) : [];
  const categories = (options.categoryNames?.(data) ?? []).map(normalizeSearchText).filter(Boolean);
  const description = normalizeSearchText(data.description);

  const everything = [...names, brand, model, ...keywords, ...categories, description].join(" ");
  if (!allIn(everything, tokens)) return null;

  let tier: number = RELEVANCE_TIERS.DESCRIPTION;
  const bump = (value: number) => {
    if (value > tier) tier = value;
  };

  for (const name of names) {
    if (name === q) bump(RELEVANCE_TIERS.EXACT_NAME);
    else if (name.startsWith(q)) bump(RELEVANCE_TIERS.NAME_PREFIX);
    else if (containsWord(name, q) || name.includes(q)) bump(RELEVANCE_TIERS.NAME_PHRASE);
    else if (allIn(name, tokens)) bump(RELEVANCE_TIERS.ALL_WORDS_IN_NAME);
  }
  if ((brand && (brand === q || allIn(brand, tokens))) || (model && (model === q || allIn(model, tokens)))) {
    bump(RELEVANCE_TIERS.BRAND_OR_MODEL);
  }
  if (categories.some((c) => c === q || allIn(c, tokens))) bump(RELEVANCE_TIERS.CATEGORY);
  if (keywords.some((k) => k === q || allIn(k, tokens))) bump(RELEVANCE_TIERS.KEYWORDS);

  // Within a tier: how many query words the NAME itself carries (whole words
  // count double), so a name that says more of what was typed ranks first.
  const nameText = names.join(" ");
  const nameBonus = tokens.reduce((sum, t) => sum + (containsWord(nameText, t) ? 2 : nameText.includes(t) ? 1 : 0), 0);
  return tier + nameBonus;
}

function sortName(data: Record<string, unknown>): string {
  return normalizeSearchText(str(data.shortTitle) || str(data.title) || str(data.name));
}

/**
 * Matching products, best first. Deterministic: score desc, then name asc,
 * then id asc. Does not cap the result count — callers page the display.
 */
export function rankProducts<T extends SearchableProduct>(
  products: readonly T[],
  query: string,
  options: RelevanceOptions = {}
): T[] {
  const scored: { product: T; score: number; name: string }[] = [];
  for (const product of products) {
    const score = relevanceScore(product.data, query, options);
    if (score !== null) scored.push({ product, score, name: sortName(product.data) });
  }
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (a.name < b.name ? -1 : a.name > b.name ? 1 : 0) ||
      (a.product.id < b.product.id ? -1 : a.product.id > b.product.id ? 1 : 0)
  );
  return scored.map((s) => s.product);
}
