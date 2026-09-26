import { initializeApp, getApps }
from "firebase/app";

import {
  getFirestore,
  connectFirestoreEmulator
} from "firebase/firestore";

import {
  getAuth,
  connectAuthEmulator
} from "firebase/auth";

import {
  getStorage,
  connectStorageEmulator
} from "firebase/storage";

import { selectFirebaseConfig } from "@/lib/firebaseConfig";



// Production and local development use the original hard-coded production
// project unchanged; a Vercel Preview (NEXT_PUBLIC_VERCEL_ENV === "preview")
// supplies its own project via NEXT_PUBLIC_FIREBASE_* and fails closed if any
// are missing — see lib/firebaseConfig.ts.
export const firebaseConfig = selectFirebaseConfig();

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const storage =
  getStorage(app);
  export { app };

// ---------------------------------------------------------------------------
// LOCAL TEST ONLY — opt-in Firebase emulator switch.
//
// Active ONLY when NEXT_PUBLIC_USE_FIREBASE_EMULATORS is exactly "true".
// That variable is never set in any deployed environment, so in production the
// check below reads an unset value and is false at runtime: project selection
// and every endpoint stay exactly as before. When on, Firestore, Auth and Storage talk to the local emulators
// instead of Google, and it refuses to start unless the selected project is a
// "demo-*" emulator project, so it can never be paired with a real project's
// config. Ports are the firebase-tools defaults (Firestore 8080 — also pinned
// in firebase.json — Auth 9099, Storage 9199).
// ---------------------------------------------------------------------------
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS === "true") {
  const projectId = String(firebaseConfig.projectId || "");
  if (!projectId.startsWith("demo-")) {
    throw new Error(
      "NEXT_PUBLIC_USE_FIREBASE_EMULATORS=true requires a demo-* NEXT_PUBLIC_FIREBASE_PROJECT_ID (refusing to use a real project)."
    );
  }
  // connect*Emulator may only run once per SDK instance; guard against
  // re-running on hot reload.
  const flags = globalThis as { __yomicoFirebaseEmulatorsConnected?: boolean };
  if (!flags.__yomicoFirebaseEmulatorsConnected) {
    const host = "127.0.0.1";
    connectFirestoreEmulator(db, host, 8080);
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectStorageEmulator(storage, host, 9199);
    flags.__yomicoFirebaseEmulatorsConnected = true;
    console.info(
      `[firebase] LOCAL EMULATORS ONLY — project=${projectId} firestore=${host}:8080 auth=${host}:9099 storage=${host}:9199`
    );
  }
}

// A second, separately-named Firebase app instance sharing the same
// public config. createUserWithEmailAndPassword() on the PRIMARY auth
// instance would sign the browser in as the newly-created account,
// kicking whatever admin is currently signed in out of their own
// session — used only to provision delivery-partner login accounts from
// the admin panel without disturbing the admin's session.
export function getSecondaryAuth() {
  const existing = getApps().find((a) => a.name === "Secondary");
  const secondaryApp = existing || initializeApp(firebaseConfig, "Secondary");
  return getAuth(secondaryApp);
}
