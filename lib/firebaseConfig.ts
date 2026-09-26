// Firebase Web (client) configuration selection — SHARED by lib/firebase.ts
// (client SDK init) and, via that module's exported firebaseConfig, by
// lib/serverAuth.ts's ID-token verification. Kept dependency-free (no Firebase
// SDK, no server imports) so it can be unit-tested directly.
//
// PRODUCTION and local development use the hard-coded production project below,
// exactly as before. A deployment switches to environment-supplied values when
// it explicitly provides its own Firebase project id
// (NEXT_PUBLIC_FIREBASE_PROJECT_ID) or runs as a Vercel Preview
// (NEXT_PUBLIC_VERCEL_ENV === "preview") — this deliberately does NOT depend on
// Vercel's "Automatically expose System Environment Variables" setting. In that
// mode it FAILS CLOSED: if any required variable is missing it throws, so a
// Preview/test target can never silently fall back to the production Firebase
// project. No server secret is read here (only NEXT_PUBLIC_* client config,
// which is public by design).

export type FirebaseWebConfig = {
  apiKey: string;
  authDomain: string;
  projectId: string;
  storageBucket: string;
  messagingSenderId: string;
  appId: string;
  measurementId?: string;
};

// The original, unchanged production project. Used for production and dev.
export const PRODUCTION_FIREBASE_CONFIG: FirebaseWebConfig = {
  apiKey: "AIzaSyC_RpmkFRJfWkcg6apFXufz5dz8NvT2P4Q",
  authDomain: "yogi-mart.firebaseapp.com",
  projectId: "yogi-mart",
  storageBucket: "yogi-mart.firebasestorage.app",
  messagingSenderId: "507607355701",
  appId: "1:507607355701:web:555f8fd6710804af533c7c",
  measurementId: "G-6KZGLS4651",
};

/** The public (NEXT_PUBLIC_*) variables that select the Firebase Web config. */
export type PublicFirebaseEnv = {
  NEXT_PUBLIC_FIREBASE_API_KEY?: string;
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
  NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
  NEXT_PUBLIC_FIREBASE_APP_ID?: string;
  NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
  NEXT_PUBLIC_VERCEL_ENV?: string;
};

/**
 * Reads every selector variable through a LITERAL `process.env.NEXT_PUBLIC_*`
 * reference. This is required, not stylistic: Next.js only substitutes
 * NEXT_PUBLIC_* values into the BROWSER bundle where the source spells out
 * `process.env.NEXT_PUBLIC_X`. Reading them through a passed-around
 * `process.env` object (the previous `env = process.env` default) worked on
 * the server but saw an empty object in the browser, so the client silently
 * fell back to the production project even when a Preview/test project was
 * configured — and the fail-closed check below never ran there.
 */
export function readPublicFirebaseEnv(): PublicFirebaseEnv {
  return {
    NEXT_PUBLIC_FIREBASE_API_KEY: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    NEXT_PUBLIC_FIREBASE_APP_ID: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
    NEXT_PUBLIC_VERCEL_ENV: process.env.NEXT_PUBLIC_VERCEL_ENV,
  };
}

/**
 * Returns the Firebase Web config for the current environment.
 *   - Env-driven (NEXT_PUBLIC_FIREBASE_PROJECT_ID set, OR
 *     NEXT_PUBLIC_VERCEL_ENV === "preview"): built from the
 *     NEXT_PUBLIC_FIREBASE_* variables; throws if any required one is missing
 *     (fail closed — never falls back to production).
 *   - Everything else (production, development, tests): the unchanged
 *     PRODUCTION_FIREBASE_CONFIG.
 */
export function selectFirebaseConfig(
  env: PublicFirebaseEnv = readPublicFirebaseEnv()
): FirebaseWebConfig {
  // Detection is NOT tied to NEXT_PUBLIC_VERCEL_ENV alone, because that variable
  // exists only when Vercel's "Automatically expose System Environment
  // Variables" setting is on — an assumption we must not depend on. A deployment
  // is env-driven when it deliberately carries its own Firebase project id
  // (NEXT_PUBLIC_FIREBASE_PROJECT_ID) OR is flagged as a Vercel Preview. Setting
  // a single unrelated NEXT_PUBLIC_FIREBASE_* var (e.g. only an api key) does
  // NOT trigger this — only the deliberate project id (or the preview flag) — so
  // local development is never accidentally forced onto this path.
  const wantsEnvConfig =
    !!env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    env.NEXT_PUBLIC_VERCEL_ENV === "preview";

  if (!wantsEnvConfig) {
    return PRODUCTION_FIREBASE_CONFIG;
  }

  // Same six required variables as before, checked by explicit name.
  const required: [string, string | undefined][] = [
    ["NEXT_PUBLIC_FIREBASE_API_KEY", env.NEXT_PUBLIC_FIREBASE_API_KEY],
    ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN],
    ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", env.NEXT_PUBLIC_FIREBASE_PROJECT_ID],
    ["NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET],
    ["NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID", env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID],
    ["NEXT_PUBLIC_FIREBASE_APP_ID", env.NEXT_PUBLIC_FIREBASE_APP_ID],
  ];
  const missing = required.filter(([, value]) => !value).map(([name]) => name);
  if (missing.length > 0) {
    throw new Error(
      "Preview Firebase configuration is incomplete — missing " +
        missing.join(", ") +
        ". A Vercel Preview must supply its own Firebase project via " +
        "NEXT_PUBLIC_FIREBASE_* and must NOT fall back to the production project."
    );
  }

  return {
    apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY!,
    authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN!,
    projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID!,
    storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET!,
    messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID!,
    appId: env.NEXT_PUBLIC_FIREBASE_APP_ID!,
    ...(env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID
      ? { measurementId: env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID }
      : {}),
  };
}
