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



const firebaseConfig = {

  apiKey:
    "AIzaSyC_RpmkFRJfWkcg6apFXufz5dz8NvT2P4Q",

  authDomain:
    "yogi-mart.firebaseapp.com",

  projectId:
    "yogi-mart",

  storageBucket:
  "yogi-mart.firebasestorage.app",

  messagingSenderId:
    "507607355701",

  appId:
    "1:507607355701:web:555f8fd6710804af533c7c",

  measurementId:
    "G-6KZGLS4651"

};

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
