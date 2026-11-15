import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** @import { Routine, Workout } from "../../app/js/core/types.js" */

// Supersets are out of the app for now (#167; .out-of-scope/supersets.md).
// Data logged with them (#17) keeps its superset fields, which nothing but
// the CSV export reads: every exercise follows the single-exercise rules.

/**
 * A workout in progress, as stored before #167, with bench press and lat
 * pulldown paired and a round of each logged: bench press first, then lat
 * pulldown, so lat pulldown's set is the latest.
 * @type {Workout}
 */
const PAIRED_NOW = {
  id: "w-now",
  date: "2026-10-25",
  startedAt: "2026-10-25T17:00:00.000Z",
  gymId: "gym",
  supersets: [{ id: "s-now", exerciseIds: ["bench-press", "lat-pulldown"] }],
  entries: [
    {
      exerciseId: "bench-press",
      sets: [
        {
          load: 100,
          unit: "lb",
          reps: 8,
          loggedAt: "2026-10-25T17:05:00.000Z",
          superset: { id: "s-now", round: 1 },
        },
      ],
    },
    {
      exerciseId: "lat-pulldown",
      sets: [
        {
          load: 90,
          unit: "lb",
          reps: 10,
          loggedAt: "2026-10-25T17:06:00.000Z",
          superset: { id: "s-now", round: 1 },
        },
      ],
    },
    { exerciseId: "leg-press", sets: [] },
  ],
};

/**
 * A finished workout, as stored before #167, that supersetted bench press
 * with lat pulldown for two rounds.
 * @type {Workout}
 */
const PAIRED_BEFORE = {
  id: "w-before",
  date: "2026-10-20",
  startedAt: "2026-10-20T17:00:00.000Z",
  finishedAt: "2026-10-20T18:00:00.000Z",
  gymId: "gym",
  supersets: [{ id: "s-old", exerciseIds: ["bench-press", "lat-pulldown"] }],
  entries: ["bench-press", "lat-pulldown"].map((exerciseId, e) => ({
    exerciseId,
    sets: [1, 2].map((round) => ({
      load: 100 - 10 * e,
      unit: /** @type {const} */ ("lb"),
      reps: 8 + round,
      rir: 2,
      loggedAt: `2026-10-20T17:1${round}:${e}0.000Z`,
      superset: { id: "s-old", round },
    })),
  })),
};

/**
 * A routine saved before #167 whose Upper A plans bench press and lat
 * pulldown as a pair.
 * @type {Routine}
 */
const PAIRED_ROUTINE = {
  id: "r-upper",
  name: "Upper",
  versions: [
    {
      number: 1,
      savedAt: "2026-10-01T12:00:00.000Z",
      days: [
        {
          id: "d-a",
          name: "Upper A",
          slots: [
            {
              exerciseId: "bench-press",
              sets: 4,
              repMin: 8,
              repMax: 12,
              superset: "bench-press",
            },
            {
              exerciseId: "lat-pulldown",
              sets: 2,
              repMin: 8,
              repMax: 12,
              superset: "bench-press",
            },
            { exerciseId: "leg-press", sets: 3, repMin: 10, repMax: 15 },
          ],
        },
      ],
    },
  ],
};

/**
 * The core on 25 Oct 2026 over data stored with supersets.
 * @param {{ inProgress?: boolean }} [options] whether PAIRED_NOW is the
 *   workout in progress
 */
async function setup({ inProgress = false } = {}) {
  const store = createMemoryStore({
    gyms: [{ id: "gym", name: "Work", exerciseIds: [] }],
    routines: [PAIRED_ROUTINE],
    workouts: inProgress ? [PAIRED_BEFORE, PAIRED_NOW] : [PAIRED_BEFORE],
    settings: [
      {
        id: "user",
        lastGymId: "gym",
        ...(inProgress && { workoutInProgress: PAIRED_NOW.id }),
      },
    ],
  });
  const f = createForge({
    store,
    library,
    now: () => new Date(2026, 9, 25, 18, 0),
  });
  return { f, store };
}

describe("a routine day stored with planned pairs (#167)", () => {
  /** Upper A, started from PAIRED_ROUTINE. */
  async function started() {
    const env = await setup();
    const w = await env.f.startWorkout("gym", {
      day: { routineId: "r-upper", dayId: "d-a" },
    });
    return { ...env, w };
  }

  it("starts as single exercises, with no superset", async () => {
    const { w } = await started();
    expect(w.supersets).toBeUndefined();
    expect(w.entries.map((e) => e.exerciseId)).toEqual([
      "bench-press",
      "lat-pulldown",
      "leg-press",
    ]);
  });

  it("logs every set of an exercise on its own, at its own rest default", async () => {
    const { f, w } = await started();
    let logged = w;
    for (let i = 0; i < 4; i++)
      logged = await f.logSet(w.id, "bench-press", { load: 100, reps: 8 });
    expect(logged.entries[0].sets.map((s) => s.superset)).toEqual(
      Array(4).fill(undefined),
    );
    expect(await f.restAfterSet("bench-press")).toBe(90);
    expect(f.exerciseToShow(logged)).toBe("bench-press");
  });

  it("has no changes to save when done in the day's order", async () => {
    const { f, w } = await started();
    const logged = await f.logSet(w.id, "bench-press", { load: 100, reps: 8 });
    expect(await f.routineChanges(logged)).toBe(false);
  });

  it("saves a day done differently as a version with no planned pairs, keeping the earlier version's", async () => {
    const { f, w } = await started();
    await f.addExercise(w.id, "incline-db-press");
    await f.logSet(w.id, "incline-db-press", { load: 50, reps: 10 });
    await f.finishWorkout(w.id, { saveToRoutine: true });
    const routine = await f.getRoutine("r-upper");
    expect(routine?.versions).toHaveLength(2);
    expect(routine?.versions[0]).toEqual(PAIRED_ROUTINE.versions[0]);
    expect(routine?.versions[1].days[0].slots.map((s) => s.superset)).toEqual([
      undefined,
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("adds no version when saved from the editor unchanged", async () => {
    const { f } = await setup();
    const routine = await f.saveRoutine({
      id: "r-upper",
      name: "Upper",
      days: PAIRED_ROUTINE.versions[0].days,
    });
    expect(routine.versions).toEqual(PAIRED_ROUTINE.versions);
  });

  it("saves a change as a version with no planned pairs", async () => {
    const { f } = await setup();
    const [day] = PAIRED_ROUTINE.versions[0].days;
    const routine = await f.saveRoutine({
      id: "r-upper",
      name: "Upper",
      days: [{ ...day, slots: day.slots.map((s) => ({ ...s, sets: 3 })) }],
    });
    expect(routine.versions[0]).toEqual(PAIRED_ROUTINE.versions[0]);
    expect(routine.versions[1].days[0].slots.map((s) => s.superset)).toEqual([
      undefined,
      undefined,
      undefined,
    ]);
  });

  it("swaps an exercise without touching any stored superset", async () => {
    const { f, store } = await setup();
    // An Upper A started before #167, its planned pair applied.
    await store.put("workouts", {
      id: "w-paired",
      date: "2026-10-25",
      startedAt: "2026-10-25T17:00:00.000Z",
      gymId: "gym",
      routine: { routineId: "r-upper", version: 1, dayId: "d-a" },
      supersets: [{ id: "s-1", exerciseIds: ["bench-press", "lat-pulldown"] }],
      entries: ["bench-press", "lat-pulldown", "leg-press"].map((id) => ({
        exerciseId: id,
        sets: [],
      })),
    });
    const w = await f.swapExercise(
      "w-paired",
      "bench-press",
      "incline-db-press",
    );
    expect(w.entries[0]).toMatchObject({
      exerciseId: "incline-db-press",
      swappedFor: "bench-press",
    });
    expect(w.supersets).toEqual([
      { id: "s-1", exerciseIds: ["bench-press", "lat-pulldown"] },
    ]);
    expect(await f.routineChanges(w)).toBe(false);
  });
});

describe("a past workout stored with a superset (#167)", () => {
  it("shows its sets on the last-workout line with no partners", async () => {
    const { f } = await setup();
    expect(await f.lastWorkoutLine("lat-pulldown")).toEqual({
      date: "2026-10-20",
      sets: [
        { load: 90, unit: "lb", reps: 9 },
        { load: 90, unit: "lb", reps: 10 },
      ],
      rir: 2,
    });
  });

  it("counts its sets in history and records", async () => {
    const { f } = await setup();
    const history = await f.history("bench-press");
    expect(history.map((h) => h.sets.length)).toEqual([2]);
    expect((await f.records("bench-press")).heaviest).toEqual({
      load: 100,
      unit: "lb",
    });
  });

  it("keeps its superset and round in the CSV export, empty for a new set", async () => {
    const { f } = await setup({ inProgress: true });
    await f.logSet("w-now", "leg-press", { load: 200, reps: 10 });
    const rows = (await f.exportSetsCsv()).slice(1).trim().split("\r\n");
    expect(rows[0]).toBe(
      "date,gym,exercise,set,load,unit,reps,seconds,distance,distance_unit,rir,warm_up,drop_set,superset,round,superset_with,swapped_for,in_progress",
    );
    expect(rows.slice(1)).toEqual([
      "2026-10-20,Work,Bench Press,1,100,lb,9,,,,2,,,1,1,Lat Pulldown,,",
      "2026-10-20,Work,Bench Press,2,100,lb,10,,,,2,,,1,2,Lat Pulldown,,",
      "2026-10-20,Work,Lat Pulldown,1,90,lb,9,,,,2,,,1,1,Bench Press,,",
      "2026-10-20,Work,Lat Pulldown,2,90,lb,10,,,,2,,,1,2,Bench Press,,",
      "2026-10-25,Work,Bench Press,1,100,lb,8,,,,,,,1,1,Lat Pulldown,,yes",
      "2026-10-25,Work,Lat Pulldown,1,90,lb,10,,,,,,,1,1,Bench Press,,yes",
      "2026-10-25,Work,Leg Press,1,200,lb,10,,,,,,,,,,,yes",
    ]);
  });
});

describe("the core (#167)", () => {
  it("offers no way to pair exercises, in a workout or a routine", async () => {
    const { f } = await setup();
    for (const removed of [
      "pairExercises",
      "unpairExercise",
      "partnersFor",
      "supersetOf",
      "pairWithNext",
      "undoTarget",
      "nextExercise",
    ])
      expect(f).not.toHaveProperty(removed);
  });
});

describe("logging in a workout stored with a superset (#167)", () => {
  it("records no superset round on a new set", async () => {
    const { f } = await setup({ inProgress: true });
    const w = await f.logSet("w-now", "bench-press", { load: 100, reps: 8 });
    const bench = w.entries.find((e) => e.exerciseId === "bench-press");
    expect(bench?.sets.at(-1)?.superset).toBeUndefined();
  });

  it("rests each exercise's own rest default after every set", async () => {
    const { f } = await setup({ inProgress: true });
    await f.saveExerciseSettings("lat-pulldown", { rest: 120 });
    await f.logSet("w-now", "bench-press", { load: 100, reps: 8 });
    expect(await f.restAfterSet("bench-press")).toBe(90);
    await f.logSet("w-now", "lat-pulldown", { load: 90, reps: 10 });
    expect(await f.restAfterSet("lat-pulldown")).toBe(120);
  });

  it("undoes the exercise's own last set, though its old partner's is later", async () => {
    const { f } = await setup({ inProgress: true });
    const w = await f.undoLastSet("w-now", "bench-press");
    expect(w.entries.map((e) => e.sets.length)).toEqual([0, 1, 0]);
  });

  it("leaves the stored superset fields as they were when exercises are skipped or removed", async () => {
    const { f, store } = await setup({ inProgress: true });
    await f.addExercise("w-now", "incline-db-press");
    await f.skipExercise("w-now", "lat-pulldown");
    await f.removeExercise("w-now", "incline-db-press");
    const w = /** @type {Workout} */ (await store.get("workouts", "w-now"));
    expect(w.supersets).toEqual(PAIRED_NOW.supersets);
    expect(w.entries.map((e) => e.sets.map((s) => s.superset))).toEqual([
      [{ id: "s-now", round: 1 }],
      [{ id: "s-now", round: 1 }],
      [],
    ]);
  });
});
