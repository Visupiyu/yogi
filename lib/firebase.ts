import { initializeApp }
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

console.log(
  "Firebase Project:",
  firebaseConfig.projectId
);

console.log(
  "Storage Bucket:",
  firebaseConfig.storageBucket
);

const app =
  initializeApp(firebaseConfig);

export const db =
  getFirestore(app);

export const auth =
  getAuth(app);

export const storage =
  getStorage(app);