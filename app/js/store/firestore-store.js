/** @import { Doc, Store } from "../core/types.js" */
/** @import { Firestore } from "firebase/firestore" */

/**
 * A Store backed by Firestore: every collection lives under users/{uid}.
 *
 * The Firestore SDK is passed in rather than imported, so the same code runs
 * in the browser (SDK from the pinned CDN, ADR-0002) and in Node tests (SDK
 * from npm).
 *
 * Writes don't wait for the server. Firestore applies them to its local
 * cache at once and syncs when there's a connection, so logging never
 * stalls at the gym (spec #3, story 5). A write the server later rejects is
 * reported to `onError`.
 *
 * @param {{
 *   sdk: typeof import("firebase/firestore"),
 *   db: Firestore,
 *   uid: string,
 *   onError?: (error: unknown) => void,
 * }} deps
 * @returns {Store & { synced: () => Promise<void> }}
 */
export function createFirestoreStore({
  sdk,
  db,
  uid,
  onError = (error) => console.error("Forge: a change failed to save", error),
}) {
  /** @param {string} name */
  const collectionRef = (name) => sdk.collection(db, "users", uid, name);

  return {
    async get(collection, id) {
      const snap = await sdk.getDoc(sdk.doc(collectionRef(collection), id));
      return snap.exists() ? /** @type {Doc} */ (snap.data()) : undefined;
    },
    async list(collection) {
      const snap = await sdk.getDocs(collectionRef(collection));
      return snap.docs.map((d) => /** @type {Doc} */ (d.data()));
    },
    async put(collection, doc) {
      sdk
        .setDoc(sdk.doc(collectionRef(collection), doc.id), doc)
        .catch(onError);
    },
    async remove(collection, id) {
      sdk.deleteDoc(sdk.doc(collectionRef(collection), id)).catch(onError);
    },
    /** Resolves once every write so far has reached the server. */
    synced: () => sdk.waitForPendingWrites(db),
  };
}
