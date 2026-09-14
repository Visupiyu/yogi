// Server-only Firebase Admin SDK — trusted access used by the YOMICO AI
// Engine's tool functions (lib/ai/tools/**) to read Firestore data on the
// authenticated user's behalf, bypassing security rules. Every tool
// function is responsible for enforcing its own scoping (e.g. filtering
// orders by the verified uid) since Admin SDK reads skip firestore.rules
// entirely — see lib/ai/serverAuth.ts for the identity verification this
// depends on.
//
// Deliberately never imports firebase-admin/auth: it pulls in jwks-rsa,
// which depends on jose v6 (ESM-only, no CJS build at all). Vercel's
// serverless runtime hard-disables require(ESM) regardless of Node
// version, so importing firebase-admin/auth anywhere crashes every
// route that touches this file with ERR_REQUIRE_ESM in production.
// lib/ai/serverAuth.ts verifies ID tokens via Google's REST API instead.
//
// Never import this file from a "use client" component or any file
// reachable from the browser bundle.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === "yomico-admin");
  if (existing) return existing;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not set. Add the Firebase service account JSON (as a single-line string) to the environment to enable Admin SDK access."
    );
  }

  // Parse defensively. Leading/trailing whitespace is tolerated (trim), but any
  // OTHER malformation — e.g. extra non-whitespace AFTER the JSON object, the
  // classic cause of "Unexpected non-whitespace character after JSON at position
  // N" — is a corrupt env value that must be fixed at its source. We surface a
  // clear, non-secret error (the raw JSON body is never included) instead of an
  // opaque SyntaxError, and never try to "repair" the value ourselves, since a
  // silently-truncated credential would fail worse later.
  let serviceAccount: object;
  try {
    serviceAccount = JSON.parse(serviceAccountKey.trim());
  } catch (parseError) {
    const reason = parseError instanceof Error ? parseError.message : "invalid JSON";
    throw new Error(
      `FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON (${reason}). It must be EXACTLY the Firebase service-account JSON object, with no extra characters before or after it.`
    );
  }

  return initializeApp(
    { credential: cert(serviceAccount) },
    "yomico-admin"
  );
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
