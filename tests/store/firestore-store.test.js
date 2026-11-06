import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFirestoreStore } from "../../app/js/store/firestore-store.js";
import { slowFirestore } from "./slow-firestore.js";

// The store against a slow server whose timing the test controls (#102):
// what waits on the server, and which version of a document wins when
// snapshots and writes cross. Its behaviour against the real SDK is the
// emulator suite's job.

const SERVER_MS = 500;
const GYMS = "users/me/gyms";

/**
 * The value `promise` settles to while the clock stands still, or a failure
 * if it needs time to pass: it waited on the server.
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
async function withoutWaiting(promise) {
  const pending = Symbol("pending");
  /** @type {T | typeof pending} */
  let value = pending;
  promise.then((v) => (value = v));
  await vi.advanceTimersByTimeAsync(0);
  if (value === pending) throw new Error("the read waited on the server");
  return value;
}

/**
 * Settles `promise`, letting the clock run as far as the server needs.
 * @template T
 * @param {Promise<T>} promise
 */
async function settled(promise) {
  await vi.advanceTimersByTimeAsync(SERVER_MS);
  return promise;
}

describe("Firestore store with a slow server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function setUp() {
    const { sdk, server } = slowFirestore(SERVER_MS);
    const store = createFirestoreStore({
      sdk: /** @type {any} */ (sdk),
      db: /** @type {any} */ ({}),
      uid: "me",
    });
    return { store, server };
  }

  it("answers reads without waiting on the server once it has read the collection", async () => {
    const { store } = setUp();
    await store.put("gyms", { id: "work", name: "Work" });
    await settled(store.list("gyms"));

    expect(await withoutWaiting(store.get("gyms", "work"))).toEqual({
      id: "work",
      name: "Work",
    });
    expect(await withoutWaiting(store.get("gyms", "nope"))).toBeUndefined();
    expect(await withoutWaiting(store.list("gyms"))).toEqual([
      { id: "work", name: "Work" },
    ]);
  });

  it("answers a read straight after a write without waiting on the server", async () => {
    const { store } = setUp();
    await settled(store.list("gyms"));

    await store.put("gyms", { id: "home", name: "Home" });
    expect(await withoutWaiting(store.get("gyms", "home"))).toEqual({
      id: "home",
      name: "Home",
    });
    await store.remove("gyms", "home");
    expect(await withoutWaiting(store.list("gyms"))).toEqual([]);
  });

  it("keeps its own write over a snapshot until the server answers, then takes the server's version", async () => {
    const { store, server } = setUp();
    await settled(store.list("gyms"));
    server.holdAnswers();

    await store.put("gyms", { id: "work", name: "Work (phone)" });
    // The desktop's edit lands on the server after the phone's.
    server.write(GYMS, "work", { id: "work", name: "Work (desktop)" });
    await vi.advanceTimersByTimeAsync(0);
    expect(await store.get("gyms", "work")).toEqual({
      id: "work",
      name: "Work (phone)",
    });

    server.answerWrites();
    await vi.advanceTimersByTimeAsync(0);
    expect(await store.get("gyms", "work")).toEqual({
      id: "work",
      name: "Work (desktop)",
    });
  });

  it("keeps a write the server hasn't answered when a listener breaks and starts again", async () => {
    const { store, server } = setUp();
    await settled(store.list("gyms"));
    server.holdAnswers();

    await store.put("gyms", { id: "home", name: "Home" });
    server.breakListeners(new Error("listener ended"));
    expect(await settled(store.get("gyms", "home"))).toEqual({
      id: "home",
      name: "Home",
    });
  });
});
