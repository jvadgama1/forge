/**
 * A stand-in for the Firestore SDK whose server is slow (#102): a one-off
 * read (`getDoc`, `getDocs`, which the store used to make) and a listener's
 * first snapshot each take `serverMs`. Writes apply locally at once and
 * reach listeners on the next tick, as Firestore's do.
 *
 * `server` stands for what happens elsewhere: it can hold back its answers
 * to this device's writes, take a write from another device, or break the
 * listeners (as signing out does).
 * @param {number} serverMs
 */
export function slowFirestore(serverMs) {
  /** @type {Map<string, Map<string, object>>} collection path → id → data */
  const collections = new Map();
  /**
   * @typedef {{
   *   path: string,
   *   next: (snap: object) => void,
   *   error: (error: unknown) => void,
   * }} Listener
   */
  /** @type {Set<Listener>} */
  const listeners = new Set();
  let holding = false;
  /** @type {(() => void)[]} */
  const unanswered = [];

  /** @param {string} path */
  const docsIn = (path) => {
    let docs = collections.get(path);
    if (!docs) collections.set(path, (docs = new Map()));
    return docs;
  };
  const wait = () => new Promise((resolve) => setTimeout(resolve, serverMs));
  /** @param {string} path */
  const snapshot = (path) => ({
    docs: [...docsIn(path)].map(([id, data]) => ({
      id,
      data: () => structuredClone(data),
    })),
  });
  /** @param {string} path */
  const changed = (path) =>
    setTimeout(() => {
      for (const l of listeners) if (l.path === path) l.next(snapshot(path));
    });
  /** @returns {Promise<void>} answered at once, unless the server holds it */
  const answer = () =>
    holding
      ? new Promise((resolve) => unanswered.push(resolve))
      : Promise.resolve();

  const sdk = {
    /** @param {unknown} _db @param {string[]} segments */
    collection: (_db, ...segments) => ({ path: segments.join("/") }),
    /** @param {{ path: string }} collection @param {string} id */
    doc: (collection, id) => ({ path: collection.path, id }),
    /** @param {{ path: string, id: string }} ref */
    async getDoc(ref) {
      await wait();
      const data = docsIn(ref.path).get(ref.id);
      return {
        exists: () => data !== undefined,
        data: () => structuredClone(data),
      };
    },
    /** @param {{ path: string }} collection */
    async getDocs(collection) {
      await wait();
      return snapshot(collection.path);
    },
    /** @param {{ path: string, id: string }} ref @param {object} data */
    setDoc(ref, data) {
      docsIn(ref.path).set(ref.id, structuredClone(data));
      changed(ref.path);
      return answer();
    },
    /** @param {{ path: string, id: string }} ref */
    deleteDoc(ref) {
      docsIn(ref.path).delete(ref.id);
      changed(ref.path);
      return answer();
    },
    /**
     * @param {{ path: string }} collection
     * @param {(snap: object) => void} next
     * @param {(error: unknown) => void} error
     */
    onSnapshot(collection, next, error) {
      /** @type {Listener} */
      const listener = { path: collection.path, next, error };
      const first = setTimeout(() => {
        listeners.add(listener);
        next(snapshot(collection.path));
      }, serverMs);
      return () => {
        clearTimeout(first);
        listeners.delete(listener);
      };
    },
    waitForPendingWrites: async () => {},
  };

  const server = {
    /** Holds back the answers to this device's writes from now on. */
    holdAnswers() {
      holding = true;
    },
    /** Answers every write held back, and stops holding. */
    answerWrites() {
      holding = false;
      for (const resolve of unanswered.splice(0)) resolve();
    },
    /**
     * Another device's write reaching this one.
     * @param {string} path @param {string} id @param {object} data
     */
    write(path, id, data) {
      docsIn(path).set(id, structuredClone(data));
      changed(path);
    },
    /** @param {unknown} error ends every listener with it */
    breakListeners(error) {
      for (const l of listeners) l.error(error);
      listeners.clear();
    },
  };

  return { sdk, server };
}
