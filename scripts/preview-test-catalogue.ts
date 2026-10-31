/**
 * Synthetic TEST catalogue for the YOMICO Preview Firebase project.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  PREVIEW / EMULATOR ONLY. Refuses every project except `yomico-preview`
 *  (or a local `demo-*` emulator project for rehearsal). Never `yogi-mart`.
 *  DRY-RUN by default: reads, prints the plan, writes nothing. Pass `--apply`.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Seeds one approved synthetic seller (vendors + vendors_public) and eight
 * approved TEST PRODUCT documents across existing categories, using fixed ids
 * (scripts/lib/previewTestCatalogue.ts holds the catalogue and all logic).
 * Every document carries `testData: true`. The synthetic seller has no real
 * identity, contact, address, bank, tax-ID or KYC data, and records no
 * acceptance of any seller agreement.
 *
 * Usage (from the repository root) — credential: a yomico-preview
 * service-account key FILE, referenced by path, never pasted anywhere:
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/yomico-preview-key.json
 *   npx tsx scripts/preview-test-catalogue.ts seed    --project yomico-preview          # dry run
 *   npx tsx scripts/preview-test-catalogue.ts seed    --project yomico-preview --apply  # write all ten
 *   npx tsx scripts/preview-test-catalogue.ts cleanup --project yomico-preview          # dry run
 *   npx tsx scripts/preview-test-catalogue.ts cleanup --project yomico-preview --apply  # delete all ten
 * Emulator rehearsal (no credential): FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 and
 *   --project demo-<anything>. Tests: npm test -- preview-test-catalogue
 *
 * Order of checks — each fails closed BEFORE anything later runs:
 *   1. arguments + target project (exactly yomico-preview; never yogi-mart;
 *      emulator only with a demo-* project; GOOGLE_CLOUD_PROJECT/GCLOUD_PROJECT
 *      must not name another project; unknown arguments are refused);
 *   2. catalogue self-validation (2 seller + 8 product targets, unique ids,
 *      TEST titles, testData markers, real category ancestry, safe existing
 *      public/ images, the app's own price and 40% discount rules);
 *   3. credential: the key's project_id and service-account email must belong
 *      to yomico-preview — checked before the Admin SDK is initialised;
 *   4. one Firestore transaction reads all ten targets; if ANY existing one is
 *      not this script's test document, nothing is written or deleted.
 *
 * Exit codes: 0 success (including dry run) · 2 refused, nothing written or
 * deleted · 1 unexpected error (the transaction either committed fully or not
 * at all).
 *
 * KNOWN LIMITS — read before seeding:
 *   - Cleanup deletes ONLY the ten listed documents. It never deletes orders,
 *     carts, reviews, product questions, wishlists, notifications, stock alerts
 *     or anything else a tester creates against these products or this seller.
 *   - Therefore: DO NOT place test orders, and NEVER make a real payment,
 *     against the synthetic seller or its TEST products. Browse, search and
 *     view only. The synthetic seller cannot fulfil, ship or refund anything.
 *
 * Never prints the credential, private key or service-account email.
 */

import path from "node:path";
import {
  CATALOGUE,
  CatalogueRefusal,
  cleanup,
  openFirestore,
  resolveRequest,
  seed,
  validateCatalogue,
  verifiedAppOptions,
} from "./lib/previewTestCatalogue";

const PUBLIC_DIR = path.resolve(__dirname, "..", "public");

function refuse(message: string): never {
  console.error(`REFUSING: ${message}`);
  process.exit(2);
}

async function main() {
  const request = resolveRequest(process.argv.slice(2), process.env);
  if (!request.ok) refuse(request.error);
  const { mode, apply, project, emulator } = request.value;

  const catalogueErrors = validateCatalogue(CATALOGUE, PUBLIC_DIR);
  if (catalogueErrors.length) refuse(`invalid catalogue definition:\n  - ${catalogueErrors.join("\n  - ")}`);

  const options = verifiedAppOptions(request.value, process.env);
  if (!options.ok) refuse(options.error);

  const db = openFirestore(options.value);
  console.log(`Target: ${emulator ? `EMULATOR ${process.env.FIRESTORE_EMULATOR_HOST} / ` : ""}project ${project} · mode ${mode} · ${apply ? "APPLY" : "dry run"}\n`);

  const run = mode === "seed" ? seed : cleanup;
  const result = await run(db, CATALOGUE, { apply, publicDir: PUBLIC_DIR, log: (line) => console.log(line) });
  const count = result.plan.filter((e) => e.action !== "skip (not present)").length;
  if (!apply) {
    console.log(`\nDRY-RUN — nothing ${mode === "seed" ? "written" : "deleted"}. Re-run with --apply.`);
  } else {
    console.log(`\n${mode === "seed" ? "Wrote" : "Deleted"} ${count} documents in one transaction (${result.attempts} attempt${result.attempts === 1 ? "" : "s"}) in ${project}.`);
  }
}

main().catch((error) => {
  if (error instanceof CatalogueRefusal) refuse(error.message);
  console.error("FAILED:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
