/*
 * Customer Account hardening — evidence report + uid-ownership backfill.
 * ---------------------------------------------------------------------------
 * READ-ONLY by default. Prints:
 *   1. Referral replay evidence: accounts with more than one "Referral Bonus"
 *      ledger row, bonus rows on accounts with no signupRewardsGrantedAt
 *      stamp, and referral codes held by more than one account.
 *   2. Address injection evidence: addresses whose userEmail and userId belong
 *      to different accounts.
 *   3. The uid backfill plan: addresses, tickets and rewardTransactions that
 *      are owned only by email, and the uid each would get (resolved through
 *      users.email; an email matching zero or several accounts is skipped).
 *
 * With --apply-backfill it writes ONLY the planned userId fields (nothing is
 * deleted or overwritten; a document that already has a userId is never
 * touched).
 *
 * Safety: refuses to run against anything but the local emulator unless
 * ALLOW_PRODUCTION=yes is set, and even then writes only with
 * --apply-backfill. Run the report first and review it before any write.
 *
 *   npx tsx --tsconfig scripts/test/mobile-variant/tsconfig.harness.json \
 *     scripts/migrations/customer-account-migration.ts [--apply-backfill] [--json]
 */
import { getAdminDb } from "../../lib/firebaseAdmin";

const args = new Set(process.argv.slice(2));
const APPLY = args.has("--apply-backfill");
const JSON_OUT = args.has("--json");

if (!process.env.FIRESTORE_EMULATOR_HOST && process.env.ALLOW_PRODUCTION !== "yes") {
  console.error("REFUSING TO RUN: not the local emulator. Set ALLOW_PRODUCTION=yes to run against a real project (read-only unless --apply-backfill).");
  process.exit(2);
}

type Plan = { collection: string; id: string; email: string; uid: string };

export async function runCustomerAccountMigration(apply: boolean) {
  const db = getAdminDb();
  const [users, ledger, addresses, tickets] = await Promise.all([
    db.collection("users").get(),
    db.collection("rewardTransactions").get(),
    db.collection("addresses").get(),
    db.collection("tickets").get(),
  ]);

  // email -> uids (exact and lower-case)
  const byEmail = new Map<string, Set<string>>();
  const emailOf = new Map<string, string>();
  const codeHolders = new Map<string, string[]>();
  for (const u of users.docs) {
    const email = u.get("email");
    if (typeof email === "string" && email) {
      emailOf.set(u.id, email.toLowerCase());
      for (const key of new Set([email, email.toLowerCase()])) {
        if (!byEmail.has(key)) byEmail.set(key, new Set());
        byEmail.get(key)!.add(u.id);
      }
    }
    const code = u.get("referralCode");
    if (typeof code === "string" && code) codeHolders.set(code, [...(codeHolders.get(code) || []), u.id]);
  }
  const resolve = (email: unknown): string | null => {
    if (typeof email !== "string" || !email) return null;
    const hits = byEmail.get(email) || byEmail.get(email.toLowerCase());
    return hits && hits.size === 1 ? [...hits][0] : null;
  };

  // 1. Referral evidence. Only the NEW customer's WELCOME bonus counts here —
  // a referrer legitimately collects one row per referral. A welcome row is
  // referral_{uid} (current) or, before fixed ids, a "Referral Bonus" row that
  // carries the customer's email (the old referrer rows carried none).
  // Receiving it twice, or holding it without the settled stamp, is the
  // signature of the replay this hardening closed.
  const bonusRows = new Map<string, number>();
  for (const r of ledger.docs) {
    if (r.get("type") !== "Referral Bonus") continue;
    const isWelcome = r.id.startsWith("referral_") || (!r.id.startsWith("referrer_") && Boolean(r.get("userEmail")));
    if (!isWelcome) continue;
    const uid = (r.get("userId") as string) || resolve(r.get("userEmail")) || `email:${r.get("userEmail")}`;
    bonusRows.set(uid, (bonusRows.get(uid) || 0) + 1);
  }
  const stamped = new Set(users.docs.filter((u) => u.get("signupRewardsGrantedAt")).map((u) => u.id));
  const referral = {
    multipleBonusRows: [...bonusRows.entries()].filter(([, n]) => n > 1).map(([uid, rows]) => ({ uid, rows })),
    bonusWithoutStamp: [...bonusRows.keys()].filter((uid) => !uid.startsWith("email:") && !stamped.has(uid)),
    duplicateCodes: [...codeHolders.entries()].filter(([, uids]) => uids.length > 1).map(([code, uids]) => ({ code, uids })),
  };

  // 2. Address injection evidence
  const mismatchedAddresses = addresses.docs
    .filter((a) => {
      const uid = a.get("userId");
      const email = a.get("userEmail");
      if (typeof uid !== "string" || typeof email !== "string" || !uid || !email) return false;
      const owner = emailOf.get(uid);
      return owner !== undefined ? owner !== email.toLowerCase() : true;
    })
    .map((a) => ({ id: a.id, userId: a.get("userId"), userEmail: a.get("userEmail") }));

  // 3. Backfill plan. An email is mapped only when EXACTLY ONE account
  // profile (users/{uid} — its id is the Firebase Auth uid) carries it.
  const matchCount = (email: string): number =>
    (byEmail.get(email) || byEmail.get(email.toLowerCase()))?.size ?? 0;
  const plan: Plan[] = [];
  const unresolved: { collection: string; id: string; email: string; reason: "no-account" | "several-accounts" }[] = [];
  const summary: Record<string, {
    total: number; alreadyUidOwned: number; noOwnerAtAll: number; legacyEmailOnly: number;
    mappable: number; noMatchingAccount: number; severalMatchingAccounts: number;
    conflictingOwnership: number; wouldChange: number; wouldRemainUnchanged: number;
  }> = {};
  for (const [name, snap] of [["addresses", addresses], ["tickets", tickets], ["rewardTransactions", ledger]] as const) {
    const s = {
      total: snap.size, alreadyUidOwned: 0, noOwnerAtAll: 0, legacyEmailOnly: 0, mappable: 0,
      noMatchingAccount: 0, severalMatchingAccounts: 0, conflictingOwnership: 0, wouldChange: 0, wouldRemainUnchanged: 0,
    };
    for (const d of snap.docs) {
      const email = d.get("userEmail");
      if (typeof d.get("userId") === "string" && d.get("userId")) {
        s.alreadyUidOwned++;
        continue;
      }
      if (typeof email !== "string" || !email) {
        s.noOwnerAtAll++;
        continue;
      }
      s.legacyEmailOnly++;
      const uid = resolve(email);
      if (uid) {
        plan.push({ collection: name, id: d.id, email, uid });
        s.mappable++;
      } else {
        const several = matchCount(email) > 1;
        unresolved.push({ collection: name, id: d.id, email, reason: several ? "several-accounts" : "no-account" });
        if (several) s.severalMatchingAccounts++;
        else s.noMatchingAccount++;
      }
    }
    if (name === "addresses") s.conflictingOwnership = mismatchedAddresses.length;
    s.wouldChange = s.mappable;
    s.wouldRemainUnchanged = s.total - s.mappable;
    summary[name] = s;
  }

  // Everything a person should look at before any write.
  const manualReview = [
    ...mismatchedAddresses.map((m) => ({ kind: "address-conflicting-owners", ...m })),
    ...unresolved.filter((u) => u.reason === "several-accounts").map((u) => ({ kind: "email-on-several-accounts", ...u })),
    ...referral.duplicateCodes.map((d) => ({ kind: "referral-code-on-several-accounts", ...d })),
    ...referral.multipleBonusRows.map((b) => ({ kind: "several-referral-bonus-rows", ...b })),
    ...referral.bonusWithoutStamp.map((uid) => ({ kind: "referral-bonus-without-settled-stamp", uid })),
  ];

  let written = 0;
  if (apply) {
    for (let i = 0; i < plan.length; i += 400) {
      const batch = db.batch();
      for (const p of plan.slice(i, i + 400)) batch.update(db.collection(p.collection).doc(p.id), { userId: p.uid });
      await batch.commit();
      written += Math.min(400, plan.length - i);
    }
  }

  return {
    mode: apply ? "APPLY" : "DRY-RUN",
    referral,
    mismatchedAddresses,
    summary,
    proposedWrites: plan.length,
    manualReview,
    backfill: {
      planned: plan.length,
      byCollection: Object.fromEntries(
        ["addresses", "tickets", "rewardTransactions"].map((c) => [c, plan.filter((p) => p.collection === c).length])
      ),
      unresolved,
      written,
    },
  };
}

// Run only when executed directly (the tests import runCustomerAccountMigration).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/migrations/customer-account-migration.ts")) {
  runCustomerAccountMigration(APPLY)
    .then((report) => {
      if (JSON_OUT) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        console.log(`Customer account migration — ${report.mode}`);
        console.log(`Referral: ${report.referral.multipleBonusRows.length} account(s) with >1 bonus row; ${report.referral.bonusWithoutStamp.length} bonus without stamp; ${report.referral.duplicateCodes.length} duplicate code(s)`);
        console.log(`Addresses whose userEmail and userId belong to different accounts: ${report.mismatchedAddresses.length}`);
        console.log(`Backfill: ${report.backfill.planned} planned ${JSON.stringify(report.backfill.byCollection)}, ${report.backfill.unresolved.length} unresolved, ${report.backfill.written} written`);
        for (const [name, s] of Object.entries(report.summary)) console.log(`  ${name}: ${JSON.stringify(s)}`);
        console.log(`Proposed production writes (userId fields only): ${report.proposedWrites}`);
        console.log(`Records requiring manual review: ${report.manualReview.length}`);
        for (const m of report.manualReview) console.log(`  - ${JSON.stringify(m)}`);
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error("customer-account-migration failed:", error);
      process.exit(1);
    });
}
