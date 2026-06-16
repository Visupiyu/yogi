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

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);

export const db = getFirestore(app);

export const storage =
  getStorage(app);
console.log(
  "PROJECT:",
  firebaseConfig.projectId
);

console.log(
  "BUCKET:",
  firebaseConfig.storageBucket
);