// Firebase, loaded straight from the CDN as ES modules — no npm install, no build step.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js';
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc,
  serverTimestamp, writeBatch, query,
} from 'https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js';

import { firebaseConfig } from './firebase-config.js';

export const configIsPlaceholder = Object.values(firebaseConfig).some((v) => String(v).includes('REPLACE_ME'));

const app = configIsPlaceholder ? null : initializeApp(firebaseConfig);
export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
const googleProvider = new GoogleAuthProvider();

export function signIn() {
  return signInWithPopup(auth, googleProvider);
}

export function signOutUser() {
  return signOut(auth);
}

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export {
  collection, doc, getDocs, onSnapshot, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, query,
};
