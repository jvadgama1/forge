import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createFirestoreStore } from "../../app/js/store/firestore-store.js";
import { library } from "../core/library-fixture.js";
import { slowFirestore } from "./slow-firestore.js";

/** @import { Forge } from "../../app/js/core/forge.js" */
/** @import { Workout } from "../../app/js/core/types.js" */

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

// The guard on ADR-0007 that lint can't give (#108): the core over the real
// store, through what the logging screen does when a set is logged. A read
// that waited on the server anywhere along the way fails it.
describe("logging a set over a slow server", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Settles `promise`, letting the clock run in server-sized steps for as
   * long as it needs: the first reads of each collection wait on the server.
   * @template T
   * @param {Promise<T>} promise
   * @returns {Promise<T>}
   */
  async function eventually(promise) {
    let done = false;
    promise.finally(() => (done = true));
    for (let step = 0; !done && step < 100; step++)
      await vi.advanceTimersByTimeAsync(SERVER_MS);
    return promise;
  }

  /**
   * Logs a set, then makes the reads the logging screen makes to redraw.
   * @param {Forge} forge
   * @param {string} workoutId
   */
  async function logAndRedraw(forge, workoutId) {
    await forge.logSet(workoutId, "bench-press", { load: 135, reps: 8 });
    const workout = /** @type {Workout} */ (await forge.currentWorkout());
    const exerciseId = /** @type {string} */ (
      forge.exerciseToShow(workout, "bench-press")
    );
    await forge.getGym(workout.gymId);
    await forge.workoutTitle(workout);
    await forge.getExercise(exerciseId);
    await forge.exerciseSettings(exerciseId);
    await forge.nextSet(workout, exerciseId);
    await forge.suggestedWeight(workout, exerciseId);
    await forge.lastWorkoutLine(exerciseId, workout.id);
    await forge.recordsSetBy(workout, exerciseId);
    await forge.restAfterSet(exerciseId, workout);
    await forge.targets(workout, exerciseId);
    await forge.swapOffer(workout, exerciseId);
    await forge.nextExercise(workout, exerciseId);
    return workout;
  }

  it("makes no read wait on the server once the app has loaded", async () => {
    const { sdk } = slowFirestore(SERVER_MS);
    const forge = createForge({
      store: createFirestoreStore({
        sdk: /** @type {any} */ (sdk),
        db: /** @type {any} */ ({}),
        uid: "me",
      }),
      library,
    });
    const { id } = await eventually(
      (async () => {
        const gym = await forge.createGym("Work");
        const workout = await forge.startWorkout(gym.id);
        await forge.addExercise(workout.id, "bench-press");
        await logAndRedraw(forge, workout.id);
        return workout;
      })(),
    );

    const workout = await withoutWaiting(logAndRedraw(forge, id));
    expect(workout.entries[0].sets).toHaveLength(2);
  });
});
