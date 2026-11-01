import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library as strength } from "./library-fixture.js";

/** @import { Workout, WorkoutSet } from "../../app/js/core/types.js" */

/**
 * The strength fixture, an assisted exercise (no e1RM), a bodyweight one
 * (its e1RM counts the body weight on the day), a timed hold and cardio, as
 * in #19.
 */
const library = [
  ...strength,
  /** @type {import("../../app/js/core/types.js").Exercise} */ ({
    id: "assisted-dip",
    name: "Assisted Dip",
    type: "assisted",
    primary: ["triceps"],
    secondary: ["chest"],
    body: "upper",
  }),
  /** @type {import("../../app/js/core/types.js").Exercise} */ ({
    id: "pull-up",
    name: "Pull-up",
    type: "bodyweight-reps",
    primary: ["lats-upper-back"],
    secondary: ["biceps"],
    body: "upper",
  }),
  /** @type {import("../../app/js/core/types.js").Exercise} */ ({
    id: "plank",
    name: "Plank",
    type: "timed",
    primary: ["abs"],
    secondary: [],
    body: "upper",
  }),
  /** @type {import("../../app/js/core/types.js").Exercise} */ ({
    id: "treadmill",
    name: "Treadmill",
    type: "cardio",
    primary: ["quads"],
    secondary: [],
    body: "lower",
  }),
];

/**
 * `n` working sets of 100 lb × 10.
 * @param {number} n
 * @param {Partial<WorkoutSet>} [more]
 */
const sets = (n, more = {}) =>
  Array.from({ length: n }, () => set(100, 10, more));

/**
 * A muscle group's row on the hard-sets card.
 * @param {Awaited<ReturnType<ReturnType<typeof createForge>["dashboard"]>>} dashboard
 * @param {string} id
 */
const muscleGroup = (dashboard, id) =>
  dashboard.hardSets.muscleGroups.find((m) => m.id === id);

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
 * A finished workout on `date` with one exercise's sets.
 * @param {string} id
 * @param {string} date YYYY-MM-DD
 * @param {string} exerciseId
 * @param {WorkoutSet[]} sets
 * @param {string} [startedAt] defaults to 18:00 UTC that date
 * @returns {Workout}
 */
const past = (
  id,
  date,
  exerciseId,
  sets,
  startedAt = `${date}T18:00:00.000Z`,
) => ({
  id,
  date,
  startedAt,
  finishedAt: startedAt.replace("T18", "T19"),
  gymId: "gym",
  entries: [{ exerciseId, sets }],
});

/**
 * The same workout, still in progress.
 * @param {Workout} workout
 * @returns {Workout}
 */
// eslint-disable-next-line no-unused-vars -- left out on purpose
const inProgress = ({ finishedAt, ...workout }) => workout;

/**
 * Points with values to 2 decimal places: loads compare through kg, so a
 * worked 180 comes back as 179.99999999999997.
 * @param {{ value: number }[] | undefined} points
 */
const toCents = (points) =>
  points?.map((p) => ({ ...p, value: Math.round(p.value * 100) / 100 }));

/**
 * The core over a store holding `workouts`, on Wednesday 28 Oct 2026 at
 * 18:00, in the week of Monday 26 Oct to Sunday 1 Nov.
 * @param {Workout[]} workouts
 */
async function withWorkouts(...workouts) {
  const store = createMemoryStore();
  for (const w of workouts) await store.put("workouts", w);
  const now = () => new Date(2026, 9, 28, 18, 0);
  return { f: createForge({ store, library, now }), store, now };
}

describe("dashboard range (spec #80; #82)", () => {
  it("covers 12 whole Monday-to-Sunday weeks by default, ending with the current week", async () => {
    const { f } = await withWorkouts();
    expect((await f.dashboard()).range).toEqual({
      id: "12w",
      weeks: 12,
      from: "2026-08-10",
      to: "2026-11-01",
    });
  });

  it("covers 4 weeks or a year when chosen", async () => {
    const { f } = await withWorkouts();
    await f.chooseDashboard({ range: "4w" });
    expect((await f.dashboard()).range).toEqual({
      id: "4w",
      weeks: 4,
      from: "2026-10-05",
      to: "2026-11-01",
    });
    await f.chooseDashboard({ range: "1y" });
    expect((await f.dashboard()).range).toEqual({
      id: "1y",
      weeks: 52,
      from: "2025-11-03",
      to: "2026-11-01",
    });
  });

  it("counts workouts from the first day of 4 weeks or a year back", async () => {
    const { f } = await withWorkouts(
      past("1y-out", "2025-11-02", "bench-press", [set(150, 6)]),
      past("1y-in", "2025-11-03", "bench-press", [set(150, 6)]),
      past("4w-out", "2026-10-04", "bench-press", [set(150, 6)]),
      past("4w-in", "2026-10-05", "bench-press", [set(150, 6)]),
    );
    const shown = async () =>
      (await f.dashboard()).e1rm?.points.map((p) => p.workoutId);
    await f.chooseDashboard({ range: "4w" });
    expect(await shown()).toEqual(["4w-in"]);
    await f.chooseDashboard({ range: "1y" });
    expect(await shown()).toEqual(["1y-in", "4w-out", "4w-in"]);
  });

  it("remembers the range chosen, on every device", async () => {
    const { f, store, now } = await withWorkouts();
    await f.chooseDashboard({ range: "4w" });
    const later = createForge({ store, library, now });
    expect((await later.dashboard()).range.id).toBe("4w");
  });

  it("starts the week on Monday, so a Monday or a Sunday today keeps its week", async () => {
    const store = createMemoryStore();
    const on = (/** @type {number} */ day) =>
      createForge({ store, library, now: () => new Date(2026, 9, day, 9) });
    expect((await on(26).dashboard()).range.to).toBe("2026-11-01");
    expect((await on(25).dashboard()).range.to).toBe("2026-10-25");
  });
});

describe("dashboard e1RM trend (spec #80; #82)", () => {
  it("shows each finished workout's best e1RM in the range, back-dated ones on their own date", async () => {
    const { f } = await withWorkouts(
      past("before", "2026-08-09", "bench-press", [set(200, 5)]),
      past("first-day", "2026-08-10", "bench-press", [set(150, 6)]),
      past("oct-1", "2026-10-01", "bench-press", [
        set(100, 12, { warmUp: true }),
        set(150, 9),
        set(150, 7),
      ]),
      // Logged on Oct 27 for Oct 5.
      past(
        "back-dated",
        "2026-10-05",
        "bench-press",
        [set(165, 6)],
        "2026-10-27T18:00:00.000Z",
      ),
      inProgress(past("today", "2026-10-28", "bench-press", [set(225, 5)])),
    );
    const { e1rm } = await f.dashboard();
    expect(e1rm?.exerciseId).toBe("bench-press");
    expect(e1rm?.unit).toBe("lb");
    expect(toCents(e1rm?.points)).toEqual([
      { workoutId: "first-day", date: "2026-08-10", value: 180 },
      { workoutId: "oct-1", date: "2026-10-01", value: 195 },
      { workoutId: "back-dated", date: "2026-10-05", value: 198 },
    ]);
  });

  it("leads with the latest e1RM and the change since the range's first, in whole weeks", async () => {
    const { f } = await withWorkouts(
      past("aug-10", "2026-08-10", "bench-press", [set(150, 6)]), // 180
      past("oct-1", "2026-10-01", "bench-press", [set(150, 9)]), // 195
      past("oct-5", "2026-10-05", "bench-press", [set(165, 6)]), // 198
    );
    const { e1rm } = await f.dashboard();
    expect(e1rm?.latest).toBeCloseTo(198, 2);
    expect(e1rm?.change?.value).toBeCloseTo(18, 2);
    expect(e1rm?.change?.weeks).toBe(8); // Aug 10 to Oct 5: 56 days
  });

  it("has no change with only one workout in the range", async () => {
    const { f } = await withWorkouts(
      past("aug-3", "2026-08-03", "bench-press", [set(150, 6)]),
      past("oct-5", "2026-10-05", "bench-press", [set(165, 6)]),
    );
    const { e1rm } = await f.dashboard();
    expect(e1rm?.latest).toBeCloseTo(198, 2);
    expect(e1rm?.change).toBeUndefined();
  });

  it("offers the exercises with an e1RM from finished workouts, by name", async () => {
    const { f } = await withWorkouts(
      past("old", "2025-01-06", "lat-pulldown", [set(120, 10)]),
      past("dips", "2026-10-20", "assisted-dip", [set(40, 8)]),
      past("warm-up only", "2026-10-21", "leg-press", [
        set(200, 10, { warmUp: true }),
      ]),
      past("bench", "2026-10-22", "bench-press", [set(150, 6)]),
      inProgress(
        past("today", "2026-10-28", "incline-db-press", [set(50, 10)]),
      ),
    );
    expect((await f.dashboard()).e1rm?.choices).toEqual([
      { id: "bench-press", name: "Bench Press" },
      { id: "lat-pulldown", name: "Lat Pulldown" },
    ]);
  });

  it("starts on the exercise with an e1RM done most recently", async () => {
    const { f } = await withWorkouts(
      past("bench", "2026-10-20", "bench-press", [set(150, 6)]),
      past("legs", "2026-10-22", "leg-press", [set(300, 10)]),
      past("dips", "2026-10-23", "assisted-dip", [set(40, 8)]),
    );
    expect((await f.dashboard()).e1rm?.exerciseId).toBe("leg-press");
  });

  it("remembers the exercise chosen, on every device", async () => {
    const { f, store, now } = await withWorkouts(
      past("bench", "2026-10-20", "bench-press", [set(150, 6)]),
      past("legs", "2026-10-22", "leg-press", [set(300, 10)]),
    );
    await f.chooseDashboard({ exerciseId: "bench-press" });
    const later = createForge({ store, library, now });
    expect((await later.dashboard()).e1rm?.exerciseId).toBe("bench-press");
  });

  it("falls back to the most recent when the one chosen no longer has an e1RM", async () => {
    const { f, store } = await withWorkouts(
      past("bench", "2026-10-20", "bench-press", [set(150, 6)]),
      past("legs", "2026-10-22", "leg-press", [set(300, 10)]),
    );
    await f.chooseDashboard({ exerciseId: "bench-press" });
    await store.remove("workouts", "bench");
    expect((await f.dashboard()).e1rm?.exerciseId).toBe("leg-press");
  });

  it("keeps a chosen exercise with nothing in the range, with no points to draw", async () => {
    const { f } = await withWorkouts(
      past("bench", "2026-03-02", "bench-press", [set(150, 6)]),
      past("legs", "2026-10-22", "leg-press", [set(300, 10)]),
    );
    await f.chooseDashboard({ exerciseId: "bench-press" });
    const { e1rm } = await f.dashboard();
    expect(e1rm?.exerciseId).toBe("bench-press");
    expect(e1rm?.points).toEqual([]);
    expect(e1rm?.latest).toBeUndefined();
  });

  it("has no e1RM card until a finished workout has an e1RM", async () => {
    const { f } = await withWorkouts(
      past("dips", "2026-10-23", "assisted-dip", [set(40, 8)]),
      inProgress(past("today", "2026-10-28", "bench-press", [set(150, 6)])),
    );
    expect((await f.dashboard()).e1rm).toBeUndefined();
  });

  it("counts the body weight on the day for a bodyweight exercise", async () => {
    const { f } = await withWorkouts(
      past("pull-ups", "2026-10-20", "pull-up", [set(20, 6)]),
    );
    await f.addBodyWeight({ date: "2026-10-01", load: 180, unit: "lb" });
    const { e1rm } = await f.dashboard();
    expect(e1rm?.latest).toBeCloseTo(240, 2); // (180 + 20) × (1 + 6/30)
    expect(toCents(e1rm?.points)).toEqual([
      { workoutId: "pull-ups", date: "2026-10-20", value: 240 },
    ]);
  });

  it("starts on the most recently logged exercise with an e1RM in the latest workout", async () => {
    const { f } = await withWorkouts(
      {
        ...past("today", "2026-10-27", "bench-press", []),
        entries: [
          // Only warm-ups today, though bench had an e1RM last month.
          {
            exerciseId: "bench-press",
            sets: [set(95, 10, { warmUp: true })],
          },
          {
            exerciseId: "lat-pulldown",
            sets: [set(120, 10, { loggedAt: "2026-10-27T18:10:00.000Z" })],
          },
          {
            exerciseId: "leg-press",
            sets: [set(300, 10, { loggedAt: "2026-10-27T18:40:00.000Z" })],
          },
        ],
      },
      past("last month", "2026-09-29", "bench-press", [set(150, 6)]),
    );
    expect((await f.dashboard()).e1rm?.exerciseId).toBe("leg-press");
  });

  it("offers no exercise that is no longer in the library", async () => {
    const { f } = await withWorkouts(
      past("bench", "2026-10-20", "bench-press", [set(150, 6)]),
      past("gone", "2026-10-22", "deleted-exercise", [set(100, 8)]),
    );
    await f.chooseDashboard({ exerciseId: "deleted-exercise" });
    const { e1rm } = await f.dashboard();
    expect(e1rm?.exerciseId).toBe("bench-press");
    expect(e1rm?.choices.map((c) => c.id)).toEqual(["bench-press"]);
  });

  it("names the exercise shown", async () => {
    const { f } = await withWorkouts(
      past("bench", "2026-10-20", "bench-press", [set(150, 6)]),
    );
    expect((await f.dashboard()).e1rm?.name).toBe("Bench Press");
  });
});

describe("dashboard hard sets (spec #80; #83)", () => {
  it("counts a set 1 for each primary muscle group and 0.5 for each secondary", async () => {
    // Bench Press: chest primary; triceps and front delts secondary.
    const { f } = await withWorkouts(
      past("bench", "2026-10-27", "bench-press", sets(4)),
    );
    const board = await f.dashboard();
    expect(muscleGroup(board, "chest")?.perWeek).toBe(4);
    expect(muscleGroup(board, "triceps")?.perWeek).toBe(2);
    expect(muscleGroup(board, "front-delts")?.perWeek).toBe(2);
    expect(muscleGroup(board, "quads")?.perWeek).toBe(0);
  });

  it("leaves out warm-ups, sets logged at RIR 4+ and cardio, as decided on #80", async () => {
    const { f } = await withWorkouts({
      ...past("mixed", "2026-10-27", "triceps-pushdown", []),
      entries: [
        {
          exerciseId: "triceps-pushdown",
          sets: [
            set(40, 12, { warmUp: true }), // out
            set(60, 10, { rir: 4 }), // out: 4 means 4 or more
            set(60, 10, { rir: 3 }), // in
            set(60, 10), // in: no RIR recorded
            set(40, 15, { drop: true }), // in: not a warm-up
          ],
        },
        // A timed hold has no RIR and counts.
        { exerciseId: "plank", sets: [{ ...set(0, 0), seconds: 60 }] },
        // Cardio never counts, though tagged with quads.
        { exerciseId: "treadmill", sets: [{ ...set(0, 0), seconds: 600 }] },
      ],
    });
    const board = await f.dashboard();
    expect(muscleGroup(board, "triceps")?.perWeek).toBe(3);
    expect(muscleGroup(board, "abs")?.perWeek).toBe(1);
    expect(muscleGroup(board, "quads")?.perWeek).toBe(0);
  });

  it("averages over the weeks with a workout, so a break doesn't lower it", async () => {
    // Three training weeks in twelve, with nine weeks off between them.
    const { f } = await withWorkouts(
      past("aug", "2026-08-11", "bench-press", sets(3)),
      past("oct-20", "2026-10-20", "bench-press", sets(3)),
      past("oct-22", "2026-10-22", "bench-press", sets(2)), // same week
      past("oct-27", "2026-10-27", "bench-press", sets(2)),
    );
    const board = await f.dashboard();
    expect(board.hardSets.trainingWeeks).toBe(3);
    expect(muscleGroup(board, "chest")?.perWeek).toBe(3.3); // 10 / 3, to 0.1
  });

  it("lists all 17 muscle groups by region, those with none at 0", async () => {
    const { f } = await withWorkouts();
    const { muscleGroups } = (await f.dashboard()).hardSets;
    expect(muscleGroups.map((m) => [m.region, m.id])).toEqual([
      ["push", "chest"],
      ["push", "front-delts"],
      ["push", "side-delts"],
      ["push", "triceps"],
      ["pull", "rear-delts"],
      ["pull", "biceps"],
      ["pull", "forearms"],
      ["pull", "lats-upper-back"],
      ["pull", "traps"],
      ["legs", "glutes"],
      ["legs", "quads"],
      ["legs", "hamstrings"],
      ["legs", "adductors"],
      ["legs", "calves"],
      ["core", "lower-back"],
      ["core", "abs"],
      ["core", "obliques"],
    ]);
    expect(muscleGroups.every((m) => m.perWeek === 0)).toBe(true);
  });

  it("says whether each is under, in or over the 10-20 band", async () => {
    /** @param {Workout[]} workouts */
    const band = async (...workouts) =>
      muscleGroup(
        await (await withWorkouts(...workouts)).f.dashboard(),
        "triceps",
      )?.band;
    // Triceps Pushdown works only the triceps; two weeks halve a total.
    const twoWeeks = (/** @type {number} */ a, /** @type {number} */ b) => [
      past("w1", "2026-10-20", "triceps-pushdown", sets(a)),
      past("w2", "2026-10-27", "triceps-pushdown", sets(b)),
    ];
    expect(await band(...twoWeeks(10, 9))).toBe("under"); // 9.5
    expect(await band(...twoWeeks(10, 10))).toBe("in"); // 10
    expect(await band(...twoWeeks(20, 20))).toBe("in"); // 20
    expect(await band(...twoWeeks(21, 20))).toBe("over"); // 20.5
  });
});

describe("workouts behind a mark (spec #80; #84)", () => {
  it("lists the workouts behind a muscle group's bar, newest first, with the hard sets each gave", async () => {
    const { f } = await withWorkouts(
      past("old", "2026-08-03", "bench-press", sets(5)), // before the range
      past("oct-20", "2026-10-20", "bench-press", sets(4)), // chest 4
      {
        ...past("oct-22", "2026-10-22", "incline-db-press", sets(3)),
        entries: [
          { exerciseId: "incline-db-press", sets: sets(3) }, // chest 3
          { exerciseId: "assisted-dip", sets: sets(1) }, // chest 0.5
        ],
      },
      past("oct-27", "2026-10-27", "lat-pulldown", sets(5)), // no chest
      inProgress(past("today", "2026-10-28", "bench-press", sets(3))),
    );
    const behind = await f.workoutsBehind({
      kind: "hard-sets",
      muscleGroup: "chest",
      range: "12w",
    });
    expect(behind.workouts).toEqual([
      { workoutId: "oct-22", date: "2026-10-22", gymId: "gym", value: 3.5 },
      { workoutId: "oct-20", date: "2026-10-20", gymId: "gym", value: 4 },
    ]);
    expect(behind.total).toBe(7.5);
    expect(behind.trainingWeeks).toBe(2); // Oct 19 and Oct 26 weeks
    expect(behind.perWeek).toBe(3.8); // 7.5 / 2, as the bar shows
    expect(muscleGroup(await f.dashboard(), "chest")?.perWeek).toBe(3.8);
  });

  it("covers the range the mark was made in", async () => {
    const { f } = await withWorkouts(
      past("sep", "2026-09-15", "bench-press", sets(4)),
      past("oct", "2026-10-20", "bench-press", sets(4)),
    );
    const behind = await f.workoutsBehind({
      kind: "hard-sets",
      muscleGroup: "chest",
      range: "4w",
    });
    expect(behind.range.id).toBe("4w");
    expect(behind.workouts.map((w) => w.workoutId)).toEqual(["oct"]);
  });
});
