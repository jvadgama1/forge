import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** @import { Workout, WorkoutSet } from "../../app/js/core/types.js" */

/**
 * A stored set of `load` × `reps` in `unit`.
 * @param {number} load
 * @param {number} reps
 * @param {"lb" | "kg"} [unit]
 * @returns {WorkoutSet}
 */
const set = (load, reps, unit = "lb") => ({
  load,
  unit,
  reps,
  loggedAt: "2026-10-01T18:00:00.000Z",
});

/**
 * A finished workout on `date` with bench press sets.
 * @param {string} date
 * @param {WorkoutSet[]} sets
 * @returns {Workout}
 */
const past = (date, sets) => ({
  id: `w-${date}`,
  date,
  startedAt: `${date}T18:00:00.000Z`,
  finishedAt: `${date}T19:00:00.000Z`,
  gymId: "gym",
  entries: [{ exerciseId: "bench-press", sets }],
});

/** The core on 25 Oct 2026 over `workouts`, with a gym. */
async function setup(/** @type {Workout[]} */ ...workouts) {
  const store = createMemoryStore();
  for (const w of workouts) await store.put("workouts", w);
  const f = createForge({
    store,
    library,
    now: () => new Date(2026, 9, 25, 18, 0),
  });
  const gym = await f.createGym("Work");
  return { f, store, gym };
}

/** A new custom exercise, as the editor would save it. */
const BAND_ROW = {
  name: "Band Row",
  type: /** @type {const} */ ("weight-reps"),
  primary: /** @type {const} */ (["lats-upper-back"]),
  secondary: /** @type {const} */ (["biceps"]),
  body: /** @type {const} */ ("upper"),
};

describe("custom exercises (#21)", () => {
  it("are created with a name, type, muscle groups and body half, and found like seeded ones", async () => {
    const { f, gym } = await setup();
    const made = await f.saveCustomExercise({
      ...BAND_ROW,
      primary: [...BAND_ROW.primary],
      secondary: [...BAND_ROW.secondary],
    });
    expect(made).toMatchObject({ ...BAND_ROW, custom: true });
    expect(await f.getExercise(made.id)).toEqual(made);
    expect(
      (await f.searchExercises({ query: "band" })).map((e) => e.name),
    ).toEqual(["Band Row"]);
    await f.setExerciseAtGym(gym.id, made.id, true);
    expect(
      (await f.pickExercises({ gymId: gym.id })).map((e) => e.name),
    ).toEqual(["Band Row"]);
  });

  it("are edited in place, keeping their id", async () => {
    const { f } = await setup();
    const made = await f.saveCustomExercise({
      ...BAND_ROW,
      primary: ["lats-upper-back"],
      secondary: [],
    });
    const edited = await f.saveCustomExercise({
      ...made,
      name: "  Banded Row ",
      secondary: ["rear-delts"],
    });
    expect(edited).toMatchObject({
      id: made.id,
      name: "Banded Row",
      secondary: ["rear-delts"],
    });
    expect((await f.searchExercises({ query: "row" })).length).toBe(1);
  });

  it("need a name no other exercise has, and a primary muscle group", async () => {
    const { f } = await setup();
    await expect(
      f.saveCustomExercise({
        ...BAND_ROW,
        name: " ",
        primary: ["chest"],
        secondary: [],
      }),
    ).rejects.toThrow("Give the exercise a name");
    await expect(
      f.saveCustomExercise({
        ...BAND_ROW,
        name: "bench press",
        primary: ["chest"],
        secondary: [],
      }),
    ).rejects.toThrow("Bench Press is already an exercise");
    await expect(
      f.saveCustomExercise({ ...BAND_ROW, primary: [], secondary: [] }),
    ).rejects.toThrow("Pick at least one primary muscle group");
  });

  it("keep their type once made, since sets are measured by it", async () => {
    const { f } = await setup();
    const made = await f.saveCustomExercise({
      ...BAND_ROW,
      primary: ["lats-upper-back"],
      secondary: [],
    });
    const edited = await f.saveCustomExercise({ ...made, type: "timed" });
    expect(edited.type).toBe("weight-reps");
  });
});

describe("exercise settings (#21)", () => {
  it("default to lb, the body half's increment, a 90 s rest and no pinned note", async () => {
    const { f } = await setup();
    expect(await f.exerciseSettings("bench-press")).toEqual({
      unit: "lb",
      increment: 5,
      rest: 90,
    });
    expect((await f.exerciseSettings("leg-press")).increment).toBe(10);
  });

  it("default to 2.5 kg upper body and 5 kg lower once the unit is kg", async () => {
    const { f } = await setup();
    await f.saveExerciseSettings("bench-press", { unit: "kg" });
    await f.saveExerciseSettings("leg-press", { unit: "kg" });
    expect((await f.exerciseSettings("bench-press")).increment).toBe(2.5);
    expect((await f.exerciseSettings("leg-press")).increment).toBe(5);
  });

  it("keep a unit, increment, rest default and pinned note per exercise", async () => {
    const { f } = await setup();
    await f.saveExerciseSettings("bench-press", {
      unit: "kg",
      increment: 1.25,
      rest: 150,
      note: "  Seat 4, grip on the rings  ",
    });
    expect(await f.exerciseSettings("bench-press")).toEqual({
      unit: "kg",
      increment: 1.25,
      rest: 150,
      note: "Seat 4, grip on the rings",
    });
    expect(await f.exerciseSettings("incline-db-press")).toEqual({
      unit: "lb",
      increment: 5,
      rest: 90,
    });
  });

  it("clear a pinned note left blank", async () => {
    const { f } = await setup();
    await f.saveExerciseSettings("bench-press", { note: "Seat 4" });
    await f.saveExerciseSettings("bench-press", { note: " " });
    expect((await f.exerciseSettings("bench-press")).note).toBeUndefined();
  });

  it("refuse an increment or rest that can't be right", async () => {
    const { f } = await setup();
    await expect(
      f.saveExerciseSettings("bench-press", { increment: 0 }),
    ).rejects.toThrow("The increment must be more than 0");
    await expect(
      f.saveExerciseSettings("bench-press", { rest: 0 }),
    ).rejects.toThrow("Rest is 5 s to 15 min, or Off");
    await expect(
      f.saveExerciseSettings("bench-press", { rest: 901 }),
    ).rejects.toThrow("Rest is 5 s to 15 min, or Off");
  });

  it("step the load by the increment", async () => {
    const { f } = await setup();
    await f.saveExerciseSettings("bench-press", { increment: 2.5 });
    expect(await f.loadStep("bench-press")).toBe(2.5);
  });
});

describe("rest default (#21, #52)", () => {
  it("is what rest after a set counts down", async () => {
    const { f } = await setup();
    expect(await f.restAfterSet("bench-press")).toBe(90);
    await f.saveExerciseSettings("bench-press", { rest: 180 });
    expect(await f.restAfterSet("bench-press")).toBe(180);
  });

  it("can be Off: no rest after a set", async () => {
    const { f } = await setup();
    await f.saveExerciseSettings("bench-press", { rest: "off" });
    expect((await f.exerciseSettings("bench-press")).rest).toBe("off");
    expect(await f.restAfterSet("bench-press")).toBeUndefined();
  });
});

describe("units per exercise (#21)", () => {
  it("log a set in the exercise's unit", async () => {
    const { f, gym } = await setup();
    await f.saveExerciseSettings("bench-press", { unit: "kg" });
    let w = await f.startWorkout(gym.id);
    w = await f.addExercise(w.id, "bench-press");
    const logged = await f.logSet(w.id, "bench-press", { load: 60, reps: 8 });
    expect(logged.entries[0].sets[0]).toMatchObject({ load: 60, unit: "kg" });
  });

  it("carry progression across a unit change, in the new unit", async () => {
    // 135 lb is 61.2 kg; the nearest 2.5 kg is 60, and every set hit 12,
    // so up 2.5 kg: 62.5.
    const { f, gym } = await setup(past("2026-10-20", [set(135, 12)]));
    await f.saveRoutine({
      name: "R",
      days: [
        {
          name: "A",
          slots: [
            { exerciseId: "bench-press", sets: 1, repMin: 8, repMax: 12 },
          ],
        },
      ],
    });
    await f.saveExerciseSettings("bench-press", { unit: "kg" });
    const w = await f.startWorkout(gym.id);
    expect(await f.suggestedWeight(w, "bench-press")).toEqual({
      load: 62.5,
      unit: "kg",
      reason: "up",
      by: 2.5,
    });
  });

  it("keep records across a unit change, compared in kg", async () => {
    const { f, gym } = await setup(past("2026-10-20", [set(135, 8)]));
    await f.saveExerciseSettings("bench-press", { unit: "kg" });
    let w = await f.startWorkout(gym.id);
    w = await f.addExercise(w.id, "bench-press");
    // 60 kg is 132.3 lb: lighter than 135 lb, so no heaviest record.
    const lighter = await f.logSet(w.id, "bench-press", { load: 60, reps: 8 });
    expect(await f.recordsSetBy(lighter, "bench-press")).toEqual([]);
    // 62.5 kg is 137.8 lb: heavier.
    const heavier = await f.logSet(w.id, "bench-press", {
      load: 62.5,
      reps: 8,
    });
    expect(await f.recordsSetBy(heavier, "bench-press")).toContain("heaviest");
  });
});

describe("cardio distance (#21)", () => {
  it("is in miles for an exercise in lb, and km once it's in kg", async () => {
    const store = createMemoryStore();
    const f = createForge({
      store,
      library: [
        {
          id: "treadmill",
          name: "Treadmill",
          type: "cardio",
          primary: ["quads"],
          secondary: [],
          body: "lower",
        },
      ],
      now: () => new Date(2026, 9, 25, 18, 0),
    });
    const gym = await f.createGym("Work");
    let w = await f.startWorkout(gym.id);
    w = await f.addExercise(w.id, "treadmill");
    w = await f.logSet(w.id, "treadmill", { seconds: 600, distance: 1 });
    await f.saveExerciseSettings("treadmill", { unit: "kg" });
    w = await f.logSet(w.id, "treadmill", { seconds: 600, distance: 2 });
    expect(w.entries[0].sets.map((s) => s.distanceUnit)).toEqual(["mi", "km"]);
  });
});
