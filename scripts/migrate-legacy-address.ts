/**
 * One-time, ADDITIVE migration of the legacy single free-text address
 * (users/{uid}.address) into the structured `addresses` collection, so
 * customers who predate the multi-address system keep their address as a
 * proper saved (default) address.
 *
 * ─────────────────────────────────────────────────────────────────────────
 *  DO NOT RUN THIS AGAINST PRODUCTION WITHOUT EXPLICIT APPROVAL.
 *  It is DRY-RUN by default: it prints what it WOULD create and writes nothing.
 *  Pass `--apply` to actually write. Rehearse against the emulator first
 *  (FIRESTORE_EMULATOR_HOST=127.0.0.1:8080).
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Guarantees:
 *  - NON-DESTRUCTIVE: never deletes or overwrites users/{uid}.address, and
 *    never modifies any existing `addresses` document.
 *  - IDEMPOTENT / safe to re-run: a customer who ALREADY has any structured
 *    address (matched by userEmail) is skipped entirely, so re-running never
 *    creates a duplicate.
 *  - Only ADDS: for an eligible customer it creates exactly ONE new address
 *    document (isDefault:true) and touches nothing else.
 *
 * Eligibility (all must hold):
 *  1. The user doc has a non-empty, non-whitespace `address` string.
 *  2. The user doc has an `email` (web addresses are owned by userEmail).
 *  3. The customer has NO existing document in `addresses` under EITHER
 *     ownership shape — web (userEmail == user.email) OR mobile
 *     (userId == the customer's uid) — so a mobile-created address is never
 *     duplicated or overridden.
 *
 * Field mapping for the created address:
 *  - userEmail    <- user.email
 *  - fullName     <- user.name || user.fullName || ""      (missing -> "")
 *  - phone        <- user.phone || ""                       (missing -> "")
 *  - addressLine1 <- the legacy free-text string (trimmed). The legacy value is
 *                    unstructured, so it is preserved verbatim in addressLine1
 *                    rather than being unreliably split into city/state/pincode.
 *  - addressLine2, landmark, city, state, pincode <- "" (unknown; left blank)
 *  - type         <- "Home"
 *  - isDefault    <- true   (it becomes the customer's first/default address)
 *  - createdAt    <- now
 *  - migratedFromLegacy <- true   (audit marker; lets a future pass identify
 *                                   auto-migrated rows without guessing)
 *
 * Empty/null legacy address -> customer is NOT eligible (skipped).
 * Customer with existing structured address(es) under userEmail OR userId ->
 * skipped (never overwritten).
 *
 * The Admin SDK bypasses firestore.rules, so no rule change is needed to run
 * this; the created documents match exactly what the web /addresses UI writes.
 *
 * Usage:
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/migrate-legacy-address.ts
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx tsx scripts/migrate-legacy-address.ts --apply
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-require-imports */

// Wrapped in an IIFE (not top-level declarations) so this CJS-style tsx script
// shares no global identifiers with the other scripts/*.ts (which also declare
// APPLY/main at the top level). `require` still works because the file stays a
// non-ESM script.
(async () => {
  const APPLY = process.argv.includes("--apply");
  const { getAdminDb } = require("@/lib/firebaseAdmin");
  const { Timestamp } = require("firebase-admin/firestore");
  const db = getAdminDb();

  const log = (msg: string) =>
    console.log(`${APPLY ? "[APPLY]" : "[DRY] "} ${msg}`);

  log(
    APPLY
      ? "WRITING migrated addresses to Firestore."
      : "DRY-RUN — no writes. Pass --apply to write."
  );

  const usersSnap = await db.collection("users").get();

  let eligible = 0;
  let created = 0;
  let skippedNoAddress = 0;
  let skippedNoEmail = 0;
  let skippedAlreadyStructured = 0;

  for (const userDoc of usersSnap.docs) {
    const user: any = userDoc.data();

    const legacy = typeof user?.address === "string" ? user.address.trim() : "";
    if (!legacy) {
      skippedNoAddress++;
      continue;
    }

    const email = typeof user?.email === "string" ? user.email.trim() : "";
    if (!email) {
      // No email => can't own a web address; leave untouched.
      skippedNoEmail++;
      continue;
    }

    // Already has structured addresses under EITHER ownership shape? Never
    // duplicate / override. The web owns addresses by userEmail; the mobile app
    // owns them by userId (== the customer's uid, which is the users doc id).
    // Checking both prevents re-creating an address for a customer who already
    // added one on mobile.
    const [byEmail, byUid] = await Promise.all([
      db.collection("addresses").where("userEmail", "==", email).limit(1).get(),
      db.collection("addresses").where("userId", "==", userDoc.id).limit(1).get(),
    ]);
    if (!byEmail.empty || !byUid.empty) {
      skippedAlreadyStructured++;
      continue;
    }

    eligible++;

    const addressDoc = {
      userEmail: email,
      fullName: user?.name || user?.fullName || "",
      phone: user?.phone || "",
      addressLine1: legacy,
      addressLine2: "",
      landmark: "",
      city: "",
      state: "",
      pincode: "",
      type: "Home",
      isDefault: true,
      migratedFromLegacy: true,
      createdAt: Timestamp.now(),
    };

    log(
      `${APPLY ? "creating" : "would create"} default address for ${email} ` +
        `(uid ${userDoc.id}): "${legacy.slice(0, 60)}${
          legacy.length > 60 ? "…" : ""
        }"`
    );

    if (APPLY) {
      await db.collection("addresses").add(addressDoc);
      created++;
    }
  }

  log("──────────────────────────────────────────────");
  log(`users scanned:                 ${usersSnap.size}`);
  log(`skipped (no legacy address):   ${skippedNoAddress}`);
  log(`skipped (no email):            ${skippedNoEmail}`);
  log(`skipped (already structured):  ${skippedAlreadyStructured}`);
  log(`eligible for migration:        ${eligible}`);
  log(`${APPLY ? "created" : "would create"}:                 ${APPLY ? created : eligible}`);
})()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
