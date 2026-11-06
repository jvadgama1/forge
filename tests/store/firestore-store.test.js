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
 * Settles `promise`, letting the clock run in server-sized steps as far as
 * it needs: a chain of first reads waits on the server once per collection.
 * @template T
 * @param {Promise<T>} promise
 * @returns {Promise<T>}
 */
async function settled(promise) {
  let done = false;
  promise.finally(() => (done = true)).catch(() => {});
  for (let step = 0; !done; step++) {
    if (step === 100) throw new Error("still waiting after 100 round trips");
    await vi.advanceTimersByTimeAsync(SERVER_MS);
  }
  return promise;
}

/** The store over a slow server, and that server. */
function setUp() {
  const { sdk, server } = slowFirestore(SERVER_MS);
  const store = createFirestoreStore({
    sdk: /** @type {any} */ (sdk),
    db: /** @type {any} */ ({}),
    uid: "me",
  });
  return { store, server };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("Firestore store with a slow server", () => {
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
// store, doing in effect what the logging screen does when a set is logged.
// A read that waits on the server anywhere along the way fails it.
describe("logging a set over a slow server", () => {
  /**
   * Logs a set, then makes the reads the logging screen makes: those after
   * the tap, with the workout logSet returns, then the redraw's.
   * @param {Forge} forge
   * @param {string} workoutId
   * @param {string} exerciseId
   */
  async function logAndRedraw(forge, workoutId, exerciseId) {
    const logged = await forge.logSet(workoutId, exerciseId, {
      load: 20,
      reps: 12,
    });
    await forge.restAfterSet(exerciseId, logged);
    await forge.recordsSetBy(logged, exerciseId);
    await forge.nextExercise(logged, exerciseId);

    const workout = /** @type {Workout} */ (await forge.currentWorkout());
    const shown = /** @type {string} */ (
      forge.exerciseToShow(workout, exerciseId)
    );
    await forge.getGym(workout.gymId);
    await forge.workoutTitle(workout);
    await forge.getExercise(shown);
    await forge.exerciseType(forge.undoTarget(workout, shown));
    await forge.exerciseSettings(shown);
    await forge.nextSet(workout, shown);
    await forge.suggestedWeight(workout, shown);
    await forge.lastWorkoutLine(shown, workout.id);
    await forge.targets(workout, shown);
    await forge.swapOffer(workout, shown);
    return workout;
  }

  it("reads nothing from the server for a custom exercise in a superset, once loaded", async () => {
    const forge = createForge({ store: setUp().store, library });
    const { workoutId, exerciseId } = await settled(
      (async () => {
        const gym = await forge.createGym("Work");
        const band = await forge.saveCustomExercise({
          name: "Band Row",
          type: "weight-reps",
          primary: ["lats-upper-back"],
          secondary: ["biceps"],
          body: "upper",
        });
        const workout = await forge.startWorkout(gym.id);
        await forge.addExercise(workout.id, "bench-press");
        await forge.addExercise(workout.id, band.id);
        await forge.pairExercises(workout.id, "bench-press", band.id);
        await logAndRedraw(forge, workout.id, band.id);
        return { workoutId: workout.id, exerciseId: band.id };
      })(),
    );

    const workout = await withoutWaiting(
      logAndRedraw(forge, workoutId, exerciseId),
    );
    expect(
      workout.entries.find((e) => e.exerciseId === exerciseId)?.sets,
    ).toHaveLength(2);
  });
});
