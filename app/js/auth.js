import { createForge } from "./core/forge.js";
import { SEED_LIBRARY } from "./core/seed-library.js";
import { createFirestoreStore } from "./store/firestore-store.js";
import { firebaseApp, firebaseAuth, firestore } from "./firebase-sdk.js";
import { FIREBASE_CONFIG, OWNER_UID } from "./firebase-config.js";

/** @import { User } from "firebase/auth" */
/** @import { Forge } from "./core/forge.js" */

/**
 * Where sign-in stands. "checking" until Firebase has looked for a saved
 * sign-in. Only the owner's account gets a Forge core: the security rules
 * refuse every other account (#9).
 * @typedef {{ status: "checking" }
 *   | { status: "signed-out" }
 *   | { status: "not-owner", user: User }
 *   | { status: "signed-in", user: User, forge: Forge }} AuthState
 */

/**
 * Sets up Firebase and follows sign-in. `onChange` runs after every change of
 * state; `onSaveError` when a change fails to reach the server.
 * @param {{ onChange: () => void, onSaveError: (error: unknown) => void }} options
 */
export function startAuth({ onChange, onSaveError }) {
  const app = firebaseApp.initializeApp(FIREBASE_CONFIG);
  const auth = firebaseAuth.getAuth(app);
  // The persistent cache keeps data on the device and queues writes made with
  // no signal, syncing them when the connection returns (spec #3, story 5).
  const db = firestore.initializeFirestore(app, {
    ignoreUndefinedProperties: true,
    localCache: firestore.persistentLocalCache({
      tabManager: firestore.persistentMultipleTabManager(),
    }),
  });

  /** @type {AuthState} */
  let state = { status: "checking" };

  firebaseAuth.onAuthStateChanged(auth, (user) => {
    if (!user) state = { status: "signed-out" };
    else if (user.uid !== OWNER_UID) state = { status: "not-owner", user };
    else
      state = {
        status: "signed-in",
        user,
        forge: createForge({
          store: createFirestoreStore({
            sdk: firestore,
            db,
            uid: user.uid,
            onError: onSaveError,
          }),
          library: SEED_LIBRARY,
        }),
      };
    onChange();
  });

  return {
    get state() {
      return state;
    },
    signIn: () =>
      firebaseAuth.signInWithPopup(auth, new firebaseAuth.GoogleAuthProvider()),
    signOut: () => firebaseAuth.signOut(auth),
  };
}
