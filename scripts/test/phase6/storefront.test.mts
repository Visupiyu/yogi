/*
 * Phase 6 storefront / navigation checks (plain Node, no emulator, no network):
 *   L9  support wording        lib/siteConfig.ts + no "24/7" claims in UI source
 *   L10 delivery estimate      lib/deliveryEstimate.ts, no invented "+5 days" date
 *   L11 customer tracking text lib/orderTracking.ts, trackingProjections labels
 *   L12 product image fallback lib/productImage.ts + the placeholder asset
 *   L13 search relevance       lib/storefront/searchRelevance.ts
 *   L16 admin navigation       lib/adminNav.ts + every linked page exists
 *   L18 canonical domain       https://yomico.in everywhere in code
 *
 * Run: npx tsx scripts/test/phase6/storefront.test.mts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), "utf8");

const { rankProducts, relevanceScore, normalizeSearchText, searchCatalog } = await import("../../../lib/storefront/searchRelevance.ts");
const { meetsMinimumDiscount } = await import("../../../lib/storefront/searchFilters.ts");
const { toLegacyProduct } = await import("../../../lib/products/legacyDisplay.ts");
const { customerDeliveryEstimate, PRE_ORDER_DELIVERY_TEXT } = await import("../../../lib/deliveryEstimate.ts");
const { customerStatusLabel, ORDER_STEPS } = await import("../../../lib/orderTracking.ts");
const { productImageSrc, productImageAlt, PRODUCT_IMAGE_PLACEHOLDER, isOptimizableImageSrc } = await import("../../../lib/productImage.ts");
const { SITE_URL, SUPPORT_HOURS_SHORT, SUPPORT_RESPONSE_TEXT, EMAIL_FROM } = await import("../../../lib/siteConfig.ts");
const { ADMIN_NAV, activeAdminHref } = await import("../../../lib/adminNav.ts");

const results: { name: string; pass: boolean }[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

/** Every source file under the given dirs (no node_modules / .next). */
function sources(dirs: string[], exts = [".ts", ".tsx", ".js", ".jsx"]): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") walk(rel); }
      else if (exts.includes(path.extname(e.name))) out.push(rel);
    }
  };
  dirs.forEach(walk);
  return out;
}
/** Source with // and /* *\/ comments stripped (claims in comments are not shown to anyone). */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

// ---------------- L13 search ----------------
const P = [
  { id: "a", data: { title: "Red Cotton Shirt", brand: "Acme", description: "soft" } },
  { id: "b", data: { title: "Shirt", brand: "Zed" } },
  { id: "c", data: { title: "Blue Jeans", brand: "Red Tape" } },
  { id: "d", data: { title: "Café Crème Mug", keywords: ["kitchen"] } },
  { id: "e", data: { title: "Hundred Pens" } },
  { id: "f", data: { title: "Plain Tee", description: "a red shirt for summer" } },
  { id: "g", data: { title: "Polo", categoryId: "MEN" } },
];
const ids = (q: string, opts = {}) => rankProducts(P, q, opts).map((p) => p.id).join(",");
record("L13-1 multi-word query matches words in any order/field ('red shirt' finds 'Red Cotton Shirt' first)", ids("red shirt").startsWith("a") && ids("shirt red").startsWith("a"), ids("red shirt"));
record("L13-2 exact name ranks first ('shirt' -> 'Shirt' before 'Red Cotton Shirt')", ids("shirt").startsWith("b,a"), ids("shirt"));
record("L13-3 mid-word match ranks below whole-word name AND brand matches ('red': Red Cotton Shirt, Red Tape, ... Hundred last)",
  ids("red").split(",")[0] === "a" && ids("red").split(",").indexOf("c") < ids("red").split(",").indexOf("e"), ids("red"));
record("L13-4 accents and punctuation are ignored ('cafe creme!!')", ids("cafe creme!!") === "d" && normalizeSearchText("Crème Brûlée") === "creme brulee");
record("L13-5 brand, keyword and description matches", ids("acme") === "a" && ids("kitchen") === "d" && ids("summer") === "f");
record("L13-6 category names (resolved by the caller) match", ids("men", { categoryNames: (d: any) => (d.categoryId === "MEN" ? ["Men"] : []) }) === "g");
record("L13-7 empty / blank / no-match queries return nothing", ids("") === "" && ids("   ") === "" && ids("zzzz") === "");
record("L13-8 deterministic: same input, same order, ties broken by name then id",
  JSON.stringify(rankProducts([...P].reverse(), "shirt").map((p) => p.id)) === JSON.stringify(rankProducts(P, "shirt").map((p) => p.id)));
record("L13-9 a word that is nowhere in the product does not match", relevanceScore({ title: "Red Shirt" }, "red hat") === null);
record("L13-10 the search page and Navbar both use the shared ranking",
  read("app/search/page.jsx").includes("searchCatalog(") && read("components/Navbar.tsx").includes("rankProducts(") &&
  /searchCatalog[\s\S]*rankProducts\(products, query, options\)/.test(read("lib/storefront/searchRelevance.ts")));

// ---------------- search with no query words + URL filters ----------------
// /search?minDiscount=40 (the Best Deals links) has no query words. It must
// list every visible product that passes the filters, not run a word search
// that matches nothing. Mirrors the page: searchCatalog -> toLegacyProduct ->
// the minDiscount filter.
{
  const D = [
    { id: "d1", data: { title: "Redmi A7 Pro 5G Phone", mrp: 26999, sellingPrice: 14999 } }, // 44% off
    { id: "d2", data: { title: "Steel Bottle", mrp: 1000, sellingPrice: 800 } },             // 20% off
    { id: "d3", data: { title: "Phone Case", mrp: 500, price: 250 } },                       // 50% off
    { id: "d4", data: { title: "Desk Lamp", price: 300 } },                                  // no MRP
    { id: "d5", data: { title: "Old Phone", mrp: 1000, sellingPrice: 600 } },                // exactly 40% off
  ];
  const results = (q: string, minDiscount: number) =>
    searchCatalog(D, q)
      .map(({ id, data }) => toLegacyProduct(id, data))
      .filter((item) => minDiscount <= 0 || meetsMinimumDiscount(item, minDiscount))
      .map((p) => p.id);
  const set = (a: string[]) => [...a].sort().join(",");

  record("S1 no query + minDiscount=40 returns every qualifying product (44%, 50%, exactly 40%)",
    results("", 40).join(",") === "d1,d3,d5" && results("   ", 40).join(",") === "d1,d3,d5", results("", 40).join(","));
  record("S2 no query + minDiscount above every discount returns nothing",
    results("", 60).length === 0 && results("", 100).length === 0, results("", 60).join(","));
  record("S3 text query + minDiscount=40 still returns the matching qualifying products",
    set(results("phone", 40)) === "d1,d3,d5" && results("redmi", 40).join(",") === "d1" &&
    results("bottle", 40).length === 0 && results("lamp", 40).length === 0, results("phone", 40).join(","));
  record("S4 no query and no filter keeps the whole visible list in its given order",
    results("", 0).join(",") === "d1,d2,d3,d4,d5");
  const same = ["red shirt", "shirt", "red", "cafe creme!!", "acme", "summer", "zzzz"].every(
    (q) => JSON.stringify(searchCatalog(P, q).map((p) => p.id)) === JSON.stringify(rankProducts(P, q).map((p) => p.id)));
  record("S5 text search with words is unchanged (searchCatalog === rankProducts); rankProducts('') still empty",
    same && rankProducts(P, "").length === 0);
  record("S6 the minDiscount maths is the page's: (mrp - price) / mrp >= N, no MRP never matches",
    meetsMinimumDiscount({ mrp: 26999, price: 14999 }, 40) && !meetsMinimumDiscount({ mrp: 26999, price: 14999 }, 45) &&
    meetsMinimumDiscount({ mrp: 1000, price: 600 }, 40) && !meetsMinimumDiscount({ price: 1 }, 1) &&
    !meetsMinimumDiscount({ mrp: 0, price: 0 }, 1) &&
    read("app/search/page.jsx").includes("meetsMinimumDiscount(item, minimumDiscount)"));
}

// ---------------- L10 delivery estimate ----------------
{
  const confirmedAt = new Date("2026-05-01T06:00:00Z");
  const t = customerDeliveryEstimate({ status: "Confirmed", confirmedAt });
  record("L10-1 confirmed order: 'Expected by' the business SLA target from confirmation", t.kind === "target" && !!t.date && t.date > confirmedAt);
  record("L10-2 pending order: no invented date", customerDeliveryEstimate({ status: "Pending" }).kind === "awaiting-confirmation" && customerDeliveryEstimate({ status: "Pending" }).date === null);
  record("L10-3 a seller-entered expected date wins", customerDeliveryEstimate({ status: "Shipped", confirmedAt, expectedDelivery: "2026-05-04" }).kind === "expected");
  record("L10-4 cancelled / failed: nothing shown", ["Cancelled", "Delivery Failed", "Returned"].every((s) => customerDeliveryEstimate({ status: s }).kind === "none"));
  record("L10-5 legacy '+5 days' deliveryDate is ignored", customerDeliveryEstimate({ status: "Pending", deliveryDate: "6 May 2026" } as any).date === null);
  const writers = ["app/api/place-order/route.ts", "app/api/create-order/route.ts", "lib/onlineOrder.ts"];
  record("L10-6 no order writer stores an invented deliveryDate any more", writers.every((f) => !/deliveryDate\s*:/.test(code(f))));
  record("L10-7 pre-order text promises no specific date", !/\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/.test(PRE_ORDER_DELIVERY_TEXT));
}

// ---------------- L11 tracking wording ----------------
{
  const labels = ["Pending", "Confirmed", "Packed", "Shipped", "Out For Delivery", "Delivered", "Cancelled", "Delivery Failed"].map(customerStatusLabel);
  record("L11-1 customer labels are shopping words, never seller actions ('Accept', 'Handed Over')", labels.every((l) => !/accept|handed over|final delivery/i.test(l)), labels.join(" | "));
  record("L11-2 unknown status reads 'Processing'", customerStatusLabel("Weird") === "Processing" && customerStatusLabel(null) === "Processing");
  record("L11-3 six tracker steps, starting 'Order placed', ending 'Delivered'", ORDER_STEPS.length === 6 && ORDER_STEPS[0].includes("Order placed") && ORDER_STEPS[5].includes("Delivered"));
  const tp = read("lib/deliveryEngine/trackingProjections.ts");
  record("L11-4 hub jargon is gone from customer milestones", !/"At origin hub"|"At destination hub"|"Assigned for final delivery"/.test(tp));
}

// ---------------- L12 product images ----------------
{
  record("L12-1 missing / empty / 'undefined' / 'null' -> placeholder",
    [undefined, null, "", "  ", "undefined", "null"].every((v) => productImageSrc(v as any) === PRODUCT_IMAGE_PLACEHOLDER));
  record("L12-2 precedence thumbnail -> image -> images[0], skipping bad values",
    productImageSrc({ thumbnail: "", image: "undefined", images: ["", "https://x/a.jpg"] }) === "https://x/a.jpg" &&
    productImageSrc({ thumbnail: "https://x/t.jpg", image: "https://x/i.jpg" }) === "https://x/t.jpg");
  record("L12-3 non-URL junk is rejected; site paths, http(s), data:image allowed",
    productImageSrc("javascript:alert(1)") === PRODUCT_IMAGE_PLACEHOLDER && productImageSrc("/a.png") === "/a.png" && productImageSrc("data:image/png;base64,xx").startsWith("data:image/"));
  record("L12-4 alt text is the product name, never empty/undefined", productImageAlt(undefined) === "Product image" && productImageAlt(" Kettle ") === "Kettle");
  record("L12-5 the placeholder file exists in /public", fs.existsSync(path.join(ROOT, "public", PRODUCT_IMAGE_PLACEHOLDER)));
  record("L12-7 next/image optimises only configured hosts (others render unoptimized instead of crashing the page)",
    isOptimizableImageSrc("/product-placeholder.svg") && isOptimizableImageSrc("https://firebasestorage.googleapis.com/v0/b/x/o/a.jpg") &&
    !isOptimizableImageSrc("https://cdn.other-host.example/a.jpg") && !isOptimizableImageSrc("//evil.example/a.jpg") && !isOptimizableImageSrc("http://127.0.0.1:9199/v0/b/x"));
  const pdp = read("app/product/[id]/ProductPageClient.tsx");
  record("L12-8 every product-page <Image> decides unoptimized by that rule",
    (pdp.match(/<Image\b/g) || []).length === (pdp.match(/unoptimized=\{!isOptimizableImageSrc\(/g) || []).length);
  const broken = sources(["app", "components"]).filter((f) => read(f).includes("/no-image.png"));
  record("L12-6 no surface points at the non-existent /no-image.png", broken.length === 0, broken.join(", "));
}

// ---------------- L9 support wording ----------------
{
  const claims = sources(["app", "components"]).filter((f) => /24\s*\/\s*7|24x7|round the clock/i.test(code(f)));
  record("L9-1 no UI claims 24/7 support", claims.length === 0, claims.join(", "));
  record("L9-2 the real availability text", SUPPORT_HOURS_SHORT === "Mon–Sat support" && SUPPORT_RESPONSE_TEXT.includes("24–48 business hours"));
  record("L9-3 the contact page states the same response time", read("app/contact/page.tsx").includes("24–48 business hours"));
}

// ---------------- L16 admin navigation ----------------
{
  const required = ["analytics", "delivery-companies", "payouts", "products", "refunds", "reports", "returns", "withdrawals"];
  const hrefs = ADMIN_NAV.map((i) => i.href);
  record("L16-1 the eight missing admin pages are in the navigation", required.every((r) => hrefs.includes(`/admin/${r}`)));
  const missing = hrefs.filter((h) => !["page.tsx", "page.jsx", "page.js"].some((f) => fs.existsSync(path.join(ROOT, "app", h, f))));
  record("L16-2 every nav link is a real page (no fake routes)", missing.length === 0, missing.join(", "));
  record("L16-3 no duplicate links", new Set(hrefs).size === hrefs.length);
  record("L16-4 /admin/delivery-companies highlights Delivery Companies, not Delivery", activeAdminHref("/admin/delivery-companies") === "/admin/delivery-companies");
  record("L16-5 /admin/delivery-partners highlights only Delivery Partners", activeAdminHref("/admin/delivery-partners") === "/admin/delivery-partners");
  record("L16-6 /admin/delivery highlights Delivery; its sub-pages highlight themselves",
    activeAdminHref("/admin/delivery") === "/admin/delivery" && activeAdminHref("/admin/delivery/control-tower") === "/admin/delivery/control-tower" &&
    activeAdminHref("/admin/delivery/persons/abc") === "/admin/delivery/persons");
  record("L16-7 dashboard only on /admin; detail pages highlight their section",
    activeAdminHref("/admin") === "/admin" && activeAdminHref("/admin/orders/123") === "/admin/orders" && activeAdminHref("/admin/returns/") === "/admin/returns");
  const layout = read("app/admin/layout.tsx");
  record("L16-8 one nav list for desktop and the mobile drawer", (layout.match(/ADMIN_NAV\.map/g) || []).length === 1 && !layout.includes("const navItems"));
}

// ---------------- L18 domain ----------------
{
  record("L18-1 canonical site is the apex https://yomico.in", SITE_URL === "https://yomico.in" && EMAIL_FROM.endsWith("@yomico.in>"));
  const www = sources(["app", "components", "lib"]).filter((f) => code(f).includes("www.yomico.in"));
  record("L18-2 no code uses www.yomico.in", www.length === 0, www.join(", "));
  record("L18-3 the Razorpay webhook comment names the apex URL", read("app/api/razorpay/webhook/route.ts").includes("https://yomico.in/api/razorpay/webhook"));
  const onboarding = sources(["app", "lib"]).filter((f) => code(f).includes("onboarding@yomico.in"));
  record("L18-4 every sender uses the shared EMAIL_FROM (no stray onboarding@ sender)", onboarding.length === 0, onboarding.join(", "));
}

const failed = results.filter((r) => !r.pass);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
