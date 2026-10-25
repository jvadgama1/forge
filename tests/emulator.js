// Shared helpers for tests that run against the local Firebase emulators
// (started by `npm run test:emulator`). A demo-* project id never touches a
// real Firebase project. Ports match firebase.json.
import { initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  getAuth,
  signInWithCustomToken,
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
 * A custom token for the Auth emulator, which accepts unsigned tokens, so a
 * test can sign in as an exact uid (such as the owner's).
 * @param {string} uid
 */
function unsignedCustomToken(uid) {
  /** @param {object} part */
  const encode = (part) =>
    Buffer.from(JSON.stringify(part)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const claims = {
    iss: "forge-tests",
    sub: "forge-tests",
    aud: "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
    iat: now,
    exp: now + 3600,
    uid,
  };
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`;
}

/**
 * A separate Firebase app, signed in to the Auth emulator as `uid`, with
 * Firestore connected to the emulator. Each call has its own empty local
 * cache.
 * @param {string} uid
 */
export async function signedInFirestore(uid) {
  const app = initializeApp(
    { projectId: PROJECT_ID, apiKey: "demo-key" },
    `${uid}-${Date.now()}-${Math.random()}`,
  );
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${EMULATOR_HOST}:${AUTH_PORT}`, {
    disableWarnings: true,
  });
  const { user } = await signInWithCustomToken(auth, unsignedCustomToken(uid));
  const db = initializeFirestore(app, { ignoreUndefinedProperties: true });
  connectFirestoreEmulator(db, EMULATOR_HOST, FIRESTORE_PORT);
  return { app, db, uid: user.uid };
}
