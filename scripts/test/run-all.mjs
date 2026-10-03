#!/usr/bin/env node
/*
 * Runs the automated test suites listed in scripts/test/suites.mjs.
 *
 *   npm test                    every suite except the known baseline failures
 *   npm test -- storefront kyc  only the named suites (prefix match)
 *   npm test -- --list          print the suite list
 *   npm test -- --known         also run the known baseline failures (suites.mjs)
 *
 * Every emulator suite runs inside its own `firebase emulators:exec` with a demo-*
 * project, so nothing reaches a real Firebase project, and no suite sees another's
 * data. Razorpay is replaced by the in-repo fake (harness tsconfig). No real
 * credential is read: the emulator suites refuse to run without the emulator.
 *
 * Exit code is non-zero if any suite fails. Works on Windows, macOS and Linux
 * (paths are built with node:path, commands go through the platform shell).
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { suites, excluded, KNOWN_BASELINE_FAILURES } from "./suites.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const harnessTsconfig = path.join("scripts", "test", "mobile-variant", "tsconfig.harness.json");

const args = process.argv.slice(2);
if (args.includes("--list")) {
  for (const s of suites) {
    console.log(`${s.name.padEnd(28)} ${(s.emulators || "(no emulator)").padEnd(18)} ${s.knownBaselineFailure ? "KNOWN BASELINE FAILURE" : ""}`);
  }
  process.exit(0);
}

const wanted = args.filter((a) => !a.startsWith("--"));
const includeKnown = args.includes("--known");
// Named suites always run; otherwise the known baseline failures only with --known.
const selected = wanted.length
  ? suites.filter((s) => wanted.some((w) => s.name.startsWith(w)))
  : suites.filter((s) => includeKnown || !s.knownBaselineFailure);
if (!selected.length) {
  console.error(`No suite matches: ${wanted.join(", ")}. Use --list.`);
  process.exit(2);
}

// Drop anything that could point a suite at a real project.
const env = { ...process.env };
for (const k of [
  "FIREBASE_SERVICE_ACCOUNT_KEY",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "RAZORPAY_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "GEMINI_API_KEY",
]) delete env[k];

const q = (s) => `"${s.replace(/\\/g, "/")}"`;

function commandFor(s) {
  const tsx = ["npx", "tsx", ...(s.harness ? ["--tsconfig", q(harnessTsconfig)] : []), q(s.file)].join(" ");
  if (!s.emulators) return tsx;
  return `npx firebase emulators:exec --only ${s.emulators} --project ${s.project} ${JSON.stringify(tsx.replace(/"/g, ""))}`;
}

const results = [];
for (const s of selected) {
  console.log(`\n=== ${s.name} ===`);
  const started = Date.now();
  const r = spawnSync(commandFor(s), { cwd: root, env, shell: true, stdio: "inherit" });
  const ok = r.status === 0;
  results.push({ name: s.name, ok, code: r.status, secs: ((Date.now() - started) / 1000).toFixed(0) });
  console.log(`=== ${s.name}: ${ok ? "PASS" : `FAIL (exit ${r.status})`} ===`);
}

console.log("\n----- summary -----");
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name.padEnd(28)} ${r.secs}s`);
if (!wanted.length) {
  for (const e of excluded) console.log(`EXCLUDED  ${e.name}: ${e.reason}`);
  if (!includeKnown) {
    for (const [name, why] of Object.entries(KNOWN_BASELINE_FAILURES)) {
      console.log(`NOT RUN (known baseline failure on e88d1aa)  ${name}: ${why}`);
    }
  }
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed, ${results.length} run`);
process.exit(failed.length ? 1 : 0);
