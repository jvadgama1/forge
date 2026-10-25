// Shared helpers for tests that run against the local Firebase emulators
// (started by `npm run test:emulator`). A demo-* project id never touches a
// real Firebase project. Ports match firebase.json.
import { initializeApp } from "firebase/app";
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  getAuth,
  signInWithCredential,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  initializeFirestore,
} from "firebase/firestore";

export const PROJECT_ID = "demo-forge";
export const EMULATOR_HOST = "127.0.0.1";
export const FIRESTORE_PORT = 8080;
export const AUTH_PORT = 9099;

/** Deletes every document in the Firestore emulator. */
export async function clearFirestore() {
  const res = await fetch(
    `http://${EMULATOR_HOST}:${FIRESTORE_PORT}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
  if (!res.ok) throw new Error(`Clearing the emulator failed: ${res.status}`);
}

/**
 * A separate Firebase app, signed in to the Auth emulator as a Google user,
 * with Firestore connected to the emulator. Each call has its own empty
 * local cache.
 * @param {string} sub The Google account's subject (stable per test user).
 */
export async function signedInFirestore(sub) {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: "demo-key" },
    `${sub}-${Date.now()}-${Math.random()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
    disableWarnings: true,
  });
  const { user } = await signInWithCredential(
    auth,
    GoogleAuthProvider.credential(
      JSON.stringify({ sub, email: `${sub}@example.com` }),
    ),
  );
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
  return { app, db, uid: user.uid };
}
