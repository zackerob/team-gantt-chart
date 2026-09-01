// Fill these in from Firebase console → Project settings → Your apps → Web app config.
// These values are meant to be public (client-side identifiers, not secrets) — real
// access control lives in Firestore Security Rules + the ALLOWED_EMAILS allowlist below.
export const firebaseConfig = {
  apiKey: 'REPLACE_ME',
  authDomain: 'REPLACE_ME.firebaseapp.com',
  projectId: 'REPLACE_ME',
  storageBucket: 'REPLACE_ME.appspot.com',
  messagingSenderId: 'REPLACE_ME',
  appId: 'REPLACE_ME',
};

// The 5 Google account emails allowed to use the app. This is a client-side
// convenience check only (for a friendly "not authorized" screen) — the real
// enforcement is the matching list in firestore.rules, which must be kept in sync.
export const ALLOWED_EMAILS = [
  'person1@example.com',
  'person2@example.com',
  'person3@example.com',
  'person4@example.com',
  'person5@example.com',
];
