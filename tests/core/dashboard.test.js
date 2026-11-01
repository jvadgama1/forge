import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library as strength } from "./library-fixture.js";

/** @import { Workout, WorkoutSet } from "../../app/js/core/types.js" */

/**
 * The strength fixture, an assisted exercise (no e1RM) and a bodyweight one
 * (its e1RM counts the body weight on the day), as in #19.
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
];

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
