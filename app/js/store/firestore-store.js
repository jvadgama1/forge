/** @import { Doc, Store } from "../core/types.js" */
/** @import { Firestore } from "firebase/firestore" */

/**
 * Copies a document as plain data: fields set to undefined are dropped, as
 * Firestore does. Callers can never change the live copy through a reference.
 * @param {Doc} doc
 * @returns {Doc}
 */
const clone = (doc) => JSON.parse(JSON.stringify(doc));

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
   * @typedef {object} Mirror One collection's live copy.
   * @property {Map<string, Doc>} docs what reads are answered from
   * @property {Map<string, Doc>} latest the latest snapshot's documents
   * @property {boolean} seen whether the current listener has sent a snapshot
   * @property {number} snapshots how many have come, from any listener
   * @property {boolean} broken whether the listener has ended in an error
   * @property {Promise<void>} ready once the listener's first snapshot is in
   */
  /** @type {Map<string, Mirror>} */
  const mirrors = new Map();
  // Documents with a write the server hasn't answered yet, by keyOf: a
  // snapshot may predate the write, so the write's version stands until then.
  /** @type {Map<string, number>} */
  const unanswered = new Map();
  /** @param {string} name @param {string} id */
  const keyOf = (name, id) => `${name}/${id}`;

  /**
   * Gives a document the latest snapshot's version, unless the listener
   * hasn't sent one yet: its first will.
   * @param {Mirror} copy
   * @param {string} id
   */
  function takeLatest(copy, id) {
    if (!copy.seen) return;
    const doc = copy.latest.get(id);
    if (doc) copy.docs.set(id, doc);
    else copy.docs.delete(id);
  }

  /**
   * The collection's live copy, with a listener on it: a new one the first
   * time, or after the last ended in an error (signing out ends them all).
   * The documents are kept, so a write not yet answered survives.
   * @param {string} name
   * @returns {Mirror}
   */
  function mirror(name) {
    const found = mirrors.get(name);
    if (found && !found.broken) return found;
    /** @type {Mirror} */
    const copy = found ?? {
      docs: new Map(),
      latest: new Map(),
      seen: false,
      snapshots: 0,
      broken: false,
      ready: Promise.resolve(),
    };
    copy.seen = false;
    copy.broken = false;
    copy.ready = new Promise((resolve, reject) => {
      sdk.onSnapshot(
        collectionRef(name),
        (snap) => {
          copy.latest = new Map(
            snap.docs.map((d) => [d.id, /** @type {Doc} */ (d.data())]),
          );
          copy.seen = true;
          copy.snapshots++;
          for (const id of new Set([
            ...copy.docs.keys(),
            ...copy.latest.keys(),
          ]))
            if (!unanswered.has(keyOf(name, id))) takeLatest(copy, id);
          resolve();
        },
        (error) => {
          // The next read starts a listener afresh, and reports a failure.
          copy.broken = true;
          reject(error);
        },
      );
    });
    // A failure after the first snapshot has no read waiting on it.
    copy.ready.catch(() => {});
    mirrors.set(name, copy);
    return copy;
  }

  /**
   * Holds a written document's version until the server answers the write,
   * then gives it the latest snapshot's: another device's later edit, or the
   * server's refusal, would otherwise be lost, since a snapshot that came
   * while the write was waiting was passed over. If none has come since the
   * write, the next one sets it.
   * @param {string} name
   * @param {string} id
   * @param {Promise<void>} write
   */
  function holdUntilAnswered(name, id, write) {
    const key = keyOf(name, id);
    const since = mirror(name).snapshots;
    unanswered.set(key, (unanswered.get(key) ?? 0) + 1);
    write.catch(onError).finally(() => {
      const left = (unanswered.get(key) ?? 1) - 1;
      if (left) {
        unanswered.set(key, left);
        return;
      }
      unanswered.delete(key);
      const copy = mirror(name);
      if (copy.snapshots > since) takeLatest(copy, id);
    });
  }

  return {
    async get(collection, id) {
      const { docs, ready } = mirror(collection);
      await ready;
      const doc = docs.get(id);
      return doc && clone(doc);
    },
    async list(collection) {
      const { docs, ready } = mirror(collection);
      await ready;
      // In id order, as Firestore lists them.
      return [...docs.keys()]
        .sort()
        .map((id) => clone(/** @type {Doc} */ (docs.get(id))));
    },
    async put(collection, doc) {
      mirror(collection).docs.set(doc.id, clone(doc));
      holdUntilAnswered(
        collection,
        doc.id,
        sdk.setDoc(sdk.doc(collectionRef(collection), doc.id), doc),
      );
    },
    async remove(collection, id) {
      mirror(collection).docs.delete(id);
      holdUntilAnswered(
        collection,
        id,
        sdk.deleteDoc(sdk.doc(collectionRef(collection), id)),
      );
    },
    /** Resolves once every write so far has reached the server. */
    synced: () => sdk.waitForPendingWrites(db),
  };
}
