/*
 * YOMICO — suppress ONE orphan vendors_public profile (operator tool).
 * ---------------------------------------------------------------------------
 * An "orphan" public profile is a vendors_public/{uid} document with status
 * "Approved" but NO authoritative seller record. app/store/page.tsx lists every
 * Approved profile, so such a profile is shown in the public stores directory
 * even though /store/{id} and every order path already refuse it.
 *
 * This tool hides exactly one such profile, reversibly:
 *   status                  "Approved" -> "Blocked"
 *   statusBeforeSuppression            -> "Approved"
 *   suppressedReason                   -> "orphan public profile — no seller record"
 *   suppressedAt                       -> server timestamp
 *   suppressedBy                       -> the operator identity
 * Every other field is preserved. One audit_logs entry is written in the same
 * transaction. It NEVER creates, edits or restores a `vendors` record and it
 * never deletes anything.
 *
 * Fail-closed preconditions, re-checked INSIDE the transaction (all reads
 * before the two writes):
 *   - the id is a single, well-formed document id (no "/", not reserved);
 *   - vendors_public/{id} exists, and its `uid` field equals the id;
 *   - status is exactly "Approved" and no suppression field is present yet;
 *   - no vendors record has uid == id;
 *   - no vendors/{id} document exists at all (a legacy record OR an id
 *     collision with another seller — both are ambiguous, both refuse).
 * A profile this tool already suppressed is reported "already-suppressed" and
 * left untouched (idempotent). Any other state is refused.
 *
 * Dry-run by default (a read-only transaction: the server refuses writes).
 * Writes only with --apply.
 *
 * PRODUCTION IS DISABLED in this build. The CLI runs only against the local
 * emulator (FIRESTORE_EMULATOR_HOST must be 127.0.0.1, localhost or [::1]
 * with a numeric port) with a demo-* project; enabling production is a separate, reviewed
 * change (a read-check pre-flight and a credential-derived operator identity
 * would be added then). Output never prints the profile id or any profile data.
 *
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/ops/suppress-orphan-public-profile.ts \
 *     --project demo-yomico-test --profile-id <id> --operator <operator-id> [--apply]
 *
 * Tested by scripts/test/ops-suppress-profile/run.mts (emulator).
 */
import type { Firestore, Transaction } from "firebase-admin/firestore";

export const SUPPRESSED_STATUS = "Blocked";
export const SUPPRESSED_REASON = "orphan public profile — no seller record";
export const AUDIT_ACTION = "vendor_public_profile_suppressed";
export const OPERATION = "suppress-orphan-public-profile";
/** Exactly the fields an apply adds or changes on the profile. */
export const SUPPRESSION_FIELDS = ["status", "statusBeforeSuppression", "suppressedReason", "suppressedAt", "suppressedBy"] as const;

/** Production stays off until a separate, reviewed change enables it. */
export const PRODUCTION_ENABLED = false;

/** One Firestore document id that can also be a Firebase uid. */
export function isValidProfileId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length >= 1 &&
    id.length <= 128 &&
    id === id.trim() &&
    /^[A-Za-z0-9_-]+$/.test(id) &&
    !/^__.*__$/.test(id)
  );
}

/**
 * A LOCAL emulator address only: exactly 127.0.0.1, localhost or [::1], a
 * colon, and a numeric port 1–65535 — nothing before or after. Any other
 * value (a remote or private host, a URL, a missing port) is refused, so the
 * SDK's unauthenticated emulator mode can never be pointed elsewhere.
 */
export function isLocalEmulatorHost(value: unknown): boolean {
  if (typeof value !== "string") return false;
  const m = /^(?:127\.0\.0\.1|localhost|\[::1\]):([0-9]{1,5})$/.exec(value);
  if (!m) return false;
  const port = Number(m[1]);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

export function isValidOperator(op: unknown): op is string {
  return typeof op === "string" && /^[A-Za-z0-9._@:-]{3,128}$/.test(op);
}

export type SuppressionOutcome =
  | { kind: "would-suppress" }
  | { kind: "suppressed" }
  | { kind: "already-suppressed" }
  | { kind: "refused"; reason: string };

/**
 * The whole decision + (with apply) the two writes, in ONE transaction.
 * Dry-run uses a read-only transaction, so no write can happen.
 */
export async function runSuppression(
  db: Firestore,
  opts: { profileId: string; operator: string; apply: boolean },
  serverTimestamp: () => unknown
): Promise<SuppressionOutcome> {
  const { profileId, operator, apply } = opts;
  if (!isValidProfileId(profileId)) return { kind: "refused", reason: "invalid-profile-id" };
  if (!isValidOperator(operator)) return { kind: "refused", reason: "invalid-operator" };

  const profileRef = db.collection("vendors_public").doc(profileId);
  const legacyRef = db.collection("vendors").doc(profileId);
  const byUidQuery = db.collection("vendors").where("uid", "==", profileId).limit(1);

  const body = async (tx: Transaction): Promise<SuppressionOutcome> => {
    // ---- ALL READS FIRST ----
    const [profile, legacy, byUid] = await Promise.all([tx.get(profileRef), tx.get(legacyRef), tx.get(byUidQuery)]);

    if (!profile.exists) return { kind: "refused", reason: "profile-not-found" };
    if (profile.id !== profileId) return { kind: "refused", reason: "profile-id-mismatch" };
    const data = profile.data() as Record<string, unknown>;
    if (data.uid !== profileId) return { kind: "refused", reason: "profile-uid-does-not-match-document-id" };

    // An authoritative or legacy seller identity means this is NOT an orphan.
    if (!byUid.empty) return { kind: "refused", reason: "seller-record-exists-for-uid" };
    if (legacy.exists) return { kind: "refused", reason: "vendors-document-with-this-id-exists" };

    const status = data.status;
    const marked = SUPPRESSION_FIELDS.slice(1).some((f) => data[f] !== undefined);
    if (status === SUPPRESSED_STATUS && data.statusBeforeSuppression === "Approved" && data.suppressedReason === SUPPRESSED_REASON) {
      return { kind: "already-suppressed" };
    }
    if (status !== "Approved") return { kind: "refused", reason: "profile-status-is-not-Approved" };
    if (marked) return { kind: "refused", reason: "profile-has-unexpected-suppression-fields" };

    if (!apply) return { kind: "would-suppress" };

    // ---- WRITES: the profile's suppression fields and its audit entry ----
    const at = serverTimestamp();
    tx.update(profileRef, {
      status: SUPPRESSED_STATUS,
      statusBeforeSuppression: "Approved",
      suppressedReason: SUPPRESSED_REASON,
      suppressedAt: at,
      suppressedBy: operator,
    });
    tx.set(db.collection("audit_logs").doc(), {
      actorUid: operator,
      actorEmail: "",
      action: AUDIT_ACTION,
      targetId: profileId,
      details: {
        operation: OPERATION,
        collection: "vendors_public",
        fromStatus: "Approved",
        toStatus: SUPPRESSED_STATUS,
        reason: SUPPRESSED_REASON,
        fieldsChanged: [...SUPPRESSION_FIELDS],
        checks: { sellerRecordsForUid: 0, vendorsDocumentWithId: false, uidMatchesDocumentId: true },
      },
      createdAt: at,
    });
    return { kind: "suppressed" };
  };

  return apply ? db.runTransaction(body) : db.runTransaction(body, { readOnly: true });
}

/** A short error code only — messages can carry document paths. */
export function safeErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  const s = typeof code === "number" || typeof code === "string" ? String(code) : "";
  return /^[A-Za-z0-9_.-]{1,40}$/.test(s) ? s : "unknown";
}

export type CliConfig = { projectId: string; profileId: string; operator: string; apply: boolean };

/** Pure: argv + env -> config or refusal. No Firebase is touched here. */
export function parseCli(argv: string[], env: Record<string, string | undefined>): CliConfig | { refuse: string } {
  const flags = ["--apply"];
  const valued = ["--project", "--profile-id", "--operator"];
  const seen: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!flags.includes(a) && !valued.includes(a)) return { refuse: `unknown argument ${a}. Allowed: ${[...valued, ...flags].join(" ")}.` };
    if (a in seen) return { refuse: `${a} was given more than once.` };
    if (flags.includes(a)) { seen[a] = "1"; continue; }
    const v = argv[i + 1];
    if (v === undefined || v.startsWith("--")) return { refuse: `${a} needs a value.` };
    seen[a] = v;
    i++;
  }
  const projectId = seen["--project"];
  const profileId = seen["--profile-id"];
  const operator = seen["--operator"];
  if (!projectId) return { refuse: "--project is required." };
  if (profileId === undefined) return { refuse: "--profile-id is required (exactly one profile)." };
  if (!isValidProfileId(profileId)) return { refuse: "--profile-id is not a valid single document id." };
  if (!isValidOperator(operator)) return { refuse: "--operator is required (3–128 chars of A–Z a–z 0–9 . _ @ : -)." };

  const emulator = !!env.FIRESTORE_EMULATOR_HOST;
  if (env.ALLOW_PRODUCTION !== undefined && env.ALLOW_PRODUCTION !== "") {
    return { refuse: "ALLOW_PRODUCTION is set: production execution is disabled in this build." };
  }
  if (!emulator) return { refuse: "not the local emulator: production execution is disabled in this build." };
  if (!isLocalEmulatorHost(env.FIRESTORE_EMULATOR_HOST)) {
    return { refuse: "FIRESTORE_EMULATOR_HOST must be a local emulator address: 127.0.0.1, localhost or [::1] with a numeric port." };
  }
  if (!projectId.startsWith("demo-")) return { refuse: "with the emulator, --project must be a demo-* project id." };
  if (!PRODUCTION_ENABLED && env.GOOGLE_APPLICATION_CREDENTIALS) {
    return { refuse: "GOOGLE_APPLICATION_CREDENTIALS is set: refusing — this build never uses a real credential." };
  }
  return { projectId, profileId, operator, apply: seen["--apply"] === "1" };
}

export type CliDeps = {
  openDb(projectId: string): Promise<{ db: Firestore; serverTimestamp: () => unknown }>;
  out(line: string): void;
  err(line: string): void;
};

/** 0 = done (would-suppress / suppressed / already-suppressed), 2 = guard refusal, 3 = precondition refusal, 1 = error. */
export async function runCli(argv: string[], env: Record<string, string | undefined>, deps: CliDeps): Promise<number> {
  const cfg = parseCli(argv, env);
  if ("refuse" in cfg) {
    deps.err(`REFUSING TO RUN: ${cfg.refuse}`);
    return 2;
  }
  try {
    const { db, serverTimestamp } = await deps.openDb(cfg.projectId);
    deps.err(`suppress-orphan-public-profile — project ${cfg.projectId} (emulator) — ${cfg.apply ? "APPLY" : "DRY RUN (read-only transaction)"}`);
    const outcome = await runSuppression(db, cfg, serverTimestamp);
    deps.out(JSON.stringify({ mode: cfg.apply ? "apply" : "dry-run", outcome: outcome.kind, ...(outcome.kind === "refused" ? { reason: outcome.reason } : {}) }));
    return outcome.kind === "refused" ? 3 : 0;
  } catch (error) {
    deps.err(`suppress-orphan-public-profile failed (code=${safeErrorCode(error)}). Details are withheld because they can contain document paths.`);
    return 1;
  }
}

export const defaultCliDeps: CliDeps = {
  openDb: async (projectId) => {
    const { initializeApp } = await import("firebase-admin/app");
    const { getFirestore, FieldValue } = await import("firebase-admin/firestore");
    const app = initializeApp({ projectId }, "suppress-orphan-public-profile");
    return { db: getFirestore(app), serverTimestamp: () => FieldValue.serverTimestamp() };
  },
  out: (line) => console.log(line),
  err: (line) => console.error(line),
};

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/ops/suppress-orphan-public-profile.ts")) {
  runCli(process.argv.slice(2), process.env, defaultCliDeps).then(
    (code) => process.exit(code),
    () => {
      console.error("suppress-orphan-public-profile failed (code=unknown).");
      process.exit(1);
    }
  );
}
