/*
 * LOCAL-ONLY emulator regression harness — Preview TEST catalogue seeder
 * (scripts/lib/previewTestCatalogue.ts, CLI scripts/preview-test-catalogue.ts).
 * ---------------------------------------------------------------------------
 *   1  seed dry run writes nothing
 *   2  seed --apply creates exactly 2 seller and 8 product documents
 *   3  re-seeding the script's own test documents restores them
 *   4  seed aborts atomically when one target id holds a non-test document
 *   5  cleanup deletes exactly the ten targets and nothing else
 *   6  cleanup aborts atomically when even one target fails validation
 *   7  unrelated testData records are never touched
 *   8  duplicate ids, bad ancestry, bad titles, unsafe or missing images and
 *      other invalid catalogues are rejected before any read or write
 *   9  a concurrent write during the transaction can never be overwritten or
 *      deleted unvalidated (control: the old check-then-write pattern can)
 *  10  wrong projects, credentials and emulator settings are refused (pure
 *      guards and the real CLI), and nothing secret is ever printed
 *
 * Firestore EMULATOR only (FIRESTORE_EMULATOR_HOST from `firebase emulators:exec`,
 * demo-* project). Never touches a real project.
 *
 * Run:
 *   npx firebase emulators:exec --only firestore --project demo-yomico-catalogue \
 *     "npx tsx scripts/test/preview-test-catalogue/run.mts"
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HOST = process.env.FIRESTORE_EMULATOR_HOST;
const PROJECT = "demo-yomico-catalogue";
if (!HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const PUBLIC_DIR = path.join(REPO, "public");
const core = await import("../../lib/previewTestCatalogue.ts");
const { CATALOGUE, CatalogueRefusal } = core;

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (ok) pass++; else fail++;
}

// ---- emulator access as a SEPARATE client (REST, rules bypassed) ----------------
const BASE = `http://${HOST}/v1/projects/${PROJECT}/databases/(default)/documents`;
const AUTH = { Authorization: "Bearer owner", "Content-Type": "application/json" };
type Json = string | number | boolean | null | Json[] | { [k: string]: Json };
const toValue = (v: Json): Record<string, unknown> =>
  v === null ? { nullValue: null }
  : typeof v === "boolean" ? { booleanValue: v }
  : typeof v === "number" ? (Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v })
  : typeof v === "string" ? { stringValue: v }
  : Array.isArray(v) ? { arrayValue: { values: v.map(toValue) } }
  : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toValue(x)])) } };
async function put(docPath: string, fields: Record<string, Json>, mask?: string[]) {
  const q = mask ? "?" + mask.map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&") : "";
  const res = await fetch(`${BASE}/${docPath}${q}`, { method: "PATCH", headers: AUTH, body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, toValue(v)])) }) });
  if (!res.ok) throw new Error(`put ${docPath}: ${res.status}`);
  return res.status;
}
type RestValue = { stringValue?: string; integerValue?: string; booleanValue?: boolean };
type RestDoc = { updateTime: string; fields: Record<string, RestValue> };
async function getDoc(docPath: string): Promise<RestDoc | null> {
  const res = await fetch(`${BASE}/${docPath}`, { headers: AUTH });
  if (res.status === 404) return null;
  const j = await res.json();
  return { updateTime: j.updateTime, fields: j.fields ?? {} };
}
const str = (doc: RestDoc | null, f: string) => doc?.fields[f]?.stringValue;
const COLLECTIONS = ["products", "vendors", "vendors_public", "orders", "cart", "productQuestions", "reviews", "wishlist"];
/** Every document in the relevant collections: path -> updateTime. */
async function snapshotAll(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of COLLECTIONS) {
    const res = await fetch(`${BASE}/${c}?pageSize=500`, { headers: AUTH });
    const j = await res.json();
    for (const d of j.documents ?? []) out.set(d.name.split("/documents/")[1], d.updateTime);
  }
  return out;
}
const same = (a: Map<string, string>, b: Map<string, string>) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
async function clearAll() {
  const res = await fetch(`http://${HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, { method: "DELETE" });
  if (!res.ok) throw new Error(`clear: ${res.status}`);
}

// ---- the script's own Firestore (verified options, emulator) ---------------------
const request = core.resolveRequest(["seed", "--project", PROJECT, "--apply"], process.env);
if (!request.ok) throw new Error(request.error);
const options = core.verifiedAppOptions(request.value, process.env);
if (!options.ok) throw new Error(options.error);
const db = core.openFirestore(options.value);
const run = { apply: true, publicDir: PUBLIC_DIR };
const dry = { apply: false, publicDir: PUBLIC_DIR };
const TARGET_PATHS = core.buildTargets(CATALOGUE).map((t) => `${t.collection}/${t.id}`);
const RICE = "products/test-product-05-rice";
const SELLER_UID = CATALOGUE.seller.uid;

async function refusal(p: Promise<unknown>) {
  try { await p; return null; } catch (e) { return e instanceof CatalogueRefusal ? e : (() => { throw e; })(); }
}
const presentTargets = async () => (await Promise.all(TARGET_PATHS.map(getDoc))).filter(Boolean).length;

try {
  // ---- 0: the shipped catalogue ----
  {
    const errors = core.validateCatalogue(CATALOGUE, PUBLIC_DIR);
    check("0 the shipped catalogue passes its own validation", errors.length === 0, errors.join("; "));
    // The Best Deals threshold is defined in lib/storefront/homeSections.ts
    // (DEALS_MIN_DISCOUNT) where that module exists, and as the literal
    // /search?minDiscount= link in components/home/FlashSale.jsx before it.
    // Read whichever is present: at least one definition is required, and
    // every one found must equal the threshold this script tests against.
    const thresholds = ([
      ["lib/storefront/homeSections.ts", /DEALS_MIN_DISCOUNT = (\d+);/],
      ["components/home/FlashSale.jsx", /minDiscount=(\d+)"/],
    ] as const)
      .filter(([file]) => fs.existsSync(path.join(REPO, file)))
      .map(([file, re]) => fs.readFileSync(path.join(REPO, file), "utf8").match(re)?.[1])
      .filter((v): v is string => v !== undefined);
    check("0 the 40% threshold matches the homepage Best Deals threshold",
      thresholds.length > 0 && thresholds.every((v) => Number(v) === core.DEALS_MIN_DISCOUNT),
      thresholds.length ? `found ${thresholds.join(", ")}` : "no threshold definition found");
    const phone = CATALOGUE.products.find((p) => p.id === "test-product-01-smartphone")!;
    check("0 the smartphone is exactly 40% off", core.discountPercent(phone.mrp, phone.sellingPrice) === 40);
  }

  // ---- 1: dry run ----
  await clearAll();
  {
    const before = await snapshotAll();
    const r = await core.seed(db, CATALOGUE, dry);
    const after = await snapshotAll();
    check("1 seed dry run plans 10 creates", r.plan.length === 10 && r.plan.every((e) => e.action === "create") && !r.applied);
    check("1 seed dry run writes nothing", same(before, after) && after.size === 0, `docs after: ${after.size}`);
  }

  // ---- 2: apply ----
  {
    const r = await core.seed(db, CATALOGUE, run);
    const all = await snapshotAll();
    const products = [...all.keys()].filter((k) => k.startsWith("products/"));
    const vendors = [...all.keys()].filter((k) => k.startsWith("vendors/"));
    const pub = [...all.keys()].filter((k) => k.startsWith("vendors_public/"));
    check("2 seed --apply creates exactly 1 vendors + 1 vendors_public + 8 products (10 total, one transaction)",
      r.applied && products.length === 8 && vendors.length === 1 && pub.length === 1 && all.size === 10,
      `products=${products.length} vendors=${vendors.length} vendors_public=${pub.length} total=${all.size} attempts=${r.attempts}`);
    check("2 exactly the ten allow-listed ids", TARGET_PATHS.every((p) => all.has(p)));
    const docs = await Promise.all(TARGET_PATHS.map(getDoc));
    check("2 every document carries testData: true", docs.every((d) => d?.fields.testData?.booleanValue === true));
    check("2 every product title starts with TEST PRODUCT and is owned by the test seller",
      docs.slice(2).every((d) => str(d, "title")?.startsWith("TEST PRODUCT ") && str(d, "vendorId") === SELLER_UID));
    const forbidden = docs.slice(0, 2).flatMap((d) => core.FORBIDDEN_SELLER_FIELDS.filter((f) => f in (d?.fields ?? {})));
    check("2 the synthetic seller has no agreed/consent, contact, address, bank or KYC fields", forbidden.length === 0, forbidden.join(","));
    const dryAgain = await snapshotAll();
    await core.seed(db, CATALOGUE, dry);
    await core.cleanup(db, CATALOGUE, dry);
    check("1 seed and cleanup dry runs on a seeded database change nothing", same(dryAgain, await snapshotAll()));
  }

  // ---- 3: re-seed own test documents ----
  {
    await put(RICE, { views: 999 }, ["views"]);
    const r = await core.seed(db, CATALOGUE, run);
    const rice = await getDoc(RICE);
    check("3 re-seed replaces the script's own test documents", r.plan.every((e) => e.action === "replace"));
    check("3 re-seed restores a test document's fields", rice?.fields.views?.integerValue === "50", `views=${rice?.fields.views?.integerValue}`);
    check("3 re-seed still leaves exactly ten documents", (await snapshotAll()).size === 10);
  }

  // ---- 4: seed aborts atomically on a foreign document ----
  for (const [label, docPath, fields] of [
    ["a non-test product", RICE, { title: "Real Basmati Rice" }],
    ["a testData product owned by another seller", RICE, { title: "TEST PRODUCT rice", testData: true, vendorId: "someone-else" }],
    ["a testData vendor with another uid", "vendors/test-seller-yomico-preview", { uid: "real-uid", businessName: "TEST SELLER - YOMICO Preview", sellerNumber: "SELLER99901", testData: true }],
  ] as [string, string, Record<string, Json>][]) {
    await clearAll();
    await put(docPath, fields);
    const before = await snapshotAll();
    const err = await refusal(core.seed(db, CATALOGUE, run));
    check(`4 seed refuses when a target id holds ${label}`, !!err && err.paths.includes(docPath), err?.message.split(":")[0]);
    check(`4 …and writes nothing at all (atomic)`, same(before, await snapshotAll()));
  }

  // ---- 5 + 7: cleanup deletes exactly the ten ----
  await clearAll();
  await core.seed(db, CATALOGUE, run);
  {
    await put("products/control-real-product", { title: "Real product", approvalStatus: "approved", active: true });
    await put("products/stray-test-product", { title: "TEST PRODUCT stray", testData: true, vendorId: SELLER_UID });
    await put("vendors/stray-test-vendor", { uid: "stray", businessName: "TEST other", testData: true });
    await put("orders/test-order-1", { items: [{ productId: "test-product-01-smartphone" }], vendorIds: [SELLER_UID] });
    await put("cart/some-user", { items: [{ productId: "test-product-02-headphones" }] });
    await put("productQuestions/q1", { productId: "test-product-03-mens-tshirt", question: "Size?" });
    await put("reviews/r1", { productId: "test-product-04-womens-kurti", rating: 5 });
    await put("wishlist/w1", { productId: "test-product-05-rice" });
    const before = await snapshotAll();
    const r = await core.cleanup(db, CATALOGUE, run);
    const after = await snapshotAll();
    const deleted = [...before.keys()].filter((k) => !after.has(k)).sort();
    check("5 cleanup deletes exactly the ten allow-listed documents",
      deleted.length === 10 && deleted.join() === [...TARGET_PATHS].sort().join(), deleted.join(","));
    check("5 orders, carts, questions, reviews, wishlists and the real product are untouched",
      ["products/control-real-product", "orders/test-order-1", "cart/some-user", "productQuestions/q1", "reviews/r1", "wishlist/w1"].every((k) => after.get(k) === before.get(k)));
    check("7 unrelated testData records are left untouched and only reported",
      after.get("products/stray-test-product") === before.get("products/stray-test-product")
        && after.get("vendors/stray-test-vendor") === before.get("vendors/stray-test-vendor")
        && r.notes.includes("products/stray-test-product") && r.notes.includes("vendors/stray-test-vendor"));
  }

  // ---- 6: cleanup aborts atomically ----
  for (const [label, docPath, fields, mask] of [
    ["a seller record lost its testData marker", "vendors_public/test-seller-yomico-preview", { testData: false }, ["testData"]],
    ["a product changed owner", "products/test-product-07-mixer-grinder", { vendorId: "real-seller" }, ["vendorId"]],
    ["a product was renamed without TEST PRODUCT", "products/test-product-08-coffee-table", { title: "Coffee Table" }, ["title"]],
  ] as [string, string, Record<string, Json>, string[]][]) {
    await clearAll();
    await core.seed(db, CATALOGUE, run);
    await put(docPath, fields, mask);
    const before = await snapshotAll();
    const err = await refusal(core.cleanup(db, CATALOGUE, run));
    check(`6 cleanup refuses when ${label}`, !!err && err.paths.includes(docPath));
    check("6 …and deletes nothing at all (all ten still present)", same(before, await snapshotAll()) && (await presentTargets()) === 10);
  }

  // ---- 8: invalid catalogue definitions ----
  await clearAll();
  {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-public-"));
    const outside = path.join(os.tmpdir(), `outside-${process.pid}.png`);
    fs.writeFileSync(outside, "x");
    fs.mkdirSync(path.join(tmp, "img"));
    fs.writeFileSync(path.join(tmp, "img", "ok.png"), "x");
    fs.symlinkSync(outside, path.join(tmp, "img", "link.png"));
    check("8 image guard accepts a real file and rejects a symlink pointing outside public/",
      core.imagePathError("/img/ok.png", tmp) === null && /regular file|outside/.test(core.imagePathError("/img/link.png", tmp) ?? ""));
    fs.rmSync(tmp, { recursive: true, force: true });
    fs.rmSync(outside, { force: true });

    const clone = () => JSON.parse(JSON.stringify(CATALOGUE)) as typeof CATALOGUE;
    const variant = (f: (c: typeof CATALOGUE) => void) => { const c = clone(); f(c); return c; };
    const cases: [string, typeof CATALOGUE, RegExp][] = [
      ["duplicate product id", variant((c) => { c.products[1].id = c.products[0].id; }), /duplicate products ids/],
      ["seven products", variant((c) => { c.products.pop(); }), /exactly 2 seller and 8 product/],
      ["nine products", variant((c) => { c.products.push({ ...c.products[1], id: "test-product-09-extra" }); }), /exactly 2 seller and 8 product/],
      ["wrong top-level category", variant((c) => { c.products[0].path = ["ELECTRONICS", "MOBILES_PHONES", "SMARTPHONES"]; }), /top-level category is MOBILES/],
      ["wrong second-level category", variant((c) => { c.products[0].path = ["MOBILES", "MOBILES_ACCESSORIES", "SMARTPHONES"]; }), /second-level category is MOBILES_PHONES/],
      ["unknown leaf category", variant((c) => { c.products[0].path = ["MOBILES", "MOBILES_PHONES", "NOT_A_CATEGORY"]; }), /unknown leaf category/],
      ["title without TEST PRODUCT", variant((c) => { c.products[2].title = "Men's T-Shirt"; }), /title must start with "TEST PRODUCT "/],
      ["missing image file", variant((c) => { c.products[3].image = "/does-not-exist.jpg"; }), /does not exist under public/],
      ["path traversal image", variant((c) => { c.products[3].image = "/../package.json"; }), /"\.\." path segment|site-relative/],
      ["encoded traversal image", variant((c) => { c.products[3].image = "/banners/..%2F..%2Fpackage.json"; }), /site-relative/],
      ["absolute URL image", variant((c) => { c.products[3].image = "https://example.com/x.jpg"; }), /site-relative/],
      ["non-image file", variant((c) => { c.products[3].image = "/manifest.json"; }), /not a \.png/],
      ["seller name without TEST", variant((c) => { c.seller.businessName = "Real Shop"; }), /businessName must start with "TEST "/],
      ["invalid seller number", variant((c) => { c.seller.sellerNumber = "S1"; }), /sellerNumber S1/],
      ["selling price above MRP", variant((c) => { c.products[4].sellingPrice = 999; }), /MRP must be at least/],
      ["no product at exactly 40%", variant((c) => { c.products[0].sellingPrice = 9001; }), /exactly 40% off/],
      ["uppercase / unsafe document id", variant((c) => { c.products[5].id = "Test/Product"; }), /lowercase letters/],
    ];
    for (const [label, cat, expect] of cases) {
      const errors = core.validateCatalogue(cat, PUBLIC_DIR);
      const before = await snapshotAll();
      const seedErr = await refusal(core.seed(db, cat, run));
      const cleanErr = await refusal(core.cleanup(db, cat, run));
      check(`8 rejects ${label} before any write`,
        errors.some((e) => expect.test(e)) && !!seedErr && !!cleanErr && same(before, await snapshotAll()),
        errors.find((e) => expect.test(e)) ?? errors.join("; "));
    }
  }

  // ---- 9: concurrency ----
  {
    // Control: the OLD pattern (check, then write later) overwrites a document
    // another client changed in between.
    await clearAll();
    await core.seed(db, CATALOGUE, run);
    const riceRef = db.doc(RICE);
    const okBefore = (await riceRef.get()).get("testData") === true;
    await put(RICE, { title: "REAL rice written concurrently", testData: false, vendorId: "real-seller" });
    await riceRef.set({ title: "TEST PRODUCT Basmati Rice 1 kg", testData: true, vendorId: SELLER_UID });
    check("9 control: the old check-then-write pattern DOES overwrite a concurrent real document (the race exists)",
      okBefore && str(await getDoc(RICE), "title")?.startsWith("TEST PRODUCT") === true);

    // Seed: another client writes a real document DURING the transaction.
    await clearAll();
    await core.seed(db, CATALOGUE, run);
    let external: Promise<number> | null = null;
    let externalDoneAt = 0;
    await core.seed(db, CATALOGUE, {
      ...run,
      afterValidate: async (attempt) => {
        if (attempt !== 1) return;
        external = put(RICE, { title: "REAL rice written concurrently", testData: false, vendorId: "real-seller" })
          .then((s) => { externalDoneAt = Date.now(); return s; });
        await new Promise((r) => setTimeout(r, 1000));
      },
    });
    const seedCommittedAt = Date.now();
    const extStatus = await external;
    const after = await getDoc(RICE);
    check("9 seed: the concurrent write is held until the transaction commits, then lands intact — never overwritten by the script",
      extStatus === 200 && externalDoneAt >= seedCommittedAt - 50 && str(after, "title") === "REAL rice written concurrently",
      `final title=${str(after, "title")}`);
    const before = await snapshotAll();
    const err = await refusal(core.seed(db, CATALOGUE, run));
    check("9 seed: a later run sees the real document and refuses without writing", !!err && same(before, await snapshotAll()));

    // Cleanup: another client writes a real document DURING the transaction.
    await clearAll();
    await core.seed(db, CATALOGUE, run);
    let external2: Promise<number> | null = null;
    let external2DoneAt = 0;
    await core.cleanup(db, CATALOGUE, {
      ...run,
      afterValidate: async (attempt) => {
        if (attempt !== 1) return;
        external2 = put(RICE, { title: "REAL rice written concurrently", testData: false })
          .then((s) => { external2DoneAt = Date.now(); return s; });
        await new Promise((r) => setTimeout(r, 1000));
      },
    });
    const cleanupCommittedAt = Date.now();
    await external2;
    const after2 = await getDoc(RICE);
    check("9 cleanup: the concurrent real document lands after the deletion and is never deleted by the script",
      external2DoneAt >= cleanupCommittedAt - 50 && str(after2, "title") === "REAL rice written concurrently");
    check("9 cleanup: the other nine targets were deleted", (await presentTargets()) === 1);
  }

  // ---- 10: guards ----
  {
    const emuEnv = { FIRESTORE_EMULATOR_HOST: HOST } as NodeJS.ProcessEnv;
    const realEnv = {} as NodeJS.ProcessEnv;
    const refused: [string, string[], NodeJS.ProcessEnv, RegExp][] = [
      ["no mode", [], realEnv, /first argument/],
      ["unknown mode", ["deploy", "--project", "yomico-preview"], realEnv, /first argument/],
      ["no --project", ["seed"], realEnv, /--project is required/],
      ["production project", ["seed", "--project", "yogi-mart", "--apply"], realEnv, /PRODUCTION/],
      ["production project under the emulator", ["cleanup", "--project", "yogi-mart"], emuEnv, /PRODUCTION/],
      ["another project", ["seed", "--project", "some-other-project"], realEnv, /exactly "yomico-preview"/],
      ["demo project without the emulator", ["seed", "--project", "demo-x"], realEnv, /exactly "yomico-preview"/],
      ["yomico-preview while FIRESTORE_EMULATOR_HOST is set", ["seed", "--project", "yomico-preview"], emuEnv, /demo-\*/],
      ["--project twice", ["seed", "--project", "yomico-preview", "--project", "yogi-mart"], realEnv, /more than once/],
      ["--project without a value", ["seed", "--project"], realEnv, /needs a value/],
      ["--project swallowing --apply", ["seed", "--project", "--apply"], realEnv, /needs a value/],
      ["a mistyped flag", ["seed", "--project", "yomico-preview", "--aply"], realEnv, /unknown argument/],
      ["GOOGLE_CLOUD_PROJECT naming production", ["seed", "--project", "yomico-preview"], { GOOGLE_CLOUD_PROJECT: "yogi-mart" }, /GOOGLE_CLOUD_PROJECT/],
      ["GCLOUD_PROJECT naming another project", ["seed", "--project", "yomico-preview"], { GCLOUD_PROJECT: "other" }, /GCLOUD_PROJECT/],
    ];
    for (const [label, args, env, expect] of refused) {
      const r = core.resolveRequest(args, env);
      check(`10 request refused: ${label}`, !r.ok && expect.test(r.error), r.ok ? "accepted!" : r.error);
    }
    const okReal = core.resolveRequest(["seed", "--project", "yomico-preview"], realEnv);
    check("10 request accepted: yomico-preview, dry run by default", okReal.ok && !okReal.value.apply && !okReal.value.emulator);

    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "catalogue-keys-"));
    const { privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, privateKeyEncoding: { type: "pkcs8", format: "pem" }, publicKeyEncoding: { type: "spki", format: "pem" } });
    const key = (projectId: string, email: string, extra: Record<string, unknown> = {}) =>
      JSON.stringify({ type: "service_account", project_id: projectId, private_key: privateKey, client_email: email, ...extra });
    const files: Record<string, string> = {
      prod: key("yogi-mart", "seed@yogi-mart.iam.gserviceaccount.com"),
      mixed: key("yomico-preview", "seed@yogi-mart.iam.gserviceaccount.com"),
      nokey: JSON.stringify({ project_id: "yomico-preview", client_email: "seed@yomico-preview.iam.gserviceaccount.com" }),
      notjson: `not json ${privateKey}`,
      nulljson: "null",
      good: key("yomico-preview", "seed@yomico-preview.iam.gserviceaccount.com"),
    };
    for (const [name, content] of Object.entries(files)) fs.writeFileSync(path.join(tmp, `${name}.json`), content);
    const req = okReal.ok ? okReal.value : (null as never);
    const cred = (name?: string) => core.verifiedAppOptions(req, name ? { GOOGLE_APPLICATION_CREDENTIALS: path.join(tmp, `${name}.json`) } : {});
    const credCases: [string, string | undefined, RegExp][] = [
      ["no credential", undefined, /GOOGLE_APPLICATION_CREDENTIALS/],
      ["missing file", "absent", /could not be read/],
      ["non-JSON file", "notjson", /could not be read/],
      ["JSON null", "nulljson", /not a service-account key/],
      ["a production (yogi-mart) key", "prod", /project_id is "yogi-mart"/],
      ["a yomico-preview project_id with another project's service account", "mixed", /does not belong/],
      ["a key without a private key", "nokey", /no private key/],
    ];
    const messages: string[] = [];
    for (const [label, file, expect] of credCases) {
      const r = cred(file);
      if (!r.ok) messages.push(r.error);
      check(`10 credential refused: ${label}`, !r.ok && expect.test(r.error), r.ok ? "accepted!" : r.error);
    }
    const good = cred("good");
    check("10 credential accepted: a yomico-preview key, pinned to projectId yomico-preview", good.ok && good.value.projectId === "yomico-preview");
    check("10 refusal messages never contain the private key or service-account email",
      messages.every((m) => !m.includes("PRIVATE KEY") && !m.includes("@") && !m.includes(privateKey.slice(40, 80))));

    // The real CLI, as a separate process: refuses before any Firebase access.
    const cli = (args: string[], env: NodeJS.ProcessEnv) => {
      const r = spawnSync("npx", ["tsx", "scripts/preview-test-catalogue.ts", ...args], { cwd: REPO, env: { PATH: process.env.PATH, HOME: process.env.HOME, ...env }, encoding: "utf8" });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    const cliCases: [string, string[], NodeJS.ProcessEnv][] = [
      ["production project", ["seed", "--project", "yogi-mart", "--apply"], {}],
      ["production key", ["seed", "--project", "yomico-preview", "--apply"], { GOOGLE_APPLICATION_CREDENTIALS: path.join(tmp, "prod.json") }],
      ["mixed key", ["cleanup", "--project", "yomico-preview", "--apply"], { GOOGLE_APPLICATION_CREDENTIALS: path.join(tmp, "mixed.json") }],
      ["non-JSON key file", ["seed", "--project", "yomico-preview"], { GOOGLE_APPLICATION_CREDENTIALS: path.join(tmp, "notjson.json") }],
      ["yomico-preview under the emulator", ["seed", "--project", "yomico-preview", "--apply"], { FIRESTORE_EMULATOR_HOST: HOST }],
    ];
    for (const [label, args, env] of cliCases) {
      const r = cli(args, env);
      check(`10 CLI exits 2 with REFUSING: ${label}`, r.code === 2 && /REFUSING/.test(r.out) && !/Target:/.test(r.out), `exit ${r.code}`);
      check(`10 CLI output contains no secret: ${label}`, !r.out.includes("PRIVATE KEY") && !r.out.includes(privateKey.slice(40, 80)) && !/@[a-z-]+\.iam\.gserviceaccount\.com/.test(r.out));
    }
    fs.rmSync(tmp, { recursive: true, force: true });

    // End-to-end through the real CLI against the emulator.
    await clearAll();
    const e2e = (args: string[]) => cli(args, { FIRESTORE_EMULATOR_HOST: HOST });
    const d = e2e(["seed", "--project", PROJECT]);
    const afterDry = (await snapshotAll()).size;
    const a = e2e(["seed", "--project", PROJECT, "--apply"]);
    const afterApply = await presentTargets();
    const c = e2e(["cleanup", "--project", PROJECT, "--apply"]);
    const afterCleanup = await presentTargets();
    check("10 CLI end to end: dry run 0 docs, apply 10, cleanup 0 (exit 0 each)",
      d.code === 0 && afterDry === 0 && a.code === 0 && afterApply === 10 && c.code === 0 && afterCleanup === 0,
      `exits ${d.code}/${a.code}/${c.code}, docs ${afterDry}/${afterApply}/${afterCleanup}`);
  }
} catch (e) {
  check("harness ran to completion", false, e instanceof Error ? e.stack ?? e.message : String(e));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
