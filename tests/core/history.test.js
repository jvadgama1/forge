import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** @import { Workout, WorkoutSet } from "../../app/js/core/types.js" */

/**
 * A set of `load` lb × `reps`, with optional flags.
 * @param {number} load
 * @param {number} reps
 * @param {Partial<WorkoutSet>} [more]
 * @returns {WorkoutSet}
 */
const set = (load, reps, more = {}) => ({
  load,
  unit: "lb",
  reps,
  loggedAt: "2026-10-01T18:00:00.000Z",
  ...more,
});

/**
 * A finished workout on `date` with bench press sets, stored directly, as a
 * past or back-dated one would be.
 * @param {string} id
 * @param {string} date YYYY-MM-DD
 * @param {WorkoutSet[]} sets
 * @param {string} [startedAt] defaults to 18:00 UTC that date
 * @returns {Workout}
 */
const past = (id, date, sets, startedAt = `${date}T18:00:00.000Z`) => ({
  id,
  date,
  startedAt,
  finishedAt: startedAt.replace("T18", "T19"),
  gymId: "gym",
  entries: [{ exerciseId: "bench-press", sets }],
});

/** The core over a store holding `workouts`, on 25 Oct 2026 at 18:00. */
async function withHistory(/** @type {Workout[]} */ ...workouts) {
  const store = createMemoryStore();
  for (const w of workouts) await store.put("workouts", w);
  const f = createForge({
    store,
    library,
    now: () => new Date(2026, 9, 25, 18, 0),
  });
  return { f, store };
}

describe("last workout (#13)", () => {
  it("is the most recent finished workout by workout date that has the exercise", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-14", [set(135, 8)]),
      // Logged later, but back-dated before Oct 14.
      past("b", "2026-10-10", [set(130, 8)], "2026-10-20T18:00:00.000Z"),
      {
        ...past("c", "2026-10-20", []),
        entries: [{ exerciseId: "leg-press", sets: [set(270, 10)] }],
      },
    );
    const last = await f.lastWorkout("bench-press");
    expect(last?.workout.id).toBe("a");
    expect(last?.sets).toEqual([set(135, 8)]);
  });

  it("isn't the current workout, nor one in progress", async () => {
    const { f } = await withHistory(past("a", "2026-10-14", [set(135, 8)]));
    const work = await f.createGym("Work");
    const current = await f.startWorkout(work.id);
    await f.addExercise(current.id, "bench-press");
    await f.logSet(current.id, "bench-press", { load: 140, reps: 5 });
    expect((await f.lastWorkout("bench-press", current.id))?.workout.id).toBe(
      "a",
    );
    expect((await f.lastWorkout("bench-press"))?.workout.id).toBe("a");
  });

  it("is none when the exercise was never done", async () => {
    const { f } = await withHistory(past("a", "2026-10-14", [set(135, 8)]));
    expect(await f.lastWorkout("lat-pulldown")).toBeUndefined();
  });
});

describe("history (#13)", () => {
  it("lists every workout with the exercise, newest first, the one in progress included", async () => {
    const { f } = await withHistory(
      past("old", "2026-10-01", [set(125, 8)]),
      past("mid", "2026-10-14", [set(135, 8)]),
      past("none", "2026-10-20", []),
    );
    const work = await f.createGym("Work");
    const now = await f.startWorkout(work.id);
    await f.addExercise(now.id, "bench-press");
    await f.logSet(now.id, "bench-press", { load: 140, reps: 5 });
    const history = await f.history("bench-press");
    expect(history.map((h) => h.workout.id)).toEqual([now.id, "mid", "old"]);
    expect(history[1].sets).toEqual([set(135, 8)]);
  });
});

describe("e1RM (#13)", () => {
  it("is Epley's estimate for working sets of 1 to 12 reps", async () => {
    const { f } = await withHistory();
    expect(f.e1rm(set(100, 10))).toBeCloseTo(133.33, 2); // 100 × (1 + 10/30)
    expect(f.e1rm(set(225, 1))).toBeCloseTo(232.5, 2); // 225 × (1 + 1/30)
    expect(f.e1rm(set(60, 12))).toBeCloseTo(84, 2); // 60 × 1.4
  });

  it("isn't defined past 12 reps, for warm-up or drop sets, or with no load", async () => {
    const { f } = await withHistory();
    expect(f.e1rm(set(60, 13))).toBeUndefined();
    expect(f.e1rm(set(100, 10, { warmUp: true }))).toBeUndefined();
    expect(f.e1rm(set(100, 10, { drop: true }))).toBeUndefined();
    expect(f.e1rm(set(0, 10))).toBeUndefined();
  });
});

describe("records (#13)", () => {
  it("are the heaviest load, best e1RM and most reps at each load, from working sets only", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-01", [
        set(95, 10, { warmUp: true }),
        set(135, 10), // e1RM 180
        set(135, 8),
      ]),
      past("b", "2026-10-14", [
        set(155, 3), // e1RM 170.5, heaviest working
        set(185, 2, { warmUp: true }), // heavier, but a warm-up
        set(115, 15, { drop: true }), // most reps, but a drop set
      ]),
    );
    const records = await f.records("bench-press");
    expect(records.heaviest).toEqual({ load: 155, unit: "lb" });
    expect(records.bestE1rm?.value).toBeCloseTo(180, 2);
    expect(records.bestE1rm?.set).toEqual(set(135, 10));
    expect(records.repsAtLoad).toEqual([
      { load: 155, unit: "lb", reps: 3 },
      { load: 135, unit: "lb", reps: 10 },
    ]);
  });

  it("are empty for an exercise never done", async () => {
    const { f } = await withHistory();
    expect(await f.records("bench-press")).toEqual({ repsAtLoad: [] });
  });
});

describe("a set that sets a record (#13)", () => {
  /** A workout in progress after the history in `a`, with bench press added. */
  async function logging() {
    const env = await withHistory(
      past("a", "2026-10-14", [set(135, 10), set(135, 8)]), // best e1RM 180
    );
    const work = await env.f.createGym("Work");
    const w = await env.f.startWorkout(work.id);
    await env.f.addExercise(w.id, "bench-press");
    /** @param {{ load: number, reps: number, warmUp?: boolean }} s */
    const log = async (s) => {
      const workout = await env.f.logSet(w.id, "bench-press", s);
      return env.f.recordsSetBy(workout, "bench-press");
    };
    return { log };
  }

  it("is flagged for each record it beats", async () => {
    const { log } = await logging();
    expect(await log({ load: 140, reps: 10 })).toEqual(["heaviest", "e1rm"]); // 140 × 10: e1RM 186.7
    expect(await log({ load: 140, reps: 11 })).toEqual(["e1rm", "reps"]);
  });

  it("is flagged for more reps at a load done before", async () => {
    const { log } = await logging();
    expect(await log({ load: 135, reps: 11 })).toEqual(["e1rm", "reps"]);
  });

  it("isn't flagged when it only matches a record, or is a warm-up", async () => {
    const { log } = await logging();
    expect(await log({ load: 135, reps: 10 })).toEqual([]);
    expect(await log({ load: 200, reps: 5, warmUp: true })).toEqual([]);
  });

  it("isn't flagged in the first workout with the exercise, even beating an earlier set", async () => {
    const { f } = await withHistory();
    const work = await f.createGym("Work");
    const w = await f.startWorkout(work.id);
    await f.addExercise(w.id, "lat-pulldown");
    for (const reps of [8, 10]) {
      const workout = await f.logSet(w.id, "lat-pulldown", { load: 120, reps });
      expect(await f.recordsSetBy(workout, "lat-pulldown")).toEqual([]);
    }
  });

  it("counts the workout's earlier sets once there's an earlier workout", async () => {
    const { log } = await logging();
    expect(await log({ load: 140, reps: 8 })).toEqual(["heaviest"]);
    expect(await log({ load: 140, reps: 8 })).toEqual([]); // matches set 1
  });
});
