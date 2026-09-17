// Server-only Firebase Admin SDK — trusted access used by the YOMICO AI
// Engine's tool functions (lib/ai/tools/**) to read Firestore data on the
// authenticated user's behalf, bypassing security rules. Every tool
// function is responsible for enforcing its own scoping (e.g. filtering
// orders by the verified uid) since Admin SDK reads skip firestore.rules
// entirely — see lib/ai/serverAuth.ts for the identity verification this
// depends on.
//
// Deliberately never imports firebase-admin/auth: it pulls in jwks-rsa,
// which depends on jose v6 (ESM-only, no CJS build at all). Confirmed in
// Vercel's actual production Lambda runtime (not just locally, where it
// misleadingly works): importing it anywhere crashes every route that
// touches this file at module-load time with ERR_REQUIRE_ESM, before any
// handler code runs. app/api/auth/send-verification-email/route.ts calls
// the Identity Toolkit REST API directly instead (using getAdminProjectId()
// below for the project-scoped endpoint), and lib/serverAuth.ts verifies ID
// tokens via Google's REST API rather than verifyIdToken() — same reason.
//
// Never import this file from a "use client" component or any file
// reachable from the browser bundle.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

// Parsed once per warm instance and reused by getAdminApp() and
// getAdminProjectId() — the env var doesn't change at runtime, and this
// keeps the credential JSON from being re-parsed on every call.
let cachedServiceAccount: object | undefined;

function readServiceAccount(): object {
  if (cachedServiceAccount) return cachedServiceAccount;

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

  cachedServiceAccount = serviceAccount;
  return serviceAccount;
}

export function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === "yomico-admin");
  if (existing) return existing;

  return initializeApp(
    { credential: cert(readServiceAccount()) },
    "yomico-admin"
  );
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}

// The service account's OWN project_id — never the client-config
// firebaseConfig.projectId (lib/firebase.ts), which a rotated or reissued
// key could silently disagree with. Used by the project-scoped Identity
// Toolkit REST call in app/api/auth/send-verification-email/route.ts so the
// request always targets the project the Bearer token was actually minted
// for. Throws rather than guessing if the key has no project_id.
export function getAdminProjectId(): string {
  const projectId = (readServiceAccount() as { project_id?: unknown })
    .project_id;

  if (typeof projectId !== "string" || !projectId) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY has no valid project_id field."
    );
  }

  return projectId;
}
