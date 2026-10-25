/** @import { Doc, Store } from "../core/types.js" */

/**
 * Copies a document as plain data: fields set to undefined are dropped, as
 * Firestore does. Callers can never change stored data through a reference.
 * @param {Doc} doc
 * @returns {Doc}
 */
const copy = (doc) => JSON.parse(JSON.stringify(doc));

/**
 * An in-memory Store, for tests and previews.
 * @param {Record<string, Doc[]>} [seed] Initial documents, by collection.
 * @returns {Store}
 */
export function createMemoryStore(seed = {}) {
  /** @type {Map<string, Map<string, Doc>>} */
  const collections = new Map();
  /** @param {string} name */
  const docsIn = (name) => {
    let docs = collections.get(name);
    if (!docs) collections.set(name, (docs = new Map()));
    return docs;
  };
  for (const [name, docs] of Object.entries(seed))
    for (const doc of docs) docsIn(name).set(doc.id, copy(doc));

  return {
    async get(collection, id) {
      const doc = docsIn(collection).get(id);
      return doc && copy(doc);
    },
    async list(collection) {
      return [...docsIn(collection).values()].map((d) => copy(d));
    },
    async put(collection, doc) {
      docsIn(collection).set(doc.id, copy(doc));
    },
    async remove(collection, id) {
      docsIn(collection).delete(id);
    },
  };
}
