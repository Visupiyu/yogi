/*
 * suppress-orphan-public-profile — emulator test.
 *
 * LOCAL EMULATOR TEST ONLY (refuses to run without FIRESTORE_EMULATOR_HOST).
 * Initialises firebase-admin directly against a demo project; never reads a
 * real credential. Proves scripts/ops/suppress-orphan-public-profile.ts:
 *   - dry run writes nothing (read-only transaction);
 *   - apply changes ONLY the five suppression fields, preserves every other
 *     field, and writes exactly one structured audit_logs entry;
 *   - refuses: missing profile, uid mismatch / absent, status not exactly
 *     Approved, unexpected suppression fields, an authoritative seller record,
 *     a legacy vendors/{uid} record, a vendors/{id} collision, invalid ids,
 *     invalid operator;
 *   - is idempotent (repeat apply = already-suppressed, no write) and safe
 *     under concurrency (five simultaneous applies -> one suppression, one
 *     audit entry);
 *   - refuses (never reports already-suppressed) when a seller record or a
 *     vendors/{id} document appears AFTER a profile was suppressed;
 *   - accepts only a local emulator host (127.0.0.1 / localhost / [::1] with a
 *     numeric port) and refuses remote or malformed hosts;
 *   - never touches any other document, never creates a vendors record;
 *   - as a CLI, refuses every unsafe configuration before Firebase is touched
 *     and prints no profile id.
 *
 *   npx firebase emulators:exec --only firestore --project demo-yomico-test \
 *     "npx tsx scripts/test/ops-suppress-profile/run.mts"
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  console.error("REFUSING TO RUN: FIRESTORE_EMULATOR_HOST is not set. Run under `firebase emulators:exec`.");
  process.exit(2);
}
const PROJECT_ID = "demo-yomico-test";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../../..");
const SCRIPT = "scripts/ops/suppress-orphan-public-profile.ts";

const { initializeApp } = await import("firebase-admin/app");
const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
const tool = await import("../../ops/suppress-orphan-public-profile.ts");

const app = initializeApp({ projectId: PROJECT_ID }, "ops-suppress-profile-test");
const db = getFirestore(app);
const ts = () => FieldValue.serverTimestamp();
const OPERATOR = "operator:test-admin";

type Res = { name: string; pass: boolean; detail: string };
const results: Res[] = [];
function record(name: string, pass: boolean, detail = "") {
  results.push({ name, pass, detail });
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const U = (s: string) => `${s}Uid000000000000000000000`.slice(0, 28);
const ID = {
  OK: U("orphanok"), OK2: U("orphantwo"), RACE: U("orphanrace"), MISSING: U("missing"), PENDING: U("pending"),
  LOWER: U("lowercase"), BLOCKED: U("blockedother"), MARKED: U("premarked"), SELLER: U("withseller"),
  LEGACY: U("legacydoc"), COLLIDE: U("collision"), UIDBAD: U("uidmismatch"), UIDNONE: U("uidabsent"),
};
const PII = { businessName: "Private Shop Name", city: "Hidden City", phone: "9876543210", email: "seller.private@example.com" };

async function clearAll() { for (const c of ["vendors_public", "vendors", "audit_logs", "products"]) await db.recursiveDelete(db.collection(c)); }
async function seed() {
  const pub = (id: string, data: Record<string, unknown>) =>
    db.collection("vendors_public").doc(id).set({ uid: id, status: "Approved", ...PII, storeLogo: "logo.png", rating: 0, nested: { a: 1, b: [1, 2] }, ...data });
  await pub(ID.OK, {}); await pub(ID.OK2, {}); await pub(ID.RACE, {});
  await pub(ID.PENDING, { status: "Pending" });
  await pub(ID.LOWER, { status: "approved" });
  await pub(ID.BLOCKED, { status: "Blocked" });
  await pub(ID.MARKED, { suppressedReason: "something else" });
  await pub(ID.SELLER, {}); await db.collection("vendors").add({ uid: ID.SELLER, status: "Blocked" });
  await pub(ID.LEGACY, {}); await db.collection("vendors").doc(ID.LEGACY).set({ status: "Approved" }); // legacy: no uid field
  await pub(ID.COLLIDE, {}); await db.collection("vendors").doc(ID.COLLIDE).set({ uid: U("someoneelse"), status: "Approved" });
  await pub(ID.UIDBAD, { uid: U("differentuid") });
  await db.collection("products").doc("unrelated").set({ vendorId: ID.OK, title: "x" });
}

async function snapshotAll(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const c of (await db.listCollections()).map((x) => x.id)) {
    for (const d of (await db.collection(c).get()).docs) out[`${c}/${d.id}`] = `${d.updateTime.toMillis()}`;
  }
  return out;
}
const diffKeys = (a: Record<string, string>, b: Record<string, string>) =>
  [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => a[k] !== b[k]);
const profile = async (id: string) => (await db.collection("vendors_public").doc(id).get()).data() as Record<string, any>;
const auditsFor = async (id: string) => (await db.collection("audit_logs").where("targetId", "==", id).get()).docs.map((d) => d.data());
const run = (profileId: string, apply: boolean, operator = OPERATOR) => tool.runSuppression(db, { profileId, operator, apply }, ts);

try {
  await clearAll();
  await seed();
  // vendors_public/UIDNONE: an Approved profile with NO uid field at all.
  await db.collection("vendors_public").doc(ID.UIDNONE).set({ status: "Approved", ...PII });

  // ---------- dry run ----------
  const s0 = await snapshotAll();
  const dry = await run(ID.OK, false);
  const s1 = await snapshotAll();
  record("dry run: outcome would-suppress, NOTHING written anywhere (every document's updateTime unchanged)",
    dry.kind === "would-suppress" && diffKeys(s0, s1).length === 0, `outcome=${dry.kind} changed=${diffKeys(s0, s1).length}`);

  // ---------- apply ----------
  const before = await profile(ID.OK);
  const applied = await run(ID.OK, true);
  const after = await profile(ID.OK);
  const s2 = await snapshotAll();
  const changedDocs = diffKeys(s1, s2);
  const auditDocsNew = changedDocs.filter((k) => k.startsWith("audit_logs/"));
  const fieldsChanged = [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k])).sort();
  record("apply: outcome suppressed; exactly the profile + one new audit_logs document changed",
    applied.kind === "suppressed" && changedDocs.length === 2 && changedDocs.includes(`vendors_public/${ID.OK}`) && auditDocsNew.length === 1,
    `outcome=${applied.kind} changed=${changedDocs.length} (profile + ${auditDocsNew.length} audit)`);
  record("apply: ONLY status, statusBeforeSuppression, suppressedReason, suppressedAt, suppressedBy changed — every other field identical",
    JSON.stringify(fieldsChanged) === JSON.stringify([...tool.SUPPRESSION_FIELDS].sort()) &&
      Object.keys(before).every((k) => k === "status" || JSON.stringify(before[k]) === JSON.stringify(after[k])),
    `changed=${fieldsChanged.join(",")}`);
  record("apply: values — status Blocked, statusBeforeSuppression Approved, the fixed reason, server timestamp, operator",
    after.status === "Blocked" && after.statusBeforeSuppression === "Approved" &&
      after.suppressedReason === "orphan public profile — no seller record" &&
      typeof after.suppressedAt?.toMillis === "function" && after.suppressedBy === OPERATOR && after.uid === ID.OK,
    `status=${after.status} by=${after.suppressedBy}`);
  const audits = await auditsFor(ID.OK);
  const a = audits[0];
  record("apply: one structured audit_logs entry (action, actor, target, from/to status, operation, fields, checks, timestamp)",
    audits.length === 1 && a.action === "vendor_public_profile_suppressed" && a.actorUid === OPERATOR && a.targetId === ID.OK &&
      a.details?.operation === "suppress-orphan-public-profile" && a.details?.collection === "vendors_public" &&
      a.details?.fromStatus === "Approved" && a.details?.toStatus === "Blocked" &&
      JSON.stringify(a.details?.fieldsChanged) === JSON.stringify([...tool.SUPPRESSION_FIELDS]) &&
      a.details?.checks?.sellerRecordsForUid === 0 && a.details?.checks?.vendorsDocumentWithId === false &&
      typeof a.createdAt?.toMillis === "function" && a.createdAt.toMillis() === after.suppressedAt.toMillis(),
    JSON.stringify(a?.details));
  record("apply: no vendors record was created; the unrelated product is untouched",
    (await db.collection("vendors").where("uid", "==", ID.OK).get()).empty && !(await db.collection("vendors").doc(ID.OK).get()).exists &&
      !changedDocs.some((k) => k.startsWith("vendors/") || k.startsWith("products/")),
    "");

  // ---------- idempotency ----------
  const again = await run(ID.OK, true);
  const againDry = await run(ID.OK, false);
  const s3 = await snapshotAll();
  record("repeat apply / dry run on a suppressed profile: already-suppressed, nothing written, still one audit entry",
    again.kind === "already-suppressed" && againDry.kind === "already-suppressed" && diffKeys(s2, s3).length === 0 && (await auditsFor(ID.OK)).length === 1,
    `apply=${again.kind} dry=${againDry.kind} changed=${diffKeys(s2, s3).length}`);

  // ---------- concurrency ----------
  const race = await Promise.all(Array.from({ length: 5 }, () => run(ID.RACE, true)));
  const raceAudits = await auditsFor(ID.RACE);
  record("concurrency: five simultaneous applies -> exactly one suppressed, four already-suppressed, one audit entry",
    race.filter((r) => r.kind === "suppressed").length === 1 && race.filter((r) => r.kind === "already-suppressed").length === 4 && raceAudits.length === 1,
    race.map((r) => r.kind).join(","));

  // ---------- refusals (each must write nothing) ----------
  const refusalCases: [string, string, string][] = [
    ["missing profile", ID.MISSING, "profile-not-found"],
    ["status Pending", ID.PENDING, "profile-status-is-not-Approved"],
    ["status lowercase 'approved'", ID.LOWER, "profile-status-is-not-Approved"],
    ["status Blocked (not suppressed by this tool)", ID.BLOCKED, "profile-status-is-not-Approved"],
    ["unexpected suppression field present", ID.MARKED, "profile-has-unexpected-suppression-fields"],
    ["authoritative seller record exists", ID.SELLER, "seller-record-exists-for-uid"],
    ["legacy vendors/{uid} record (no uid field)", ID.LEGACY, "vendors-document-with-this-id-exists"],
    ["vendors/{id} collision owned by another uid", ID.COLLIDE, "vendors-document-with-this-id-exists"],
    ["profile uid field differs from document id", ID.UIDBAD, "profile-uid-does-not-match-document-id"],
    ["profile uid field absent", ID.UIDNONE, "profile-uid-does-not-match-document-id"],
  ];
  const s4 = await snapshotAll();
  const refusalBad: string[] = [];
  for (const [name, id, reason] of refusalCases) {
    for (const apply of [false, true]) {
      const r = await run(id, apply);
      if (r.kind !== "refused" || r.reason !== reason) refusalBad.push(`${name} apply=${apply}: ${JSON.stringify(r)}`);
    }
  }
  const s5 = await snapshotAll();
  record(`refusals: all ${refusalCases.length} unsafe states refused with the exact reason, in dry run AND apply`, refusalBad.length === 0, refusalBad.join(" | ") || "all refused");
  record("refusals wrote nothing (every document unchanged, no audit entries)", diffKeys(s4, s5).length === 0, `changed=${diffKeys(s4, s5).length}`);

  const invalidIds = ["", " ", ` ${ID.OK2}`, `${ID.OK2} `, "a/b", "vendors_public/x", ".", "..", "__name__", "x".repeat(129), "bad id", "id*"];
  const badIdResults = await Promise.all(invalidIds.map((id) => run(id, true)));
  const badOperator = await run(ID.OK2, true, "x");
  const s6 = await snapshotAll();
  // Code inspection: runSuppression validates the id and operator BEFORE building any
// document reference. This test does not count reads; it asserts the refusal
// reason and that no document changed.
  record(`invalid ids (${invalidIds.length}) and an invalid operator are refused with invalid-profile-id / invalid-operator; no document changed`,
    badIdResults.every((r) => r.kind === "refused" && r.reason === "invalid-profile-id") &&
      badOperator.kind === "refused" && badOperator.reason === "invalid-operator" && diffKeys(s5, s6).length === 0 &&
      (await profile(ID.OK2)).status === "Approved",
    badIdResults.map((r) => (r.kind === "refused" ? r.reason : r.kind)).filter((x) => x !== "invalid-profile-id").join(",") || "all invalid-profile-id");

  // ---------- source: the only writes are the profile update + one audit set ----------
  const src = fs.readFileSync(path.join(REPO, SCRIPT), "utf8");
  const updates = src.match(/tx\.update\(/g) || [];
  const sets = src.match(/tx\.set\(/g) || [];
  const forbidden = [/\.delete\(/, /\.add\(/, /\.create\(/, /\.batch\(/, /bulkWriter/i, /recursiveDelete/, /collection\("vendors"\)\.doc\([^)]*\)\.(set|update)/, /\bdb\.collection\([^)]*\)\.doc\([^)]*\)\.(set|update)\(/];
  record("source: exactly one tx.update (the profile) and one tx.set (the audit entry); no delete/add/create/batch/bulkWriter/recursiveDelete or direct writes",
    updates.length === 1 && sets.length === 1 && /tx\.update\(profileRef,/.test(src) && /tx\.set\(db\.collection\("audit_logs"\)\.doc\(\),/.test(src) &&
      forbidden.every((re) => !re.test(src)) && /export const PRODUCTION_ENABLED = false;/.test(src),
    `update=${updates.length} set=${sets.length}`);

  // ---------- CLI guards (pure) ----------
  const emu = { FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
  const ok = ["--project", PROJECT_ID, "--profile-id", ID.OK2, "--operator", OPERATOR];
  const guardCases: [string, string[], Record<string, string | undefined>][] = [
    ["no emulator (production)", ok, {}],
    ["ALLOW_PRODUCTION=yes", ok, { ALLOW_PRODUCTION: "yes" }],
    ["ALLOW_PRODUCTION=yes with emulator", ok, { ...emu, ALLOW_PRODUCTION: "yes" }],
    ["real credential set", ok, { ...emu, GOOGLE_APPLICATION_CREDENTIALS: "C:\\x\\key.json" }],
    ["non-demo project", ["--project", "yogi-mart", "--profile-id", ID.OK2, "--operator", OPERATOR], emu],
    ["missing --project", ["--profile-id", ID.OK2, "--operator", OPERATOR], emu],
    ["missing --profile-id", ["--project", PROJECT_ID, "--operator", OPERATOR], emu],
    ["missing --operator", ["--project", PROJECT_ID, "--profile-id", ID.OK2], emu],
    ["invalid --profile-id", ["--project", PROJECT_ID, "--profile-id", "a/b", "--operator", OPERATOR], emu],
    ["two profile ids (duplicate flag)", [...ok, "--profile-id", ID.RACE], emu],
    ["duplicate --apply", [...ok, "--apply", "--apply"], emu],
    ["unknown argument", [...ok, "--all"], emu],
    ["batch-sounding argument", [...ok, "--batch"], emu],
    ["value missing", ["--project", PROJECT_ID, "--profile-id", "--operator", OPERATOR], emu],
    ["empty FIRESTORE_EMULATOR_HOST", ok, { FIRESTORE_EMULATOR_HOST: "" }],
    ["remote emulator host", ok, { FIRESTORE_EMULATOR_HOST: "firestore.googleapis.com:443" }],
    ["private-network emulator host", ok, { FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080" }],
  ];
  const notRefused = guardCases.filter(([, argv, env]) => !("refuse" in tool.parseCli(argv, env))).map(([n]) => n);
  const goodDry = tool.parseCli(ok, emu) as any;
  const goodApply = tool.parseCli([...ok, "--apply"], emu) as any;
  record(`CLI guard (pure): all ${guardCases.length} unsafe configurations refused; dry run is the default`,
    notRefused.length === 0 && goodDry.apply === false && goodApply.apply === true && goodDry.profileId === ID.OK2,
    notRefused.join("; ") || "all refused");

  // ---------- emulator host validation ----------
  const acceptedHosts = ["127.0.0.1:8080", "localhost:8080", "[::1]:8080", "127.0.0.1:1", "localhost:65535"];
  const rejectedHosts = [
    "firestore.googleapis.com:443", "10.0.0.5:8080", "192.168.1.2:8080", "127.0.0.2:8080", "0.0.0.0:8080",
    "localhost.example.com:8080", "evil.localhost:8080", "127.0.0.1", "localhost", "localhost:", "localhost:abc",
    "localhost:0", "localhost:65536", "localhost:123456", "localhost:8080/path", "http://127.0.0.1:8080",
    " 127.0.0.1:8080", "127.0.0.1:8080 ", "::1:8080", "[::1]", "[::2]:8080", "LOCALHOST:8080", "",
  ];
  const acceptBad = acceptedHosts.filter((h) => !tool.isLocalEmulatorHost(h) || "refuse" in tool.parseCli(ok, { FIRESTORE_EMULATOR_HOST: h }));
  const rejectBad = rejectedHosts.filter((h) => tool.isLocalEmulatorHost(h) || !("refuse" in tool.parseCli(ok, { FIRESTORE_EMULATOR_HOST: h })));
  const nonString = [undefined, null, 8080, {}].filter((h) => tool.isLocalEmulatorHost(h));
  record(`emulator host: ${acceptedHosts.length} local addresses accepted; ${rejectedHosts.length} remote / private / malformed / missing-port values refused (parseCli included)`,
    acceptBad.length === 0 && rejectBad.length === 0 && nonString.length === 0,
    `wrongly refused=${acceptBad.join(",") || "none"} wrongly accepted=${rejectBad.join(",") || "none"}`);
  const unsetHost = tool.parseCli(ok, {}) as any;
  const remoteMsg = tool.parseCli(ok, { FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080" }) as any;
  record("emulator host: unset host refused as not-the-emulator; a remote host refused with the local-address message",
    /not the local emulator/.test(unsetHost.refuse) && /must be a local emulator address/.test(remoteMsg.refuse), `${unsetHost.refuse} | ${remoteMsg.refuse}`);

  // ---------- CLI as a function ----------
  const cli = async (argv: string[], env: Record<string, string | undefined>, openThrows?: Error) => {
    const out: string[] = []; const err: string[] = []; let opened = 0;
    const code = await tool.runCli(argv, env, {
      openDb: async () => { opened++; if (openThrows) throw openThrows; return { db, serverTimestamp: ts }; },
      out: (l) => out.push(l), err: (l) => err.push(l),
    });
    return { code, out: out.join("\n"), err: err.join("\n"), opened };
  };
  const cRefuse = await cli(ok, {});
  const cDry = await cli(ok, emu);
  const cPre = await cli(["--project", PROJECT_ID, "--profile-id", ID.SELLER, "--operator", OPERATOR, "--apply"], emu);
  const cErr = await cli(ok, emu, Object.assign(new Error(`5 NOT_FOUND: projects/x/databases/(default)/documents/vendors_public/${ID.OK2}`), { code: 5 }));
  const leaks = [cRefuse, cDry, cPre, cErr].some((c) => (c.out + c.err).includes(ID.OK2) || (c.out + c.err).includes(ID.SELLER) || (c.out + c.err).includes("documents/"));
  record("CLI: guard refusal exits 2 without opening Firestore; dry run exits 0 (would-suppress); precondition refusal exits 3; errors exit 1 with code only; no id or path printed",
    cRefuse.code === 2 && cRefuse.opened === 0 && cDry.code === 0 && JSON.parse(cDry.out).outcome === "would-suppress" &&
      cPre.code === 3 && JSON.parse(cPre.out).reason === "seller-record-exists-for-uid" &&
      cErr.code === 1 && /code=5\)/.test(cErr.err) && !leaks && (await profile(ID.OK2)).status === "Approved",
    `codes ${cRefuse.code}/${cDry.code}/${cPre.code}/${cErr.code} leaks=${leaks}`);

  // ---------- CLI (process) ----------
  const tsxCli = path.join(REPO, "node_modules/tsx/dist/cli.mjs");
  const baseEnv = { ...process.env };
  for (const k of ["FIRESTORE_EMULATOR_HOST", "ALLOW_PRODUCTION", "GOOGLE_APPLICATION_CREDENTIALS", "FIREBASE_SERVICE_ACCOUNT_KEY"]) delete baseEnv[k];
  const child = (argv: string[], env: Record<string, string>) =>
    spawnSync(process.execPath, [tsxCli, SCRIPT, ...argv], { cwd: REPO, env: { ...baseEnv, ...env }, encoding: "utf8", timeout: 120000 });
  const pNoEmu = child(ok, {});
  const pProd = child(["--project", "yogi-mart", "--profile-id", ID.OK2, "--operator", OPERATOR, "--apply"], { ALLOW_PRODUCTION: "yes" });
  const pDry = child(ok, { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST! });
  const pApply = child([...ok, "--apply"], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST! });
  const pApply2 = child([...ok, "--apply"], { FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST! });
  const pRemote = child(ok, { FIRESTORE_EMULATOR_HOST: "10.0.0.5:8080" });
  record("CLI (process): a remote FIRESTORE_EMULATOR_HOST exits 2 with REFUSING TO RUN before any Firebase call (no banner)",
    pRemote.status === 2 && /REFUSING TO RUN: FIRESTORE_EMULATOR_HOST must be a local emulator address/.test(pRemote.stderr) && !/suppress-orphan-public-profile —/.test(pRemote.stderr),
    `exit=${pRemote.status}`);
  const pLeak = [pNoEmu, pProd, pDry, pApply, pApply2, pRemote].some((p) => (p.stdout + p.stderr).includes(ID.OK2));
  record("CLI (process): no emulator / production request exit 2 with REFUSING TO RUN; emulator dry run 0, apply 0 (suppressed), re-apply 0 (already-suppressed); profile id never printed",
    pNoEmu.status === 2 && /REFUSING TO RUN/.test(pNoEmu.stderr) && pProd.status === 2 && /REFUSING TO RUN/.test(pProd.stderr) &&
      pDry.status === 0 && /"outcome":"would-suppress"/.test(pDry.stdout) && /DRY RUN/.test(pDry.stderr) &&
      pApply.status === 0 && /"outcome":"suppressed"/.test(pApply.stdout) &&
      pApply2.status === 0 && /"outcome":"already-suppressed"/.test(pApply2.stdout) && !pLeak && (await auditsFor(ID.OK2)).length === 1,
    `exit ${pNoEmu.status}/${pProd.status}/${pDry.status}/${pApply.status}/${pApply2.status} leak=${pLeak}`);

  // ---------- nothing else touched ----------
  const finalSnap = await snapshotAll();
  const touched = diffKeys(s0, finalSnap).filter((k) => !k.startsWith("audit_logs/"));
  record("only the three profiles deliberately suppressed changed (OK, RACE, OK2 via CLI); every other profile, vendors record and product unchanged",
    JSON.stringify(touched.sort()) === JSON.stringify([`vendors_public/${ID.OK}`, `vendors_public/${ID.OK2}`, `vendors_public/${ID.RACE}`].sort()) &&
      diffKeys(s0, finalSnap).filter((k) => k.startsWith("audit_logs/")).length === 3,
    `non-audit changes=${touched.length}`);

  // ---------- suppressed, then a seller identity appears ----------
  // Runs after the scope check above, with its own snapshots.
  const LATE = U("latesellerrecord");
  const LATE2 = U("latevendorsdoc");
  for (const id of [LATE, LATE2]) {
    await db.collection("vendors_public").doc(id).set({ uid: id, status: "Approved", ...PII });
  }
  const lateFirst = [await run(LATE, true), await run(LATE2, true)];
  await db.collection("vendors").add({ uid: LATE, status: "Pending" }); // a seller record now exists for LATE
  await db.collection("vendors").doc(LATE2).set({ status: "Pending" });  // a vendors/{id} document now exists for LATE2
  const sLate0 = await snapshotAll();
  const lateAgain = [await run(LATE, true), await run(LATE, false), await run(LATE2, true), await run(LATE2, false)];
  const sLate1 = await snapshotAll();
  record("suppressed profile, then a seller record / vendors/{id} doc appears: re-runs REFUSE (seller-record-exists-for-uid / vendors-document-with-this-id-exists), never already-suppressed; nothing changes",
    lateFirst.every((r) => r.kind === "suppressed") &&
      lateAgain[0].kind === "refused" && (lateAgain[0] as any).reason === "seller-record-exists-for-uid" &&
      lateAgain[1].kind === "refused" && (lateAgain[1] as any).reason === "seller-record-exists-for-uid" &&
      lateAgain[2].kind === "refused" && (lateAgain[2] as any).reason === "vendors-document-with-this-id-exists" &&
      lateAgain[3].kind === "refused" && (lateAgain[3] as any).reason === "vendors-document-with-this-id-exists" &&
      diffKeys(sLate0, sLate1).length === 0 && (await auditsFor(LATE)).length === 1 && (await auditsFor(LATE2)).length === 1,
    `first=${lateFirst.map((r) => r.kind).join(",")} again=${lateAgain.map((r) => (r.kind === "refused" ? r.reason : r.kind)).join(",")} changed=${diffKeys(sLate0, sLate1).length}`);
} catch (e) {
  record("HARNESS ERROR", false, (e as Error).stack || String(e));
}

const passed = results.filter((r) => r.pass).length;
console.log(`\n${passed}/${results.length} passed`);
if (passed !== results.length) {
  console.log("FAILED:");
  for (const r of results.filter((x) => !x.pass)) console.log(`  - ${r.name}`);
}
process.exit(passed === results.length ? 0 : 1);
