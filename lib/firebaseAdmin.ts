// Server-only Firebase Admin SDK — trusted access used by the YOMICO AI
// Engine's tool functions (lib/ai/tools/**) to read Firestore data on the
// authenticated user's behalf, bypassing security rules. Every tool
// function is responsible for enforcing its own scoping (e.g. filtering
// orders by the verified uid) since Admin SDK reads skip firestore.rules
// entirely — see lib/ai/serverAuth.ts for the identity verification this
// depends on.
//
// firebase-admin/auth (needed for generateEmailVerificationLink, used by
// app/api/auth/send-verification-email/route.ts) pulls in jwks-rsa -> jose
// v6, which ships ESM-only. That's not a blocker on this project's pinned
// Node >=22.12.0: Node's require(ESM) interop (unflagged since 20.19/22.12)
// loads jose's synchronous ESM build under a plain require(), verified
// directly against the installed firebase-admin@14.2.0. lib/serverAuth.ts's
// verifyRequestUser() still checks ID tokens via Google's REST API rather
// than verifyIdToken() — that choice is unrelated to this import and is
// unaffected by this change.
//
// Never import this file from a "use client" component or any file
// reachable from the browser bundle.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth, type Auth } from "firebase-admin/auth";

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

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}
