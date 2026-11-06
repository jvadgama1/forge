/** @import { Doc, Store } from "../core/types.js" */
/** @import { Firestore } from "firebase/firestore" */

/**
 * Copies a document as plain data: fields set to undefined are dropped, as
 * Firestore does. Callers can never change the mirror through a reference.
 * @param {Doc} doc
 * @returns {Doc}
 */
const copy = (doc) => JSON.parse(JSON.stringify(doc));

/**
 * A Store backed by Firestore: every collection lives under users/{uid}.
 *
 * The Firestore SDK is passed in rather than imported, so the same code runs
 * in the browser (SDK from the pinned CDN, ADR-0002) and in Node tests (SDK
 * from npm).
 *
 * Reads don't wait for the server (ADR-0007). The first use of a collection
 * starts a listener on it, and reads are answered from the copy it keeps:
 * from the device's cache at first, then kept up to date by the server,
 * changes made on other devices included. A read on the gym floor would
 * otherwise wait for a round trip, and a screen makes many (#102).
 *
 * Writes don't wait either. They land in the copy at once, and Firestore
 * applies them to its local cache and syncs when there's a connection, so
 * logging never stalls at the gym (spec #3, story 5). A write the server
 * later rejects is reported to `onError`.
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

  /**
   * @typedef {object} Mirror
   * @property {Map<string, Doc>} docs
   * @property {Promise<Map<string, Doc>>} ready once the first snapshot is in
   */
  /** @type {Map<string, Mirror>} */
  const mirrors = new Map();
  // Documents with a write the server hasn't answered yet, by "collection/id":
  // a snapshot may predate the write, so the write's copy stands until then.
  /** @type {Map<string, number>} */
  const unanswered = new Map();

  /** @param {string} name */
  function mirror(name) {
    let found = mirrors.get(name);
    if (found) return found;
    /** @type {Map<string, Doc>} */
    const docs = new Map();
    const ready = new Promise((resolve, reject) => {
      sdk.onSnapshot(
        collectionRef(name),
        (snap) => {
          const latest = new Map(
            snap.docs.map((d) => [d.id, /** @type {Doc} */ (d.data())]),
          );
          for (const id of new Set([...docs.keys(), ...latest.keys()])) {
            if (unanswered.has(`${name}/${id}`)) continue;
            const doc = latest.get(id);
            if (doc) docs.set(id, doc);
            else docs.delete(id);
          }
          resolve(docs);
        },
        (error) => {
          // Started afresh by the next read, which reports the failure.
          mirrors.delete(name);
          reject(error);
        },
      );
    });
    // A failure after the first snapshot has no read waiting on it.
    ready.catch(() => {});
    found = { docs, ready };
    mirrors.set(name, found);
    return found;
  }

  /**
   * Notes a write until the server answers it.
   * @param {string} key "collection/id"
   * @param {Promise<void>} write
   */
  function track(key, write) {
    unanswered.set(key, (unanswered.get(key) ?? 0) + 1);
    write.catch(onError).finally(() => {
      const left = (unanswered.get(key) ?? 1) - 1;
      if (left) unanswered.set(key, left);
      else unanswered.delete(key);
    });
  }

  return {
    async get(collection, id) {
      const doc = (await mirror(collection).ready).get(id);
      return doc && copy(doc);
    },
    async list(collection) {
      const docs = await mirror(collection).ready;
      // In id order, as Firestore lists them.
      return [...docs.keys()]
        .sort()
        .map((id) => copy(/** @type {Doc} */ (docs.get(id))));
    },
    async put(collection, doc) {
      mirror(collection).docs.set(doc.id, copy(doc));
      track(
        `${collection}/${doc.id}`,
        sdk.setDoc(sdk.doc(collectionRef(collection), doc.id), doc),
      );
    },
    async remove(collection, id) {
      mirror(collection).docs.delete(id);
      track(
        `${collection}/${id}`,
        sdk.deleteDoc(sdk.doc(collectionRef(collection), id)),
      );
    },
    /** Resolves once every write so far has reached the server. */
    synced: () => sdk.waitForPendingWrites(db),
  };
}
