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
  it("shows its date, working sets and the last working set's RIR", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-14", [
        set(95, 10, { warmUp: true }),
        set(135, 10),
        set(135, 8, { rir: 1 }),
        set(115, 12, { drop: true }),
      ]),
    );
    expect(await f.lastWorkoutLine("bench-press")).toEqual({
      date: "2026-10-14",
      sets: [
        { load: 135, unit: "lb", reps: 10 },
        { load: 135, unit: "lb", reps: 8 },
      ],
      rir: 1,
    });
  });

  it("says when it had only warm-ups", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-14", [set(95, 10, { warmUp: true })]),
    );
    expect(await f.lastWorkoutLine("bench-press")).toEqual({
      date: "2026-10-14",
      sets: [],
    });
  });

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
  it("orders workouts on the same date by start time", async () => {
    const { f } = await withHistory(
      past("am", "2026-10-14", [set(135, 8)], "2026-10-14T08:00:00.000Z"),
      past("pm", "2026-10-14", [set(135, 9)], "2026-10-14T18:00:00.000Z"),
    );
    expect((await f.history("bench-press")).map((h) => h.workout.id)).toEqual([
      "pm",
      "am",
    ]);
  });

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

describe("e1RM trend (#13)", () => {
  /** @param {WorkoutSet[]} sets one workout's sets @returns the trend's one value */
  const e1rmOf = async (sets) => {
    const { f } = await withHistory(past("a", "2026-10-14", sets));
    return (await f.e1rmTrend("bench-press")).points[0]?.value;
  };

  it("is Epley's estimate for working sets of 1 to 12 reps", async () => {
    expect(await e1rmOf([set(100, 10)])).toBeCloseTo(133.33, 2); // 100 × (1 + 10/30)
    expect(await e1rmOf([set(225, 1)])).toBeCloseTo(232.5, 2); // 225 × (1 + 1/30)
    expect(await e1rmOf([set(60, 12)])).toBeCloseTo(84, 2); // 60 × 1.4
  });

  it("isn't defined past 12 reps, for warm-up or drop sets, or with no load", async () => {
    expect(await e1rmOf([set(60, 13)])).toBeUndefined();
    expect(await e1rmOf([set(100, 10, { warmUp: true })])).toBeUndefined();
    expect(await e1rmOf([set(100, 10, { drop: true })])).toBeUndefined();
    expect(await e1rmOf([set(0, 10)])).toBeUndefined();
  });

  it("gives each workout's best, oldest first", async () => {
    const { f } = await withHistory(
      past("b", "2026-10-14", [set(135, 10), set(140, 5)]), // 180, 163.3
      past("a", "2026-10-07", [set(130, 10)]), // 173.3
    );
    const trend = await f.e1rmTrend("bench-press");
    expect(trend.unit).toBe("lb");
    expect(trend.points.map((p) => [p.workoutId, p.date])).toEqual([
      ["a", "2026-10-07"],
      ["b", "2026-10-14"],
    ]);
    expect(trend.points[1].value).toBeCloseTo(180, 2);
  });

  it("is in the unit of the latest workout, comparing across units in kg", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-07", [set(100, 10)]), // 133.33 lb = 60.48 kg
      past("b", "2026-10-14", [
        set(60, 10, { unit: "kg" }), // 80 kg
        set(130, 10), // 173.33 lb = 78.62 kg: less, though the number is bigger
      ]),
    );
    const trend = await f.e1rmTrend("bench-press");
    expect(trend.unit).toBe("kg");
    expect(trend.points[0].value).toBeCloseTo(60.48, 2);
    expect(trend.points[1].value).toBeCloseTo(80, 2);
  });

  it("is empty for a bodyweight exercise with no body weight on record", async () => {
    const { f, store } = await withHistory({
      ...past("a", "2026-10-14", []),
      entries: [{ exerciseId: "dips", sets: [set(0, 12), set(25, 8)] }],
    });
    await store.put("customExercises", {
      id: "dips",
      name: "Dips",
      type: "bodyweight-reps",
      primary: ["chest", "triceps"],
      secondary: [],
      body: "upper",
    });
    expect((await f.e1rmTrend("dips")).points).toEqual([]);
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

  it("compare loads across units in kg", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-07", [set(150, 8), set(132.3, 9)]),
      past("b", "2026-10-14", [
        set(70, 5, { unit: "kg" }), // 154.3 lb: heavier than 150 lb
        set(60, 11, { unit: "kg" }), // the same load as 132.3 lb, to 100 g
      ]),
    );
    const records = await f.records("bench-press");
    expect(records.heaviest).toEqual({ load: 70, unit: "kg" });
    expect(records.repsAtLoad).toEqual([
      { load: 70, unit: "kg", reps: 5 },
      { load: 150, unit: "lb", reps: 8 },
      { load: 60, unit: "kg", reps: 11 },
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
    /** @param {{ load: number, reps: number, warmUp?: boolean, drop?: boolean }} s */
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

  it("isn't flagged when it only matches a record, or is a warm-up or drop set", async () => {
    const { log } = await logging();
    expect(await log({ load: 135, reps: 10 })).toEqual([]);
    expect(await log({ load: 200, reps: 5, warmUp: true })).toEqual([]);
    expect(await log({ load: 200, reps: 5, drop: true })).toEqual([]);
  });

  it("isn't flagged when earlier workouts had only warm-ups", async () => {
    const { f } = await withHistory(
      past("a", "2026-10-14", [set(95, 10, { warmUp: true })]),
    );
    const work = await f.createGym("Work");
    const w = await f.startWorkout(work.id);
    await f.addExercise(w.id, "bench-press");
    for (const reps of [8, 10]) {
      const workout = await f.logSet(w.id, "bench-press", { load: 135, reps });
      expect(await f.recordsSetBy(workout, "bench-press")).toEqual([]);
    }
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
