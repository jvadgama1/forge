import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFirestoreStore } from "../../app/js/store/firestore-store.js";
import { slowFirestore } from "./slow-firestore.js";

// The store against a slow server (#102). Its behaviour against the real
// SDK is the emulator suite's job; this is only about waiting.

const SERVER_MS = 500;

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

describe("Firestore store with a slow server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  function store() {
    const sdk = /** @type {any} */ (slowFirestore(SERVER_MS));
    return createFirestoreStore({
      sdk,
      db: /** @type {any} */ ({}),
      uid: "me",
    });
  }

  it("answers reads without waiting on the server once it has read the collection", async () => {
    const gyms = store();
    await gyms.put("gyms", { id: "work", name: "Work" });
    const first = gyms.list("gyms");
    await vi.advanceTimersByTimeAsync(SERVER_MS);
    await first;

    expect(await withoutWaiting(gyms.get("gyms", "work"))).toEqual({
      id: "work",
      name: "Work",
    });
    expect(await withoutWaiting(gyms.get("gyms", "nope"))).toBeUndefined();
    expect(await withoutWaiting(gyms.list("gyms"))).toEqual([
      { id: "work", name: "Work" },
    ]);
  });

  it("answers a read straight after a write without waiting on the server", async () => {
    const gyms = store();
    const first = gyms.list("gyms");
    await vi.advanceTimersByTimeAsync(SERVER_MS);
    await first;

    await gyms.put("gyms", { id: "home", name: "Home" });
    expect(await withoutWaiting(gyms.get("gyms", "home"))).toEqual({
      id: "home",
      name: "Home",
    });
    await gyms.remove("gyms", "home");
    expect(await withoutWaiting(gyms.list("gyms"))).toEqual([]);
  });
});
