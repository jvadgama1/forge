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
 * A finished workout on `date` with one exercise's sets, stored directly as
 * a past one would be.
 * @param {string} date YYYY-MM-DD
 * @param {WorkoutSet[]} sets
 * @param {string} [exerciseId]
 * @returns {Workout}
 */
const past = (date, sets, exerciseId = "bench-press") => ({
  id: `w-${exerciseId}-${date}`,
  date,
  startedAt: `${date}T18:00:00.000Z`,
  finishedAt: `${date}T19:00:00.000Z`,
  gymId: "gym",
  entries: [{ exerciseId, sets }],
});

/**
 * The core on 25 Oct 2026 over a store holding `workouts`, a gym, and a
 * routine whose Push A has bench press at 3 × 8–12 and leg press at
 * 3 × 10–15.
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
  const routine = await f.saveRoutine({
    name: "PPL",
    days: [
      {
        name: "Push A",
        slots: [
          { exerciseId: "bench-press", sets: 3, repMin: 8, repMax: 12 },
          { exerciseId: "leg-press", sets: 3, repMin: 10, repMax: 15 },
        ],
      },
    ],
  });
  const day = { routineId: routine.id, dayId: routine.versions[0].days[0].id };
  return {
    f,
    /** Today's Push A workout, started. */
    pushA: () => f.startWorkout(gym.id, { day }),
    /**
     * A freestyle workout, started, optionally back-dated.
     * @param {string} [date]
     */
    freestyle: (date) => f.startWorkout(gym.id, date ? { date } : {}),
  };
}

describe("suggested weight by double progression (#15)", () => {
  it("is none without a last workout", async () => {
    const { f, pushA } = await setup();
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toBe(
      undefined,
    );
  });

  it("holds the last working load until every working set reaches the top of the rep range", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [set(135, 12), set(135, 12), set(135, 10)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 135,
      unit: "lb",
      reason: "hold",
    });
  });

  it("adds the increment once every working set reaches the top of the rep range: 5 lb upper body", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [set(135, 12), set(135, 12), set(135, 13)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 140,
      unit: "lb",
      reason: "up",
    });
  });

  it("adds 10 lb for a lower-body exercise", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [set(300, 15), set(300, 15)], "leg-press"),
    );
    expect(await f.suggestedWeight(await pushA(), "leg-press")).toEqual({
      load: 310,
      unit: "lb",
      reason: "up",
    });
  });

  it("ignores warm-up and drop sets: only working sets count", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [
        set(95, 5, { warmUp: true }),
        set(135, 12),
        set(135, 12),
        set(95, 6, { drop: true }),
      ]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 140,
      unit: "lb",
      reason: "up",
    });
  });

  it("starts from the last working set's load when the loads differed", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [set(125, 12), set(135, 10)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 135,
      unit: "lb",
      reason: "hold",
    });
  });

  it("drops by the increment after two workouts in a row with a working set below the bottom of the range", async () => {
    const { f, pushA } = await setup(
      past("2026-10-16", [set(145, 9), set(145, 7)]),
      past("2026-10-20", [set(145, 8), set(145, 6)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 140,
      unit: "lb",
      reason: "down",
    });
  });

  it("holds after only one workout below the bottom of the range", async () => {
    const { f, pushA } = await setup(
      past("2026-10-12", [set(145, 7)]),
      past("2026-10-16", [set(145, 9), set(145, 8)]),
      past("2026-10-20", [set(145, 8), set(145, 6)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 145,
      unit: "lb",
      reason: "hold",
    });
  });

  it("never drops below 0", async () => {
    const { f, pushA } = await setup(
      past("2026-10-16", [set(0, 5)]),
      past("2026-10-20", [set(0, 5)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 0,
      unit: "lb",
      reason: "down",
    });
  });

  it("in freestyle, uses the rep range from the exercise's slot in a routine", async () => {
    const { f, freestyle } = await setup(
      past("2026-10-20", [set(135, 12), set(135, 12)]),
    );
    expect(await f.suggestedWeight(await freestyle(), "bench-press")).toEqual({
      load: 140,
      unit: "lb",
      reason: "up",
    });
  });

  it("without a rep range, suggests the last working load", async () => {
    const { f, freestyle } = await setup(
      past("2026-10-20", [set(50, 20), set(50, 20)], "triceps-pushdown"),
    );
    expect(
      await f.suggestedWeight(await freestyle(), "triceps-pushdown"),
    ).toEqual({ load: 50, unit: "lb", reason: "hold" });
  });

  it("skips a last workout with only warm-ups, going back to the one before", async () => {
    const { f, pushA } = await setup(
      past("2026-10-18", [set(135, 12), set(135, 12)]),
      past("2026-10-21", [set(95, 10, { warmUp: true })]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 140,
      unit: "lb",
      reason: "up",
    });
  });
});

describe("comeback (#15)", () => {
  it("after 14 or more days without the exercise, suggests 90% of the last working load, rounded down to the increment", async () => {
    // 90% of 135 is 121.5, down to a multiple of 5: 120.
    const { f, pushA } = await setup(
      past("2026-10-11", [set(135, 12), set(135, 12)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 120,
      unit: "lb",
      reason: "comeback",
    });
  });

  it("rounds to a lower-body exercise's 10 lb increment", async () => {
    // 90% of 315 is 283.5, down to a multiple of 10: 280.
    const { f, pushA } = await setup(
      past("2026-09-01", [set(315, 10)], "leg-press"),
    );
    expect(await f.suggestedWeight(await pushA(), "leg-press")).toEqual({
      load: 280,
      unit: "lb",
      reason: "comeback",
    });
  });

  it("isn't one 13 days later", async () => {
    const { f, pushA } = await setup(
      past("2026-10-12", [set(135, 10), set(135, 10)]),
    );
    expect(await f.suggestedWeight(await pushA(), "bench-press")).toEqual({
      load: 135,
      unit: "lb",
      reason: "hold",
    });
  });

  it("counts the days to the workout's own date when it's back-dated", async () => {
    const { f, freestyle } = await setup(past("2026-10-01", [set(135, 10)]));
    const workout = await freestyle("2026-10-10");
    expect(await f.suggestedWeight(workout, "bench-press")).toEqual({
      load: 135,
      unit: "lb",
      reason: "hold",
    });
  });
});

describe("the first set (#15)", () => {
  it("starts from the suggested weight and the bottom of the rep range", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [set(135, 12), set(135, 12)]),
    );
    expect(await f.nextSet(await pushA(), "bench-press")).toEqual({
      load: 140,
      reps: 8,
    });
  });

  it("without a rep range, starts from the last working set", async () => {
    const { f, freestyle } = await setup(
      past("2026-10-20", [set(50, 20), set(55, 15)], "triceps-pushdown"),
    );
    expect(await f.nextSet(await freestyle(), "triceps-pushdown")).toEqual({
      load: 55,
      reps: 15,
    });
  });

  it("starts empty with no last workout", async () => {
    const { f, pushA } = await setup();
    expect(await f.nextSet(await pushA(), "bench-press")).toBe(undefined);
  });

  it("is followed by sets that start from the previous set, whatever the suggestion", async () => {
    const { f, pushA } = await setup(
      past("2026-10-20", [set(135, 12), set(135, 12)]),
    );
    const workout = await pushA();
    const logged = await f.logSet(workout.id, "bench-press", {
      load: 130,
      reps: 9,
    });
    expect(await f.nextSet(logged, "bench-press")).toEqual({
      load: 130,
      reps: 9,
    });
  });
});
