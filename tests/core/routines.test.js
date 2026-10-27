import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** @import { RoutineDayDraft } from "../../app/js/core/types.js" */

/** A store, a clock tests move, and the core over them. */
function setup() {
  const store = createMemoryStore();
  let clock = new Date(2026, 9, 25, 18, 0);
  const f = createForge({ store, library, now: () => clock });
  return {
    f,
    store,
    /** @param {number} day of Oct 2026 @param {number} [hour] */
    on: (day, hour = 18) => {
      clock = new Date(2026, 9, day, hour, 0);
    },
  };
}

/** Push A and Pull A, as a user would first save them. */
const PPL = /** @type {RoutineDayDraft[]} */ ([
  {
    name: "Push A",
    slots: [
      { exerciseId: "bench-press", sets: 3, repMin: 6, repMax: 10, rir: 2 },
      { exerciseId: "triceps-pushdown", sets: 3, repMin: 10, repMax: 15 },
    ],
  },
  {
    name: "Pull A",
    slots: [{ exerciseId: "lat-pulldown", sets: 4, repMin: 8, repMax: 12 }],
  },
]);

/** A saved PPL routine, a gym, and the core. */
async function withRoutine() {
  const env = setup();
  const routine = await env.f.saveRoutine({ name: "PPL", days: PPL });
  const gym = await env.f.createGym("Work");
  return { ...env, routine, gym };
}

describe("saving a routine (#14)", () => {
  it("creates version 1 with its days and slots", async () => {
    const { f, routine } = await withRoutine();
    expect(routine.name).toBe("PPL");
    expect(routine.versions).toHaveLength(1);
    const v1 = routine.versions[0];
    expect(v1.number).toBe(1);
    expect(v1.days.map((d) => d.name)).toEqual(["Push A", "Pull A"]);
    expect(v1.days[0].slots[0]).toEqual({
      exerciseId: "bench-press",
      sets: 3,
      repMin: 6,
      repMax: 10,
      rir: 2,
    });
    expect((await f.listRoutines()).map((r) => r.id)).toEqual([routine.id]);
  });

  it("creates a new version on each change, keeping the old ones as they were", async () => {
    const { f, routine } = await withRoutine();
    const [push, pull] = routine.versions[0].days;
    const changed = await f.saveRoutine({
      id: routine.id,
      name: "PPL",
      days: [
        { ...push, slots: push.slots.slice(1) }, // bench removed
        pull,
      ],
    });
    expect(changed.versions.map((v) => v.number)).toEqual([1, 2]);
    expect(changed.versions[0].days[0].slots).toHaveLength(2);
    expect(changed.versions[1].days[0].slots).toHaveLength(1);
    // Days keep their ids across versions.
    expect(changed.versions[1].days[0].id).toBe(push.id);
  });

  it("only renames when the days are unchanged", async () => {
    const { f, routine } = await withRoutine();
    const renamed = await f.saveRoutine({
      id: routine.id,
      name: "  Push Pull Legs ",
      days: routine.versions[0].days,
    });
    expect(renamed.name).toBe("Push Pull Legs");
    expect(renamed.versions).toHaveLength(1);
  });

  it("refuses a routine that can't be followed", async () => {
    const { f } = setup();
    /** @param {Partial<RoutineDayDraft["slots"][number]>} slot */
    const save = (slot) =>
      f.saveRoutine({
        name: "R",
        days: [
          {
            name: "Day",
            slots: [
              {
                exerciseId: "bench-press",
                sets: 3,
                repMin: 8,
                repMax: 12,
                ...slot,
              },
            ],
          },
        ],
      });
    await expect(f.saveRoutine({ name: " ", days: [] })).rejects.toThrow(
      "Give the routine a name",
    );
    await expect(
      f.saveRoutine({ name: "R", days: [{ name: "", slots: [] }] }),
    ).rejects.toThrow("Give each day a name");
    await expect(save({ sets: 0 })).rejects.toThrow("Target sets are 1 to 20");
    await expect(save({ repMin: 12, repMax: 8 })).rejects.toThrow(
      "The rep range runs from low to high, 1 to 100",
    );
    await expect(save({ rir: 5 })).rejects.toThrow("Target RIR is 0 to 4");
    await expect(save({ exerciseId: "nope" })).rejects.toThrow(
      "Unknown exercise",
    );
    await expect(
      f.saveRoutine({
        name: "R",
        days: [
          {
            name: "Day",
            slots: [
              { exerciseId: "bench-press", sets: 3, repMin: 8, repMax: 12 },
              { exerciseId: "bench-press", sets: 2, repMin: 8, repMax: 12 },
            ],
          },
        ],
      }),
    ).rejects.toThrow("An exercise appears once a day");
  });
});

describe("starting from a routine day (#14)", () => {
  it("lays out the day's exercises and records the routine, version and day", async () => {
    const { f, routine, gym } = await withRoutine();
    const pull = routine.versions[0].days[1];
    const workout = await f.startWorkout(gym.id, {
      routineId: routine.id,
      dayId: pull.id,
    });
    expect(workout.routine).toEqual({
      routineId: routine.id,
      version: 1,
      dayId: pull.id,
    });
    expect(workout.entries).toEqual([{ exerciseId: "lat-pulldown", sets: [] }]);
    expect(await f.workoutTitle(workout)).toBe("Pull A");
  });

  it("shows each exercise's targets", async () => {
    const { f, routine, gym } = await withRoutine();
    const workout = await f.startWorkout(gym.id, {
      routineId: routine.id,
      dayId: routine.versions[0].days[0].id,
    });
    expect(await f.targets(workout, "bench-press")).toEqual({
      sets: 3,
      repMin: 6,
      repMax: 10,
      rir: 2,
    });
    await f.addExercise(workout.id, "leg-press");
    expect(await f.targets(workout, "leg-press")).toBeUndefined();
  });

  it("is titled Freestyle without a routine", async () => {
    const { f, gym } = await withRoutine();
    expect(await f.workoutTitle(await f.startWorkout(gym.id))).toBe(
      "Freestyle",
    );
  });

  it("keeps a workout on the version it followed after the routine changes", async () => {
    const { f, routine, gym } = await withRoutine();
    const push = routine.versions[0].days[0];
    const workout = await f.startWorkout(gym.id, {
      routineId: routine.id,
      dayId: push.id,
    });
    await f.saveRoutine({
      id: routine.id,
      name: "PPL",
      days: [{ ...push, slots: [{ ...push.slots[0], repMin: 8, repMax: 12 }] }],
    });
    expect((await f.targets(workout, "bench-press"))?.repMin).toBe(6);
  });
});

describe("the next routine day (#14)", () => {
  /** Does a routine day: starts it, logs one set, finishes it. */
  async function doDay(
    /** @type {Awaited<ReturnType<typeof withRoutine>>} */ env,
    /** @type {number} */ index,
  ) {
    const day = (await env.f.getRoutine(env.routine.id))?.versions.at(-1)?.days[
      index
    ];
    if (!day) throw new Error("no day");
    const w = await env.f.startWorkout(env.gym.id, {
      routineId: env.routine.id,
      dayId: day.id,
    });
    await env.f.logSet(w.id, day.slots[0].exerciseId, { load: 100, reps: 8 });
    await env.f.finishWorkout(w.id);
  }

  it("is the first day before any is done", async () => {
    const { f, routine } = await withRoutine();
    expect((await f.nextRoutineDay(routine.id))?.name).toBe("Push A");
  });

  it("follows the day done last, wrapping around", async () => {
    const env = await withRoutine();
    env.on(20);
    await doDay(env, 0);
    expect((await env.f.nextRoutineDay(env.routine.id))?.name).toBe("Pull A");
    env.on(22);
    await doDay(env, 1);
    expect((await env.f.nextRoutineDay(env.routine.id))?.name).toBe("Push A");
  });

  it("counts only the routine's current version", async () => {
    const env = await withRoutine();
    env.on(20);
    await doDay(env, 0);
    const v1 = env.routine.versions[0];
    await env.f.saveRoutine({
      id: env.routine.id,
      name: "PPL",
      days: [...v1.days, { name: "Legs A", slots: [] }],
    });
    expect((await env.f.nextRoutineDay(env.routine.id))?.name).toBe("Push A");
  });
});

describe("saving a workout's changes to its routine (#14)", () => {
  async function pushDay() {
    const env = await withRoutine();
    const push = env.routine.versions[0].days[0];
    const w = await env.f.startWorkout(env.gym.id, {
      routineId: env.routine.id,
      dayId: push.id,
    });
    return { ...env, w, push };
  }

  it("finds no changes when the day was followed", async () => {
    const { f, w } = await pushDay();
    await f.logSet(w.id, "bench-press", { load: 135, reps: 8 });
    expect(await f.routineChanges(await f.getWorkout(w.id))).toBe(false);
  });

  it("finds an added, skipped or moved exercise", async () => {
    const { f, w } = await pushDay();
    await f.addExercise(w.id, "leg-press");
    expect(await f.routineChanges(await f.getWorkout(w.id))).toBe(true);
    const again = await pushDay();
    await again.f.skipExercise(again.w.id, "triceps-pushdown");
    expect(
      await again.f.routineChanges(await again.f.getWorkout(again.w.id)),
    ).toBe(true);
    const moved = await pushDay();
    await moved.f.moveExercise(moved.w.id, "triceps-pushdown", 0);
    expect(
      await moved.f.routineChanges(await moved.f.getWorkout(moved.w.id)),
    ).toBe(true);
  });

  it("is off by default: finishing leaves the routine as it was", async () => {
    const { f, w, routine } = await pushDay();
    await f.addExercise(w.id, "leg-press");
    await f.logSet(w.id, "leg-press", { load: 270, reps: 10 });
    await f.finishWorkout(w.id);
    expect((await f.getRoutine(routine.id))?.versions).toHaveLength(1);
  });

  it("saves the day as done, as a new version, when asked", async () => {
    const { f, w, routine, push } = await pushDay();
    await f.skipExercise(w.id, "triceps-pushdown");
    await f.addExercise(w.id, "leg-press");
    await f.moveExercise(w.id, "leg-press", 0);
    await f.logSet(w.id, "leg-press", { load: 270, reps: 10 });
    await f.logSet(w.id, "leg-press", { load: 270, reps: 9 });
    await f.logSet(w.id, "bench-press", { load: 135, reps: 8 });
    await f.finishWorkout(w.id, { saveToRoutine: true });
    const saved = await f.getRoutine(routine.id);
    expect(saved?.versions.map((v) => v.number)).toEqual([1, 2]);
    const day = saved?.versions[1].days[0];
    expect(day?.id).toBe(push.id);
    expect(day?.slots).toEqual([
      // Added: its working sets logged become its target, with 8–12 reps.
      { exerciseId: "leg-press", sets: 2, repMin: 8, repMax: 12 },
      push.slots[0], // kept as planned
    ]);
    expect(saved?.versions[1].days[1]).toEqual(routine.versions[0].days[1]);
  });
});
