/**
 * Core of the YOMICO Preview TEST catalogue seeder (CLI:
 * scripts/preview-test-catalogue.ts; tests: scripts/test/preview-test-catalogue).
 *
 * Everything here is side-effect free on import: the catalogue definition, its
 * self-validation, the target / credential guards, and the transactional seed
 * and cleanup operations, which take an already-verified Firestore instance.
 *
 * Writes are confined to ten fixed documents — two synthetic seller records
 * (vendors + vendors_public) and eight synthetic products — each carrying
 * `testData: true`, a TEST name and (products) the test seller as owner.
 *
 * Known, deliberate limits (see the CLI header): cleanup removes ONLY those ten
 * documents. Orders, carts, reviews, questions, wishlists, notifications or
 * anything else a tester creates against them are never touched, so no real
 * test order or payment may be placed against the synthetic seller.
 */

import fs from "node:fs";
import path from "node:path";
import { cert, initializeApp, type AppOptions } from "firebase-admin/app";
import {
  FieldValue,
  getFirestore,
  type DocumentData,
  type DocumentSnapshot,
  type Firestore,
} from "firebase-admin/firestore";
import { findNodeById, isTopLevelCategory } from "@/lib/catalog/categoryUtils";
import { toLegacyProduct } from "@/lib/products/legacyDisplay";
import { SELLER_PRODUCT_FIELDS } from "@/lib/products/sellerProductFields";
import { validateSellerProductMoney } from "@/lib/products/sellerProductValidation";
import { isProductVisible } from "@/lib/products/visibility";
import { SELLER_NUMBER_PATTERN } from "@/lib/storefront/publicStorefront";
import { meetsMinimumDiscount } from "@/lib/storefront/searchFilters";

export const PREVIEW_PROJECT_ID = "yomico-preview";
export const PRODUCTION_PROJECT_ID = "yogi-mart";
/**
 * The Best Deals threshold: DEALS_MIN_DISCOUNT in lib/storefront/homeSections.ts
 * where that module exists, otherwise the /search?minDiscount= literal in
 * components/home/FlashSale.jsx. The test suite checks it against both.
 */
export const DEALS_MIN_DISCOUNT = 40;

export const EXPECTED_SELLER_TARGETS = 2; // vendors + vendors_public
export const EXPECTED_PRODUCT_TARGETS = 8;

// ---- catalogue ---------------------------------------------------------------

export type SyntheticSeller = {
  uid: string; // not a Firebase Auth user; nobody can sign in as it
  vendorDocId: string;
  sellerNumber: string;
  businessName: string;
  fullName: string;
};

export type TestProduct = {
  id: string;
  title: string;
  /** categoryId, subCategoryId, leafCategoryId — ProductForm stores path[0], path[1], last. */
  path: [string, string, string];
  mrp: number;
  sellingPrice: number;
  gstRate: number; // a GST slab; synthetic test value, not tax advice
  stock: number;
  /** Site-relative path of an existing file under public/. */
  image: string;
  featured: boolean;
  sales: number; // synthetic counters so Trending / Best Sellers have an order
  views: number;
};

export type Catalogue = { seller: SyntheticSeller; products: TestProduct[] };

export const CATALOGUE: Catalogue = {
  seller: {
    uid: "test-seller-yomico-preview",
    vendorDocId: "test-seller-yomico-preview",
    sellerNumber: "SELLER99901", // matches SELLER_NUMBER_PATTERN; far above the Preview counter
    businessName: "TEST SELLER - YOMICO Preview",
    fullName: "TEST SELLER",
  },
  products: [
    { id: "test-product-01-smartphone", title: "TEST PRODUCT Smartphone 128 GB", path: ["MOBILES", "MOBILES_PHONES", "SMARTPHONES"],
      mrp: 15000, sellingPrice: 9000, gstRate: 18, stock: 12, image: "/banners/electronics-banner.png", featured: true, sales: 8, views: 120 },
    { id: "test-product-02-headphones", title: "TEST PRODUCT Wireless Headphones", path: ["ELECTRONICS", "ELECTRONICS_AUDIO", "HEADPHONES"],
      mrp: 2999, sellingPrice: 2999, gstRate: 18, stock: 20, image: "/banners/electronics-banner.png", featured: false, sales: 5, views: 90 },
    { id: "test-product-03-mens-tshirt", title: "TEST PRODUCT Men's Round Neck T-Shirt", path: ["FASHION", "FASHION_MEN", "MEN_TSHIRT_ROUND_NECK"],
      mrp: 799, sellingPrice: 599, gstRate: 5, stock: 25, image: "/man-fashion.jpg", featured: false, sales: 6, views: 70 },
    { id: "test-product-04-womens-kurti", title: "TEST PRODUCT Women's Cotton Kurti", path: ["FASHION", "FASHION_WOMEN", "WOMEN_KURTIS"],
      mrp: 1499, sellingPrice: 1199, gstRate: 5, stock: 18, image: "/woman-fashion.jpg", featured: true, sales: 4, views: 60 },
    { id: "test-product-05-rice", title: "TEST PRODUCT Basmati Rice 1 kg", path: ["GROCERY", "GROCERY_FOODGRAINS", "RICE"],
      mrp: 180, sellingPrice: 162, gstRate: 5, stock: 40, image: "/Grocery.jpg", featured: false, sales: 7, views: 50 },
    { id: "test-product-06-face-cream", title: "TEST PRODUCT Face Cream 50 g", path: ["BEAUTY", "BEAUTY_SKINCARE", "FACE_CREAM"],
      mrp: 499, sellingPrice: 449, gstRate: 18, stock: 30, image: "/product-placeholder.svg", featured: false, sales: 2, views: 40 },
    { id: "test-product-07-mixer-grinder", title: "TEST PRODUCT Mixer Grinder 750 W", path: ["APPLIANCES", "KITCHEN_APPLIANCES", "MIXER_GRINDERS"],
      mrp: 4999, sellingPrice: 3999, gstRate: 18, stock: 10, image: "/banners/electronics-banner1.png.jpg", featured: false, sales: 3, views: 35 },
    { id: "test-product-08-coffee-table", title: "TEST PRODUCT Wooden Coffee Table", path: ["FURNITURE", "LIVING_ROOM", "COFFEE_TABLES"],
      mrp: 6999, sellingPrice: 5599, gstRate: 18, stock: 6, image: "/Furniture.jpg", featured: false, sales: 1, views: 25 },
  ],
};

// ---- documents ---------------------------------------------------------------

type Timestamp = FieldValue;

/** Fields the server (create-product + the admin "approve" decision) owns, plus the test marker. */
const SERVER_PRODUCT_FIELDS = [
  "vendorId", "vendorName", "sales", "rating", "reviewCount", "views", "wishlistCount", "createdAt",
  "approvalStatus", "approved", "active", "featured", "rejectionReason", "moderatedAt", "moderatedBy",
  "testData",
] as const;
const ALLOWED_PRODUCT_FIELDS = new Set<string>([...SELLER_PRODUCT_FIELDS, ...SERVER_PRODUCT_FIELDS]);

/**
 * Seller fields that would carry personal, financial or consent data. The
 * synthetic seller must never have any of them (no real person stands behind
 * it, so nothing may record their details or their acceptance of an agreement).
 */
export const FORBIDDEN_SELLER_FIELDS = [
  "email", "businessPhone", "phone", "street", "unit", "zipCode", "address",
  "accountHolder", "bankName", "accountNumber", "ifsc", "panNumber", "aadhaarNumber",
  "gstNumber", "gstDocUrl", "aadhaarDocUrl", "chequeDocUrl", "agreed",
] as const;

export function discountPercent(mrp: number, sellingPrice: number): number {
  return ((mrp - sellingPrice) / mrp) * 100;
}

export function productDoc(p: TestProduct, seller: SyntheticSeller, now: Timestamp): DocumentData {
  return {
    // seller-form fields (lib/products/sellerProductFields.ts)
    sku: p.id.toUpperCase(),
    slug: p.id,
    categoryId: p.path[0],
    subCategoryId: p.path[1],
    leafCategoryId: p.path[2],
    title: p.title,
    shortTitle: p.title,
    description: "Synthetic test product for the YOMICO Preview environment. Not a real listing and not for sale.",
    brand: "TEST BRAND",
    model: p.id.toUpperCase(),
    mrp: p.mrp,
    sellingPrice: p.sellingPrice,
    discount: p.mrp > 0 ? Math.round(discountPercent(p.mrp, p.sellingPrice)) : 0, // as ProductForm computes it
    currency: "INR",
    gstRate: p.gstRate,
    stock: p.stock,
    returnDays: 7,
    thumbnail: p.image,
    images: [p.image],
    // server-owned fields (app/api/seller/create-product)
    vendorId: seller.uid,
    vendorName: seller.businessName,
    sales: p.sales,
    rating: 0,
    reviewCount: 0,
    views: p.views,
    wishlistCount: 0,
    createdAt: now,
    // the admin "approve" decision (lib/products/moderation.ts) + featured flag
    approvalStatus: "approved",
    approved: true,
    active: true,
    featured: p.featured,
    rejectionReason: null,
    moderatedAt: now,
    moderatedBy: "preview-test-catalogue-script",
    testData: true,
  };
}

export function vendorDoc(seller: SyntheticSeller, productCount: number, now: Timestamp): DocumentData {
  return {
    uid: seller.uid,
    fullName: seller.fullName,
    businessName: seller.businessName,
    businessType: "Test",
    city: "Test City",
    state: "Test State",
    sellerNumber: seller.sellerNumber,
    status: "Approved",
    kycStatus: "Approved",
    taxProfile: { gstStatus: "UNREGISTERED" },
    storeLogo: "",
    storeBanner: "",
    rating: 0,
    totalProducts: productCount,
    commissionRate: 0,
    totalSales: 0,
    totalOrders: 0,
    totalRevenue: 0,
    pendingPayout: 0,
    createdAt: now,
    testData: true,
  };
}

export function vendorPublicDoc(seller: SyntheticSeller, now: Timestamp): DocumentData {
  return {
    uid: seller.uid,
    businessName: seller.businessName,
    fullName: seller.fullName,
    businessType: "Test",
    city: "Test City",
    state: "Test State",
    storeLogo: "",
    storeBanner: "",
    rating: 0,
    totalOrders: 0,
    totalSales: 0,
    totalRevenue: 0,
    status: "Approved",
    createdAt: now,
    testData: true,
  };
}

// ---- targets -----------------------------------------------------------------

export type TargetCollection = "vendors" | "vendors_public" | "products";

export type Target = {
  collection: TargetCollection;
  id: string;
  build: (now: Timestamp) => DocumentData;
  /** The stored document is OUR test document: test marker, TEST identity, test-seller ownership. */
  isTest: (data: DocumentData) => boolean;
};

const startsWith = (v: unknown, prefix: string) => typeof v === "string" && v.startsWith(prefix);

export function buildTargets(cat: Catalogue): Target[] {
  const { seller } = cat;
  return [
    {
      collection: "vendors",
      id: seller.vendorDocId,
      build: (now) => vendorDoc(seller, cat.products.length, now),
      isTest: (d) => d.testData === true && d.uid === seller.uid && d.sellerNumber === seller.sellerNumber
        && startsWith(d.businessName, "TEST "),
    },
    {
      collection: "vendors_public",
      id: seller.uid,
      build: (now) => vendorPublicDoc(seller, now),
      isTest: (d) => d.testData === true && d.uid === seller.uid && startsWith(d.businessName, "TEST "),
    },
    ...cat.products.map((p): Target => ({
      collection: "products",
      id: p.id,
      build: (now) => productDoc(p, seller, now),
      isTest: (d) => d.testData === true && startsWith(d.title, "TEST PRODUCT ") && d.vendorId === seller.uid,
    })),
  ];
}

// ---- catalogue self-validation ------------------------------------------------

const DOC_ID = /^[a-z0-9][a-z0-9-]{0,99}$/;
const IMAGE_PATH = /^\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".svg", ".webp"]);

/** Error for an image path that is not a safe, existing file under publicDir; null when valid. */
export function imagePathError(image: unknown, publicDir: string): string | null {
  if (typeof image !== "string" || !IMAGE_PATH.test(image)) {
    return `image ${JSON.stringify(image)} must be a site-relative path like "/name.jpg" (letters, digits, . _ - /)`;
  }
  const segments = image.slice(1).split("/");
  if (segments.some((s) => s === "" || s === "." || s === "..")) {
    return `image ${image} contains an empty, "." or ".." path segment`;
  }
  if (!IMAGE_EXTENSIONS.has(path.extname(image).toLowerCase())) {
    return `image ${image} is not a .png, .jpg, .jpeg, .svg or .webp file`;
  }
  const root = path.resolve(publicDir);
  const file = path.resolve(root, ...segments);
  if (!file.startsWith(root + path.sep)) return `image ${image} resolves outside public/`;
  let stat: fs.Stats;
  try {
    stat = fs.lstatSync(file);
  } catch {
    return `image ${image} does not exist under public/`;
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return `image ${image} is not a regular file under public/`;
  const realRoot = fs.realpathSync(root);
  if (!fs.realpathSync(file).startsWith(realRoot + path.sep)) return `image ${image} resolves outside public/`;
  return null;
}

/** Error for a category path that is not a real top > second-level > descendant chain; null when valid. */
export function categoryPathError([top, sub, leaf]: [string, string, string]): string | null {
  const chain: string[] = [];
  let node = findNodeById(leaf);
  if (!node) return `unknown leaf category ${leaf}`;
  while (node) {
    chain.unshift(node.id);
    if (!node.parentId) break;
    const parent = findNodeById(node.parentId);
    if (!parent) return `category ${node.id} has an unknown parent ${node.parentId}`;
    node = parent;
  }
  const root = findNodeById(chain[0]);
  if (chain[0] !== top || !root || !isTopLevelCategory(root)) {
    return `${leaf}'s top-level category is ${chain[0]}, not ${top}`;
  }
  if (chain.length < 2 || chain[1] !== sub) {
    return `${leaf}'s second-level category is ${chain[1] ?? "(none)"}, not ${sub}`;
  }
  return null;
}

/**
 * Every problem with the catalogue definition; empty when it is valid. Runs
 * without any database access and is checked before every read or write.
 */
export function validateCatalogue(cat: Catalogue, publicDir: string): string[] {
  const errors: string[] = [];
  const targets = buildTargets(cat);
  const now = FieldValue.serverTimestamp();
  const sellerTargets = targets.filter((t) => t.collection !== "products");
  const productTargets = targets.filter((t) => t.collection === "products");

  if (sellerTargets.length !== EXPECTED_SELLER_TARGETS || productTargets.length !== EXPECTED_PRODUCT_TARGETS) {
    errors.push(`expected exactly ${EXPECTED_SELLER_TARGETS} seller and ${EXPECTED_PRODUCT_TARGETS} product targets, found ${sellerTargets.length} and ${productTargets.length}`);
  }
  for (const collection of ["vendors", "vendors_public", "products"] as const) {
    const ids = targets.filter((t) => t.collection === collection).map((t) => t.id);
    const dupes = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
    if (dupes.length) errors.push(`duplicate ${collection} ids: ${dupes.join(", ")}`);
  }
  for (const t of targets) {
    if (!DOC_ID.test(t.id)) errors.push(`${t.collection} id ${JSON.stringify(t.id)} must be lowercase letters, digits and hyphens`);
  }

  // seller
  const { seller } = cat;
  if (!startsWith(seller.businessName, "TEST ")) errors.push("seller businessName must start with \"TEST \"");
  if (!startsWith(seller.fullName, "TEST")) errors.push("seller fullName must start with \"TEST\"");
  if (!SELLER_NUMBER_PATTERN.test(seller.sellerNumber)) errors.push(`sellerNumber ${seller.sellerNumber} does not match ${SELLER_NUMBER_PATTERN}`);
  for (const t of sellerTargets) {
    const d = t.build(now);
    if (d.testData !== true) errors.push(`${t.collection}/${t.id} is not marked testData: true`);
    if (!t.isTest(d)) errors.push(`${t.collection}/${t.id} does not carry its own test identity markers`);
    const forbidden = FORBIDDEN_SELLER_FIELDS.filter((f) => f in d);
    if (forbidden.length) errors.push(`${t.collection}/${t.id} carries personal, financial or consent fields: ${forbidden.join(", ")}`);
    if (d.status !== "Approved") errors.push(`${t.collection}/${t.id} status must be "Approved"`);
  }

  // products
  for (const p of cat.products) {
    const where = `products/${p.id}`;
    if (!startsWith(p.title, "TEST PRODUCT ")) errors.push(`${where} title must start with "TEST PRODUCT "`);
    const d = productDoc(p, seller, now);
    if (d.testData !== true) errors.push(`${where} is not marked testData: true`);
    const unknown = Object.keys(d).filter((k) => !ALLOWED_PRODUCT_FIELDS.has(k));
    if (unknown.length) errors.push(`${where} has fields outside the product schema: ${unknown.join(", ")}`);
    const money = validateSellerProductMoney(d);
    if (!money.ok) errors.push(`${where}: ${money.errors.join(" ")}`);
    if (!(p.mrp >= p.sellingPrice)) errors.push(`${where} MRP must be at least the selling price`);
    if (!isProductVisible(d)) errors.push(`${where} would not be customer-visible`);
    const pathError = categoryPathError(p.path);
    if (pathError) errors.push(`${where}: ${pathError}`);
    const imageError = imagePathError(p.image, publicDir);
    if (imageError) errors.push(`${where}: ${imageError}`);
    // The stored discount and the app's own deals filter must agree with the exact maths.
    const exact = discountPercent(p.mrp, p.sellingPrice);
    if (d.discount !== Math.round(exact)) errors.push(`${where} stored discount ${d.discount} != round(${exact})`);
    if (meetsMinimumDiscount(toLegacyProduct(p.id, d), DEALS_MIN_DISCOUNT) !== exact >= DEALS_MIN_DISCOUNT) {
      errors.push(`${where} disagrees with the app's ${DEALS_MIN_DISCOUNT}% filter`);
    }
  }
  const exactly40 = cat.products.filter((p) => discountPercent(p.mrp, p.sellingPrice) === DEALS_MIN_DISCOUNT);
  if (!exactly40.some((p) => meetsMinimumDiscount(toLegacyProduct(p.id, productDoc(p, seller, now)), DEALS_MIN_DISCOUNT))) {
    errors.push(`no product is at exactly ${DEALS_MIN_DISCOUNT}% off and accepted by the app's filter`);
  }
  if (!cat.products.some((p) => p.mrp === p.sellingPrice)) errors.push("no product is at 0% discount");
  return errors;
}

// ---- target, project and credential guards ------------------------------------

export type Mode = "seed" | "cleanup";
export type Request = { mode: Mode; apply: boolean; project: string; emulator: boolean };
type Guard<T> = { ok: true; value: T } | { ok: false; error: string };

/** The CLI request, or why it is refused. Pure: reads only the given args and env. */
export function resolveRequest(args: string[], env: NodeJS.ProcessEnv): Guard<Request> {
  const refuse = (error: string): Guard<Request> => ({ ok: false, error });
  const [mode, ...rest] = args;
  if (mode !== "seed" && mode !== "cleanup") return refuse('first argument must be "seed" or "cleanup"');
  let project: string | undefined;
  let apply = false;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "--apply") {
      apply = true;
    } else if (rest[i] === "--project") {
      if (project !== undefined) return refuse("--project given more than once");
      project = rest[++i];
      if (!project || project.startsWith("-")) return refuse("--project needs a value");
    } else {
      return refuse(`unknown argument ${JSON.stringify(rest[i])}`);
    }
  }
  if (!project) return refuse(`--project is required (exactly "${PREVIEW_PROJECT_ID}")`);
  if (project === PRODUCTION_PROJECT_ID) return refuse(`"${PRODUCTION_PROJECT_ID}" is the PRODUCTION project`);
  const emulator = !!env.FIRESTORE_EMULATOR_HOST;
  if (emulator) {
    if (!project.startsWith("demo-")) return refuse("with FIRESTORE_EMULATOR_HOST set, --project must be a demo-* emulator project");
  } else if (project !== PREVIEW_PROJECT_ID) {
    return refuse(`--project must be exactly "${PREVIEW_PROJECT_ID}"`);
  }
  for (const v of ["GOOGLE_CLOUD_PROJECT", "GCLOUD_PROJECT"]) {
    if (env[v] && env[v] !== project) return refuse(`${v} is set to a different project`);
  }
  return { ok: true, value: { mode, apply, project, emulator } };
}

/**
 * Admin SDK options for the request, after verifying the credential belongs to
 * yomico-preview (emulator: no credential). Never returns or prints key content.
 */
export function verifiedAppOptions(request: Request, env: NodeJS.ProcessEnv): Guard<AppOptions> {
  const refuse = (error: string): Guard<AppOptions> => ({ ok: false, error });
  if (request.emulator) return { ok: true, value: { projectId: request.project } };
  const keyPath = env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!keyPath) return refuse(`GOOGLE_APPLICATION_CREDENTIALS must point to a ${PREVIEW_PROJECT_ID} service-account key file`);
  let key: { project_id?: unknown; client_email?: unknown; private_key?: unknown };
  try {
    key = JSON.parse(fs.readFileSync(keyPath, "utf8"));
  } catch {
    return refuse("the credential file could not be read as JSON"); // its content is never printed
  }
  if (key === null || typeof key !== "object") return refuse("the credential file is not a service-account key");
  if (key.project_id !== PREVIEW_PROJECT_ID) {
    return refuse(`the credential's project_id is ${JSON.stringify(String(key.project_id)).slice(0, 80)}, not "${PREVIEW_PROJECT_ID}"`);
  }
  if (typeof key.client_email !== "string" || !key.client_email.endsWith(`@${PREVIEW_PROJECT_ID}.iam.gserviceaccount.com`)) {
    return refuse(`the credential's service account does not belong to "${PREVIEW_PROJECT_ID}"`);
  }
  if (typeof key.private_key !== "string") return refuse("the credential has no private key");
  return { ok: true, value: { projectId: PREVIEW_PROJECT_ID, credential: cert(key as Parameters<typeof cert>[0]) } };
}

let appCount = 0;
/** Firestore for already-verified options (verifiedAppOptions). */
export function openFirestore(options: AppOptions): Firestore {
  return getFirestore(initializeApp(options, `preview-test-catalogue-${++appCount}`));
}

// ---- transactional seed and cleanup ---------------------------------------------

/** A refusal: nothing was written or deleted. */
export class CatalogueRefusal extends Error {
  constructor(message: string, readonly paths: string[] = []) {
    super(message);
    this.name = "CatalogueRefusal";
  }
}

export type RunOptions = {
  apply: boolean;
  publicDir: string;
  log?: (line: string) => void;
  /**
   * TEST-ONLY hook, never set by the CLI: runs inside the transaction after
   * validation and before any write/delete is staged, to prove that a
   * concurrent change cannot slip in between the check and the write.
   */
  afterValidate?: (attempt: number) => Promise<void>;
};

export type PlanEntry = { path: string; action: "create" | "replace" | "delete" | "skip (not present)" };
export type RunResult = { applied: boolean; plan: PlanEntry[]; attempts: number; notes: string[] };

function assertValidCatalogue(cat: Catalogue, publicDir: string) {
  const errors = validateCatalogue(cat, publicDir);
  if (errors.length) throw new CatalogueRefusal(`invalid catalogue definition — nothing read or written:\n  - ${errors.join("\n  - ")}`);
}

/** Existing targets that are NOT our test documents (wrong path, marker, identity or owner). */
function foreignDocuments(targets: Target[], snaps: DocumentSnapshot[]): string[] {
  return targets
    .map((t, i) => ({ t, s: snaps[i] }))
    .filter(({ t, s }) => s.exists && (s.ref.parent.id !== t.collection || s.id !== t.id || !t.isTest(s.data() || {})))
    .map(({ t }) => `${t.collection}/${t.id}`);
}

/**
 * Create or re-seed the ten test documents in ONE transaction: all ten are read
 * (and, on the server SDK, locked) first; if any existing one is not our test
 * document the transaction aborts and nothing is written. Dry run: the same
 * reads in a read-only transaction, no writes.
 */
export async function seed(db: Firestore, cat: Catalogue, opts: RunOptions): Promise<RunResult> {
  assertValidCatalogue(cat, opts.publicDir);
  const targets = buildTargets(cat);
  const refs = targets.map((t) => db.collection(t.collection).doc(t.id));
  let attempts = 0;
  let plan: PlanEntry[] = [];
  await db.runTransaction(
    async (tx) => {
      attempts++;
      const snaps = await tx.getAll(...refs);
      const foreign = foreignDocuments(targets, snaps);
      if (foreign.length) {
        throw new CatalogueRefusal(`these ids hold documents that are not this script's test documents; nothing written: ${foreign.join(", ")}`, foreign);
      }
      plan = targets.map((t, i) => ({ path: `${t.collection}/${t.id}`, action: snaps[i].exists ? "replace" : "create" }));
      if (!opts.apply) return;
      await opts.afterValidate?.(attempts);
      const now = FieldValue.serverTimestamp();
      targets.forEach((t, i) => tx.set(refs[i], t.build(now)));
    },
    opts.apply ? { maxAttempts: 5 } : { readOnly: true }
  );
  const log = opts.log ?? (() => {});
  for (const e of plan) log(`${opts.apply ? "[APPLY]" : "[DRY] "} ${e.action.padEnd(7)} ${e.path}`);
  return { applied: opts.apply, plan, attempts, notes: [] };
}

/**
 * Delete the ten test documents in ONE transaction, all or nothing: every
 * present target must still be our test document, otherwise nothing at all
 * is deleted. Never touches any other document. Other testData documents are
 * only reported. Dry run: the same reads in a read-only transaction.
 */
export async function cleanup(db: Firestore, cat: Catalogue, opts: RunOptions): Promise<RunResult> {
  assertValidCatalogue(cat, opts.publicDir);
  const targets = buildTargets(cat);
  const refs = targets.map((t) => db.collection(t.collection).doc(t.id));
  let attempts = 0;
  let plan: PlanEntry[] = [];
  await db.runTransaction(
    async (tx) => {
      attempts++;
      const snaps = await tx.getAll(...refs);
      const foreign = foreignDocuments(targets, snaps);
      if (foreign.length) {
        throw new CatalogueRefusal(`these ids hold documents that are not this script's test documents; nothing deleted: ${foreign.join(", ")}`, foreign);
      }
      plan = targets.map((t, i) => ({ path: `${t.collection}/${t.id}`, action: snaps[i].exists ? "delete" : "skip (not present)" }));
      if (!opts.apply) return;
      await opts.afterValidate?.(attempts);
      snaps.forEach((s, i) => { if (s.exists) tx.delete(refs[i]); });
    },
    opts.apply ? { maxAttempts: 5 } : { readOnly: true }
  );
  const notes: string[] = [];
  for (const collection of ["vendors", "vendors_public", "products"] as const) {
    const known = new Set(targets.filter((t) => t.collection === collection).map((t) => t.id));
    const others = await db.collection(collection).where("testData", "==", true).get();
    for (const d of others.docs) if (!known.has(d.id)) notes.push(`${collection}/${d.id}`);
  }
  const log = opts.log ?? (() => {});
  for (const e of plan) log(`${opts.apply && e.action === "delete" ? "[APPLY]" : "[DRY] "} ${e.action} ${e.path}`);
  for (const n of notes) log(`[note]  ${n} has testData but is not one of the ten targets — left untouched`);
  return { applied: opts.apply, plan, attempts, notes };
}
