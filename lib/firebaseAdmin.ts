// Server-only Firebase Admin SDK — trusted access used by the YOMICO AI
// Engine's tool functions (lib/ai/tools/**) to read Firestore data on the
// authenticated user's behalf, bypassing security rules. Every tool
// function is responsible for enforcing its own scoping (e.g. filtering
// orders by the verified uid) since Admin SDK reads skip firestore.rules
// entirely — see lib/ai/serverAuth.ts for the identity verification this
// depends on.
//
// Never import this file from a "use client" component or any file
// reachable from the browser bundle.
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function getAdminApp(): App {
  const existing = getApps().find((a) => a.name === "yomico-admin");
  if (existing) return existing;

  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

  if (!serviceAccountKey) {
    throw new Error(
      "FIREBASE_SERVICE_ACCOUNT_KEY is not set. Add the Firebase service account JSON (as a single-line string) to .env.local to enable AI Engine data access."
    );
  }

  const serviceAccount = JSON.parse(serviceAccountKey);

  return initializeApp(
    { credential: cert(serviceAccount) },
    "yomico-admin"
  );
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

export function getAdminDb() {
  return getFirestore(getAdminApp());
}
