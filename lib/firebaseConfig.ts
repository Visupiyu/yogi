// Firebase Web (client) configuration selection — SHARED by lib/firebase.ts
// (client SDK init) and, via that module's exported firebaseConfig, by
// lib/serverAuth.ts's ID-token verification. Kept dependency-free (no Firebase
// SDK, no server imports) so it can be unit-tested directly.
//
// PRODUCTION (any `next build` / `next start`, including Vercel Production)
// uses the hard-coded production project below, exactly as before. LOCAL
// DEVELOPMENT (`next dev`, NODE_ENV === "development") no longer does: it must
// name its target explicitly — the Firebase Emulator Suite, a separate
// development project, or (deliberately, with
// NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV=true) production — and throws
// otherwise, so `npm run dev` can never silently read or write production data.
// See README "Local development".
//
// A deployment switches to environment-supplied values when
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

// The original, unchanged production project. Used for production builds.
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
  /** "true" = point the client SDK at the local Firebase Emulator Suite. */
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS?: string;
  /** "true" = a developer DELIBERATELY runs `next dev` against production. */
  NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV?: string;
  /** Inlined by Next.js: "development" under `next dev`, "production" for builds. */
  NODE_ENV?: string;
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
    NEXT_PUBLIC_USE_FIREBASE_EMULATORS: process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS,
    NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV: process.env.NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV,
    NODE_ENV: process.env.NODE_ENV,
  };
}

/**
 * Returns the Firebase Web config for the current environment.
 *   - Env-driven (NEXT_PUBLIC_FIREBASE_PROJECT_ID set, OR
 *     NEXT_PUBLIC_VERCEL_ENV === "preview"): built from the
 *     NEXT_PUBLIC_FIREBASE_* variables; throws if any required one is missing
 *     (fail closed — never falls back to production).
 *   - Emulator mode (NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true"): requires a
 *     demo-* NEXT_PUBLIC_FIREBASE_PROJECT_ID; any other value left unset gets
 *     an inert placeholder (the emulators never check them).
 *   - Local development (NODE_ENV === "development") with nothing configured:
 *     THROWS, unless NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV === "true".
 *     The same opt-in is required for an env-driven dev config that names the
 *     production project id.
 *   - Everything else (production builds, tests): the unchanged
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

  const isLocalDev = env.NODE_ENV === "development";
  const allowProductionInDev = env.NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV === "true";

  if (env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
    const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "";
    if (!projectId.startsWith("demo-")) {
      throw new Error(
        "NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true requires a demo-* NEXT_PUBLIC_FIREBASE_PROJECT_ID " +
          "(e.g. demo-yomico-local). Refusing to pair the emulators with a real project."
      );
    }
    // A demo-* project has no real counterpart and the emulators accept any
    // key, so these placeholders cannot reach a live backend.
    return {
      apiKey: env.NEXT_PUBLIC_FIREBASE_API_KEY || "demo-api-key",
      authDomain: env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
      projectId,
      storageBucket: env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
      messagingSenderId: env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "000000000000",
      appId: env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:000000000000:web:demo",
    };
  }

  if (!wantsEnvConfig) {
    if (isLocalDev && !allowProductionInDev) {
      throw new Error(
        "Local development has no safe Firebase target: `npm run dev` no longer defaults to the " +
          "PRODUCTION Firebase project. Set NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true with " +
          "NEXT_PUBLIC_FIREBASE_PROJECT_ID=demo-yomico-local (Firebase Emulator Suite), or the " +
          "NEXT_PUBLIC_FIREBASE_* values of a separate development project. See README → Local development."
      );
    }
    return PRODUCTION_FIREBASE_CONFIG;
  }

  if (
    isLocalDev &&
    !allowProductionInDev &&
    env.NEXT_PUBLIC_FIREBASE_PROJECT_ID === PRODUCTION_FIREBASE_CONFIG.projectId
  ) {
    throw new Error(
      "NEXT_PUBLIC_FIREBASE_PROJECT_ID names the PRODUCTION project during local development. Use the " +
        "emulators or a development project, or set NEXT_PUBLIC_ALLOW_PRODUCTION_FIREBASE_IN_DEV=true deliberately."
    );
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
