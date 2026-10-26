// @ts-nocheck -- served in place of app/js/store/firestore-store.js by
// `npm run shots` (#33), so its import resolves in app/js/store/, which tsc
// can't see from here.
//
// The in-memory store, empty: screens show the seeded library and nothing
// personal.
import { createMemoryStore } from "./memory-store.js";

export const createFirestoreStore = () => createMemoryStore();
