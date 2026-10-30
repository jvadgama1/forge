import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library as strength } from "./library-fixture.js";

/** @import { Exercise, ExerciseType, Workout, WorkoutSet } from "../../app/js/core/types.js" */

/**
 * @param {string} id
 * @param {ExerciseType} type
 * @param {"upper" | "lower"} [body]
 * @returns {Exercise}
 */
const exercise = (id, type, body = "upper") => ({
  id,
  name: id,
  type,
  primary: ["chest"],
  secondary: [],
  body,
});

/** The strength fixture plus one exercise of each other type (#19). */
const library = [
  ...strength,
  exercise("pull-up", "bodyweight-reps"),
  exercise("assisted-dip", "assisted"),
  exercise("farmers-carry", "timed", "lower"),
  exercise("treadmill", "cardio", "lower"),
];

/**
 * A stored set: a load in lb and a measure.
 * @param {Partial<WorkoutSet>} fields
 * @returns {WorkoutSet}
 */
const set = (fields) => ({
  load: 0,
  unit: "lb",
  loggedAt: "2026-10-01T18:00:00.000Z",
  ...fields,
});

/**
 * A finished workout on `date` with one exercise's sets.
 * @param {string} date YYYY-MM-DD
 * @param {string} exerciseId
 * @param {WorkoutSet[]} sets
 * @returns {Workout}
 */
const past = (date, exerciseId, sets) => ({
  id: `w-${exerciseId}-${date}`,
  date,
  startedAt: `${date}T18:00:00.000Z`,
  finishedAt: `${date}T19:00:00.000Z`,
  gymId: "gym",
  entries: [{ exerciseId, sets }],
});

/**
 * The core on 25 Oct 2026 over `workouts`, a gym, and a routine slotting
 * pull-ups and assisted dips at 3 × 8–12.
 * @param {Workout[]} workouts
 */
async function setup(...workouts) {
  const store = createMemoryStore();
  for (const w of workouts) await store.put("workouts", w);
  const f = createForge({
    store,
    library,
    now: () => new Date(2026, 9, 25, 18, 0),
  });
  const gym = await f.createGym("Work");
  await f.saveRoutine({
    name: "Upper",
    days: [
      {
        name: "Upper A",
        slots: [
          { exerciseId: "pull-up", sets: 3, repMin: 8, repMax: 12 },
          { exerciseId: "assisted-dip", sets: 3, repMin: 8, repMax: 12 },
        ],
      },
    ],
  });
  /** A freestyle workout today with `exerciseIds` added. */
  const start = async (/** @type {string[]} */ ...exerciseIds) => {
    let w = await f.startWorkout(gym.id);
    for (const id of exerciseIds) w = await f.addExercise(w.id, id);
    return w;
  };
  return { f, start };
}

/**
 * An exercise's sets in a workout, without when they were logged.
 * @param {Workout} workout
 * @param {string} exerciseId
 */
const setsOf = (workout, exerciseId) =>
  workout.entries
    .find((e) => e.exerciseId === exerciseId)
    ?.sets.map((set) =>
      Object.fromEntries(Object.entries(set).filter(([k]) => k !== "loggedAt")),
    );

describe("logging each exercise type (#19)", () => {
  it("bodyweight × reps records reps with an optional added load", async () => {
    const { f, start } = await setup();
    const w = await start("pull-up");
    await f.logSet(w.id, "pull-up", { reps: 10 });
    const logged = await f.logSet(w.id, "pull-up", { load: 25, reps: 6 });
    expect(setsOf(logged, "pull-up")).toEqual([
      { load: 0, unit: "lb", reps: 10 },
      { load: 25, unit: "lb", reps: 6 },
    ]);
  });

  it("assisted records the assist and reps", async () => {
    const { f, start } = await setup();
    const w = await start("assisted-dip");
    const logged = await f.logSet(w.id, "assisted-dip", { load: 40, reps: 8 });
    expect(setsOf(logged, "assisted-dip")).toEqual([
      { load: 40, unit: "lb", reps: 8 },
    ]);
  });

  it("a timed hold records seconds, with an optional load", async () => {
    const { f, start } = await setup();
    const w = await start("farmers-carry");
    await f.logSet(w.id, "farmers-carry", { seconds: 45 });
    const logged = await f.logSet(w.id, "farmers-carry", {
      load: 70,
      seconds: 40,
      warmUp: true,
    });
    expect(setsOf(logged, "farmers-carry")).toEqual([
      { load: 0, unit: "lb", seconds: 45 },
      { load: 70, unit: "lb", seconds: 40, warmUp: true },
    ]);
  });

  it("cardio records time, with an optional distance and its unit", async () => {
    const { f, start } = await setup();
    const w = await start("treadmill");
    await f.logSet(w.id, "treadmill", { seconds: 1200 });
    const logged = await f.logSet(w.id, "treadmill", {
      seconds: 900,
      distance: 1.5,
      distanceUnit: "mi",
    });
    expect(setsOf(logged, "treadmill")).toEqual([
      { load: 0, unit: "lb", seconds: 1200 },
      { load: 0, unit: "lb", seconds: 900, distance: 1.5, distanceUnit: "mi" },
    ]);
  });

  it("refuses a set without its type's measure", async () => {
    const { f, start } = await setup();
    const w = await start("farmers-carry", "treadmill", "bench-press");
    await expect(f.logSet(w.id, "farmers-carry", { reps: 10 })).rejects.toThrow(
      "Seconds must be 1 or more",
    );
    await expect(
      f.logSet(w.id, "treadmill", { seconds: 0, distance: 2 }),
    ).rejects.toThrow("Time must be more than 0");
    await expect(
      f.logSet(w.id, "treadmill", {
        seconds: 600,
        distance: -1,
        distanceUnit: "km",
      }),
    ).rejects.toThrow("Distance must be more than 0");
    await expect(f.logSet(w.id, "bench-press", { load: 135 })).rejects.toThrow(
      "Reps must be 1 or more",
    );
  });
});

describe("assisted progression (#19)", () => {
  it("takes assist away once every working set reaches the top of the rep range", async () => {
    const { f, start } = await setup(
      past("2026-10-20", "assisted-dip", [
        set({ load: 40, reps: 12 }),
        set({ load: 40, reps: 12 }),
      ]),
    );
    expect(
      await f.suggestedWeight(await start("assisted-dip"), "assisted-dip"),
    ).toEqual({ load: 35, unit: "lb", reason: "up", by: 5 });
  });

  it("adds assist back after two workouts below the range at that assist", async () => {
    const { f, start } = await setup(
      past("2026-10-16", "assisted-dip", [set({ load: 30, reps: 6 })]),
      past("2026-10-20", "assisted-dip", [set({ load: 30, reps: 7 })]),
    );
    expect(
      await f.suggestedWeight(await start("assisted-dip"), "assisted-dip"),
    ).toEqual({ load: 35, unit: "lb", reason: "down", by: 5 });
  });

  it("never suggests less than no assist", async () => {
    const { f, start } = await setup(
      past("2026-10-20", "assisted-dip", [set({ load: 0, reps: 12 })]),
    );
    expect(
      await f.suggestedWeight(await start("assisted-dip"), "assisted-dip"),
    ).toEqual({ load: 0, unit: "lb", reason: "up", by: 5 });
  });

  it("comes back with one increment more assist", async () => {
    const { f, start } = await setup(
      past("2026-10-01", "assisted-dip", [set({ load: 40, reps: 10 })]),
    );
    expect(
      await f.suggestedWeight(await start("assisted-dip"), "assisted-dip"),
    ).toEqual({ load: 45, unit: "lb", reason: "comeback", by: 5 });
  });
});

describe("bodyweight progression (#19)", () => {
  it("adds load once every working set reaches the top of the rep range", async () => {
    const { f, start } = await setup(
      past("2026-10-20", "pull-up", [
        set({ load: 0, reps: 12 }),
        set({ load: 0, reps: 12 }),
      ]),
    );
    const w = await start("pull-up");
    expect(await f.suggestedWeight(w, "pull-up")).toEqual({
      load: 5,
      unit: "lb",
      reason: "up",
      by: 5,
    });
    expect(await f.nextSet(w, "pull-up")).toEqual({ load: 5, reps: 8 });
  });
});

describe("timed holds and cardio (#19)", () => {
  it("start from the last workout's first working set, with no suggested weight", async () => {
    const { f, start } = await setup(
      past("2026-10-20", "farmers-carry", [
        set({ load: 50, seconds: 30, warmUp: true }),
        set({ load: 70, seconds: 45 }),
        set({ load: 70, seconds: 40 }),
      ]),
      past("2026-10-21", "treadmill", [
        set({ seconds: 1200, distance: 2, distanceUnit: "mi" }),
      ]),
    );
    const w = await start("farmers-carry", "treadmill");
    expect(await f.suggestedWeight(w, "farmers-carry")).toBeUndefined();
    expect(await f.nextSet(w, "farmers-carry")).toEqual({
      load: 70,
      seconds: 45,
    });
    expect(await f.nextSet(w, "treadmill")).toEqual({
      load: 0,
      seconds: 1200,
      distance: 2,
      distanceUnit: "mi",
    });
  });

  it("show their measures on the last-workout line", async () => {
    const { f } = await setup(
      past("2026-10-20", "treadmill", [
        set({ seconds: 1200, distance: 2, distanceUnit: "mi" }),
      ]),
    );
    expect(await f.lastWorkoutLine("treadmill")).toEqual({
      date: "2026-10-20",
      sets: [
        {
          load: 0,
          unit: "lb",
          seconds: 1200,
          distance: 2,
          distanceUnit: "mi",
        },
      ],
    });
  });

  it("have no e1RM and no records", async () => {
    const { f } = await setup(
      past("2026-10-20", "farmers-carry", [set({ load: 70, seconds: 45 })]),
      past("2026-10-21", "treadmill", [set({ seconds: 1200 })]),
    );
    for (const id of ["farmers-carry", "treadmill"]) {
      expect((await f.e1rmTrend(id)).points).toEqual([]);
      expect(await f.records(id)).toEqual({ repsAtLoad: [] });
    }
  });
});

describe("bodyweight e1RM and records (#19)", () => {
  /** Pull-ups on Oct 10 (body weight 180 lb) and Oct 20 (182 lb). */
  async function pullUps() {
    const env = await setup(
      past("2026-10-10", "pull-up", [
        set({ load: 0, reps: 10 }), // 180 × (1 + 10/30) = 240
        set({ load: 20, reps: 6 }), // 200 × 1.2 = 240
      ]),
      past("2026-10-20", "pull-up", [
        set({ load: 0, reps: 12 }), // 182 × 1.4 = 254.8
        set({ load: 20, reps: 5 }), // 202
      ]),
    );
    await env.f.addBodyWeight({ date: "2026-10-01", load: 180, unit: "lb" });
    await env.f.addBodyWeight({ date: "2026-10-15", load: 182, unit: "lb" });
    // After the last workout: counts for neither.
    await env.f.addBodyWeight({ date: "2026-10-24", load: 190, unit: "lb" });
    return env;
  }

  it("uses the body weight on or before the workout date, plus added load", async () => {
    const { f } = await pullUps();
    const trend = await f.e1rmTrend("pull-up");
    expect(trend.points.map((p) => p.date)).toEqual([
      "2026-10-10",
      "2026-10-20",
    ]);
    expect(trend.points[0].value).toBeCloseTo(240, 2);
    expect(trend.points[1].value).toBeCloseTo(254.8, 2);
  });

  it("records the heaviest body weight plus added load, and most reps at each added load", async () => {
    const { f } = await pullUps();
    const records = await f.records("pull-up");
    expect(records.heaviest).toEqual({ load: 202, unit: "lb" });
    expect(records.bestE1rm?.value).toBeCloseTo(254.8, 2);
    expect(records.repsAtLoad).toEqual([
      { load: 20, unit: "lb", reps: 6 },
      { load: 0, unit: "lb", reps: 12 },
    ]);
  });

  it("without a body weight on record, has no e1RM or heaviest, only reps at a load", async () => {
    const { f } = await setup(
      past("2026-10-20", "pull-up", [set({ load: 0, reps: 12 })]),
    );
    expect((await f.e1rmTrend("pull-up")).points).toEqual([]);
    expect(await f.records("pull-up")).toEqual({
      repsAtLoad: [{ load: 0, unit: "lb", reps: 12 }],
    });
  });

  it("celebrates a set that beats the heaviest body weight plus added load", async () => {
    const { f, start } = await pullUps();
    const w = await start("pull-up");
    // 190 + 15 = 205: heavier than 202.
    const logged = await f.logSet(w.id, "pull-up", { load: 15, reps: 3 });
    expect(await f.recordsSetBy(logged, "pull-up")).toEqual(["heaviest"]);
  });
});

describe("assisted records (#19)", () => {
  it("are the least assist and most reps at each assist, with no e1RM", async () => {
    const { f } = await setup(
      past("2026-10-10", "assisted-dip", [set({ load: 40, reps: 10 })]),
      past("2026-10-20", "assisted-dip", [
        set({ load: 30, reps: 8 }),
        set({ load: 40, reps: 12 }),
      ]),
    );
    expect(await f.records("assisted-dip")).toEqual({
      leastAssist: { load: 30, unit: "lb" },
      repsAtLoad: [
        { load: 40, unit: "lb", reps: 12 },
        { load: 30, unit: "lb", reps: 8 },
      ],
    });
    expect((await f.e1rmTrend("assisted-dip")).points).toEqual([]);
  });

  it("celebrate less assist than ever, never more", async () => {
    const { f, start } = await setup(
      past("2026-10-20", "assisted-dip", [set({ load: 30, reps: 8 })]),
    );
    const w = await start("assisted-dip");
    const more = await f.logSet(w.id, "assisted-dip", { load: 50, reps: 6 });
    expect(await f.recordsSetBy(more, "assisted-dip")).toEqual([]);
    const less = await f.logSet(w.id, "assisted-dip", { load: 25, reps: 5 });
    expect(await f.recordsSetBy(less, "assisted-dip")).toEqual([
      "least-assist",
    ]);
  });
});
