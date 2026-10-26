// @ts-nocheck -- served in place of app/js/store/firestore-store.js by
// `npm run shots` (#33), so its import resolves in app/js/store/, which tsc
// can't see from here.
//
// The in-memory store, holding only the shot's made-up documents (its `seed`
// in tools/shots/list.js), so nothing personal reaches a shot.
import { createMemoryStore } from "./memory-store.js";

export const createFirestoreStore = () =>
  createMemoryStore(globalThis.forgeShotSeed ?? {});
