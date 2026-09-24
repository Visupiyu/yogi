import { initializeApp, getApps }
from "firebase/app";

import {
  getFirestore
} from "firebase/firestore";

import {
  getAuth
} from "firebase/auth";

import {
  getStorage
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
