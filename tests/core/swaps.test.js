import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** @import { Exercise } from "../../app/js/core/types.js" */

/**
 * A custom exercise for the tests.
 * @param {string} id
 * @param {Exercise["primary"]} primary
 * @param {Exercise["type"]} [type]
 * @returns {Exercise}
 */
const custom = (id, primary, type = "weight-reps") => ({
  id,
  name: id,
  type,
  primary,
  secondary: [],
  body: "upper",
});

/**
 * The core on 25 Oct 2026 with a Home gym that has no Flat Bench, and a
 * routine whose day starts with Flat Bench at 3 × 6–10.
 */
async function setup() {
  const store = createMemoryStore();
  for (const e of [
    custom("Machine Press", ["chest", "triceps"]),
    custom("Air Bike", ["chest"], "cardio"),
    custom("Plank", ["chest"], "timed"),
    custom("Close-Grip Press", ["chest", "triceps"]),
  ])
    await store.put("customExercises", e);
  const f = createForge({
    store,
    library,
    now: () => new Date(2026, 9, 25, 18, 0),
  });
  const home = await f.createGym("Home");
  for (const id of [
    "incline-db-press",
    "lat-pulldown",
    "triceps-pushdown",
    "Machine Press",
    "Air Bike",
    "Plank",
    "Close-Grip Press",
  ])
    await f.setExerciseAtGym(home.id, id, true);
  // The slot's exercise, made here so its primary muscles are known.
  await store.put(
    "customExercises",
    custom("Flat Bench", ["chest", "triceps"]),
  );
  const routine = await f.saveRoutine({
    name: "Push",
    days: [
      {
        name: "Push A",
        slots: [
          { exerciseId: "Flat Bench", sets: 3, repMin: 6, repMax: 10 },
          { exerciseId: "triceps-pushdown", sets: 3, repMin: 10, repMax: 15 },
        ],
      },
    ],
  });
  const workout = await f.startWorkout(home.id, {
    day: { routineId: routine.id, dayId: routine.versions[0].days[0].id },
  });
  return { f, routine, workout };
}

describe("swaps (#16)", () => {
  it("mark a slot whose exercise isn't at the gym", async () => {
    const { f, workout } = await setup();
    expect(await f.atGym(workout, "Flat Bench")).toBe(false);
    expect(await f.atGym(workout, "triceps-pushdown")).toBe(true);
  });

  it("offer exercises here of the same kind sharing a primary muscle group, most shared first, then by name", async () => {
    const { f, workout } = await setup();
    expect(await f.swapCandidates(workout, "Flat Bench")).toEqual([
      // Two shared (chest, triceps), by name:
      "Close-Grip Press",
      "Machine Press",
      // One shared (chest):
      "incline-db-press",
      // Triceps pushdown is in the workout already; Air Bike is cardio and
      // Plank a timed hold, though both are tagged chest; lat pulldown
      // shares nothing.
    ]);
  });

  it("replace the exercise for this workout only, logged as itself with the slot's targets", async () => {
    const { f, routine, workout } = await setup();
    let w = await f.swapExercise(workout.id, "Flat Bench", "Machine Press");
    expect(w.entries.map((e) => e.exerciseId)).toEqual([
      "Machine Press",
      "triceps-pushdown",
    ]);
    expect(await f.targets(w, "Machine Press")).toEqual({
      sets: 3,
      repMin: 6,
      repMax: 10,
    });
    w = await f.logSet(w.id, "Machine Press", { load: 100, reps: 8 });
    expect(w.entries[0].sets).toHaveLength(1);
    expect(await f.routineChanges(w)).toBe(false);
    await f.finishWorkout(w.id, { saveToRoutine: true });
    expect((await f.getRoutine(routine.id))?.versions).toHaveLength(1);
    expect((await f.lastWorkoutLine("Machine Press"))?.sets).toHaveLength(1);
    expect(await f.lastWorkoutLine("Flat Bench")).toBeUndefined();
  });
});
