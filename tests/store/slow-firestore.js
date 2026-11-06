/**
 * A stand-in for the Firestore SDK whose server is slow (#102): a read that
 * asks the server, and a listener's first snapshot, each take `serverMs`.
 * Writes apply locally at once and reach listeners on the next tick, as
 * Firestore's do. Only what the Firestore store calls is here.
 * @param {number} serverMs
 */
export function slowFirestore(serverMs) {
  /** @type {Map<string, Map<string, object>>} collection path → id → data */
  const collections = new Map();
  /** @type {Set<{ path: string, next: (snap: object) => void }>} */
  const listeners = new Set();

  /** @param {string} path */
  const docsIn = (path) => {
    let docs = collections.get(path);
    if (!docs) collections.set(path, (docs = new Map()));
    return docs;
  };
  const server = () => new Promise((resolve) => setTimeout(resolve, serverMs));
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

  return {
    /** @param {unknown} _db @param {string[]} segments */
    collection: (_db, ...segments) => ({ path: segments.join("/") }),
    /** @param {{ path: string }} collection @param {string} id */
    doc: (collection, id) => ({ path: collection.path, id }),
    /** @param {{ path: string, id: string }} ref */
    async getDoc(ref) {
      await server();
      const data = docsIn(ref.path).get(ref.id);
      return {
        exists: () => data !== undefined,
        data: () => structuredClone(data),
      };
    },
    /** @param {{ path: string }} collection */
    async getDocs(collection) {
      await server();
      return snapshot(collection.path);
    },
    /** @param {{ path: string, id: string }} ref @param {object} data */
    async setDoc(ref, data) {
      docsIn(ref.path).set(ref.id, structuredClone(data));
      changed(ref.path);
    },
    /** @param {{ path: string, id: string }} ref */
    async deleteDoc(ref) {
      docsIn(ref.path).delete(ref.id);
      changed(ref.path);
    },
    /**
     * @param {{ path: string }} collection
     * @param {(snap: object) => void} next
     */
    onSnapshot(collection, next) {
      const listener = { path: collection.path, next };
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
}
