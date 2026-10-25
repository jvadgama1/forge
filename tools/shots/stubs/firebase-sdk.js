// @ts-nocheck -- served in place of app/js/firebase-sdk.js by `npm run shots`
// (#33), so its imports resolve in app/js/, which tsc can't see from here.
//
// The page's ?as= picks who is signed in. The emails are made up; the owner's
// uid is the real one, already public (#28). "checking" never answers, so the
// app stays on its first screen.
import { OWNER_UID } from "./firebase-config.js";

const as = new URLSearchParams(location.search).get("as");

const users = {
  owner: { uid: OWNER_UID, email: "owner@example.com" },
  "not-owner": { uid: "someone-else", email: "friend@example.com" },
};

export const firebaseApp = { initializeApp: () => ({}) };

export const firebaseAuth = {
  getAuth: () => ({}),
  onAuthStateChanged: (_auth, callback) => {
    if (as !== "checking") setTimeout(() => callback(users[as] ?? null));
  },
  signInWithPopup: async () => {},
  signOut: async () => {},
  GoogleAuthProvider: class {},
};

export const firestore = {
  initializeFirestore: () => ({}),
  persistentLocalCache: () => ({}),
  persistentMultipleTabManager: () => ({}),
};
