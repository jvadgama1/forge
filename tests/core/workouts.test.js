import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/**
 * A store, a clock that tests move, and a way to open the core over them,
 * again after a "reload" if needed.
 */
function setup() {
  const store = createMemoryStore();
  let clock = new Date(2026, 9, 25, 18, 0); // 25 Oct 2026, 18:00 local
  return {
    forge: () => createForge({ store, library, now: () => clock }),
    /** @param {number} hour @param {number} minute @param {number} [day] of Oct 2026 */
    at: (hour, minute, day = 25) => {
      clock = new Date(2026, 9, day, hour, minute);
    },
  };
}

/** A started workout at a gym called Work, and the core it was started with. */
async function started() {
  const env = setup();
  const f = env.forge();
  const work = await f.createGym("Work");
  const workout = await f.startWorkout(work.id);
  return { ...env, f, id: workout.id };
}

describe("exercises in a workout", () => {
  it("are added in the order chosen", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    const workout = await f.addExercise(id, "leg-press");
    expect(workout.entries).toEqual([
      { exerciseId: "bench-press", sets: [] },
      { exerciseId: "leg-press", sets: [] },
    ]);
  });

  it("can be reordered", async () => {
    const { f, id } = await started();
    for (const exercise of ["bench-press", "lat-pulldown", "leg-press"])
      await f.addExercise(id, exercise);
    const order = (/** @type {{ entries: { exerciseId: string }[] }} */ w) =>
      w.entries.map((e) => e.exerciseId);
    expect(order(await f.moveExercise(id, "leg-press", 0))).toEqual([
      "leg-press",
      "bench-press",
      "lat-pulldown",
    ]);
    expect(order(await f.moveExercise(id, "leg-press", 1))).toEqual([
      "bench-press",
      "leg-press",
      "lat-pulldown",
    ]);
  });

  it("can be skipped, and adding one again brings it back rather than repeating it", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    let workout = await f.skipExercise(id, "leg-press");
    expect(workout.entries[1]).toEqual({
      exerciseId: "leg-press",
      skipped: true,
      sets: [],
    });
    await f.addExercise(id, "leg-press");
    workout = await f.addExercise(id, "bench-press");
    expect(workout.entries).toEqual([
      { exerciseId: "bench-press", sets: [] },
      { exerciseId: "leg-press", sets: [] },
    ]);
  });
});

describe("logging a set", () => {
  it("records load in lb, reps and when it was logged", async () => {
    const { f, id, at } = await started();
    await f.addExercise(id, "bench-press");
    at(18, 5);
    const workout = await f.logSet(id, "bench-press", { load: 135, reps: 10 });
    expect(workout.entries[0].sets).toEqual([
      {
        load: 135,
        unit: "lb",
        reps: 10,
        loggedAt: new Date(2026, 9, 25, 18, 5).toISOString(),
      },
    ]);
  });
});

describe("a set that can't be right", () => {
  it("is refused, and nothing is logged", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    const log = (/** @type {object} */ set) =>
      f.logSet(id, "bench-press", { load: 135, reps: 8, ...set });
    await expect(log({ reps: 0 })).rejects.toThrow("Reps must be 1 or more");
    await expect(log({ reps: 7.5 })).rejects.toThrow("Reps must be 1 or more");
    await expect(log({ load: -5 })).rejects.toThrow("Load must be 0 or more");
    await expect(log({ load: Number.NaN })).rejects.toThrow(
      "Load must be 0 or more",
    );
    await expect(log({ rir: 5 })).rejects.toThrow("RIR is 0 to 4");
    await expect(log({ warmUp: true, drop: true })).rejects.toThrow(
      "A set is a warm-up or a drop set, not both",
    );
    expect((await f.currentWorkout())?.entries[0].sets).toEqual([]);
  });
});

describe("logging to the wrong place", () => {
  it("is refused: an exercise not in the workout, a skipped one, a finished workout", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    await f.skipExercise(id, "leg-press");
    const set = { load: 135, reps: 8 };
    await expect(f.logSet(id, "lat-pulldown", set)).rejects.toThrow(
      "Add the exercise to the workout first",
    );
    await expect(f.logSet(id, "leg-press", set)).rejects.toThrow(
      "Add the exercise to the workout first",
    );
    await f.logSet(id, "bench-press", set);
    await f.finishWorkout(id);
    await expect(f.logSet(id, "bench-press", set)).rejects.toThrow(
      "That workout is finished",
    );
  });
});

describe("set flags", () => {
  it("records RIR, and warm-up and drop sets", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.logSet(id, "bench-press", { load: 95, reps: 10, warmUp: true });
    await f.logSet(id, "bench-press", { load: 135, reps: 8, rir: 1 });
    const workout = await f.logSet(id, "bench-press", {
      load: 95,
      reps: 12,
      rir: 0,
      drop: true,
    });
    expect(
      workout.entries[0].sets.map(({ load, reps, rir, warmUp, drop }) => ({
        load,
        reps,
        rir,
        warmUp,
        drop,
      })),
    ).toEqual([
      { load: 95, reps: 10, rir: undefined, warmUp: true, drop: undefined },
      { load: 135, reps: 8, rir: 1, warmUp: undefined, drop: undefined },
      { load: 95, reps: 12, rir: 0, warmUp: undefined, drop: true },
    ]);
  });
});

describe("the exercise to show", () => {
  it("is the one last logged, else the first not skipped", async () => {
    const { f, id, at } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    let workout = await f.skipExercise(id, "bench-press");
    expect(f.exerciseToShow(workout)).toBe("leg-press");
    await f.addExercise(id, "bench-press"); // back again
    at(18, 10);
    await f.logSet(id, "leg-press", { load: 270, reps: 10 });
    at(18, 14);
    workout = await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    expect(f.exerciseToShow(workout)).toBe("bench-press");
  });

  it("never lands on a skipped exercise, even one with sets", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    const workout = await f.skipExercise(id, "bench-press");
    expect(f.exerciseToShow(workout)).toBe("leg-press");
  });

  it("opens the exercise asked for, if it's in the workout and not skipped", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    await f.addExercise(id, "lat-pulldown");
    const workout = await f.skipExercise(id, "lat-pulldown");
    // Left to itself it would open Bench Press, the first exercise.
    expect(f.exerciseToShow(workout, "leg-press")).toBe("leg-press");
    expect(f.exerciseToShow(workout, "lat-pulldown")).toBe("bench-press");
    expect(f.exerciseToShow(workout, "triceps-pushdown")).toBe("bench-press");
  });
});

describe("load steppers", () => {
  it("move by the exercise's increment: 5 lb upper body, 10 lb lower", () => {
    const f = setup().forge();
    expect(f.loadStep("bench-press")).toBe(5);
    expect(f.loadStep("leg-press")).toBe(10);
  });
});

describe("undoing the last set", () => {
  it("removes the exercise's most recent set; the next set prefills from the one before", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    await f.logSet(id, "bench-press", { load: 1355, reps: 8 }); // a typo
    const workout = await f.undoLastSet(id, "bench-press");
    expect(workout.entries[0].sets.map((s) => s.load)).toEqual([135]);
    expect(f.nextSet(workout, "bench-press")).toEqual({ load: 135, reps: 8 });
  });

  it("starts the next set empty after undoing the only one", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    const workout = await f.undoLastSet(id, "bench-press");
    expect(f.nextSet(workout, "bench-press")).toBeUndefined();
  });

  it("is refused with no sets to undo, for an exercise not in play, or once the workout is finished", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    await expect(f.undoLastSet(id, "bench-press")).rejects.toThrow(
      "No set to undo",
    );
    await f.logSet(id, "leg-press", { load: 270, reps: 10 });
    await f.skipExercise(id, "leg-press");
    await expect(f.undoLastSet(id, "leg-press")).rejects.toThrow(
      "Add the exercise to the workout first",
    );
    await expect(f.undoLastSet(id, "lat-pulldown")).rejects.toThrow(
      "Add the exercise to the workout first",
    );
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    await f.finishWorkout(id);
    await expect(f.undoLastSet(id, "bench-press")).rejects.toThrow(
      "That workout is finished",
    );
  });
});

describe("the next set", () => {
  it("starts empty, then from the previous set's load and reps", async () => {
    const { f, id } = await started();
    let workout = await f.addExercise(id, "bench-press");
    expect(f.nextSet(workout, "bench-press")).toBeUndefined();
    await f.logSet(id, "bench-press", { load: 135, reps: 10 });
    workout = await f.logSet(id, "bench-press", { load: 145, reps: 8 });
    expect(f.nextSet(workout, "bench-press")).toEqual({ load: 145, reps: 8 });
  });
});

describe("finishing", () => {
  it("saves the finish time and summarises exercises, sets and duration", async () => {
    const { f, id, at, forge } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    await f.addExercise(id, "lat-pulldown"); // added, never done
    await f.logSet(id, "bench-press", { load: 95, reps: 10, warmUp: true });
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    await f.logSet(id, "leg-press", { load: 270, reps: 12 });
    at(18, 47);
    const finished = await f.finishWorkout(id);
    expect(finished && new Date(finished.finishedAt ?? "")).toEqual(
      new Date(2026, 9, 25, 18, 47),
    );

    const reopened = forge();
    expect(await reopened.currentWorkout()).toBeUndefined();
    const saved = await reopened.getWorkout(id);
    expect(saved && reopened.summarize(saved)).toEqual({
      exercises: 2,
      sets: 3,
      minutes: 47,
    });
  });

  it("keeps only exercises with sets, and finishing twice keeps the first finish", async () => {
    const { f, id, at } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press"); // never done
    await f.addExercise(id, "lat-pulldown");
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    await f.logSet(id, "lat-pulldown", { load: 120, reps: 10 });
    await f.skipExercise(id, "lat-pulldown"); // done, then skipped the rest
    at(18, 40);
    await f.finishWorkout(id);
    at(18, 41);
    const again = await f.finishWorkout(id);
    expect(again?.entries.map((e) => e.exerciseId)).toEqual([
      "bench-press",
      "lat-pulldown",
    ]);
    expect(again?.entries.some((e) => "skipped" in e)).toBe(false);
    expect(new Date(again?.finishedAt ?? "")).toEqual(
      new Date(2026, 9, 25, 18, 40),
    );
  });

  it("discards a workout with nothing logged", async () => {
    const { f, id } = await started();
    await f.addExercise(id, "bench-press");
    expect(await f.finishWorkout(id)).toBeUndefined();
    expect(await f.getWorkout(id)).toBeUndefined();
    expect(await f.currentWorkout()).toBeUndefined();
  });
});

describe("freestyle workout", () => {
  it("starts at a gym, recording the gym, today's date and the start time", async () => {
    const f = setup().forge();
    const work = await f.createGym("Work");
    const workout = await f.startWorkout(work.id);
    expect(workout).toMatchObject({
      gymId: work.id,
      date: "2026-10-25",
      entries: [],
    });
    expect(new Date(workout.startedAt)).toEqual(new Date(2026, 9, 25, 18, 0));
    expect(workout.finishedAt).toBeUndefined();
  });

  it("takes an optional note, trimmed; clearing it removes it", async () => {
    const { f, id } = await started();
    expect((await f.setWorkoutNote(id, "  slept 5 hrs ")).note).toBe(
      "slept 5 hrs",
    );
    expect(await f.setWorkoutNote(id, "   ")).not.toHaveProperty("note");
  });

  it("makes its gym the one preselected next time", async () => {
    const f = setup().forge();
    await f.createGym("Apartment");
    const work = await f.createGym("Work");
    await f.startWorkout(work.id);
    expect((await f.currentGym())?.name).toBe("Work");
  });

  it("can't be started while another is in progress", async () => {
    const f = setup().forge();
    const work = await f.createGym("Work");
    const first = await f.startWorkout(work.id);
    await expect(f.startWorkout(work.id)).rejects.toThrow(
      "A workout is already in progress",
    );
    expect((await f.currentWorkout())?.id).toBe(first.id);
  });

  it("reopens mid-workout with its sets, on the exercise last logged", async () => {
    const { f, id, forge } = await started();
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press");
    await f.logSet(id, "leg-press", { load: 270, reps: 10 });
    const reopened = forge();
    const workout = await reopened.currentWorkout();
    expect(workout?.entries[1].sets).toHaveLength(1);
    expect(workout && reopened.exerciseToShow(workout)).toBe("leg-press");
  });

  it("is restored after the app is closed and reopened", async () => {
    const { forge } = setup();
    const f = forge();
    const work = await f.createGym("Work");
    const started = await f.startWorkout(work.id);
    const reopened = forge();
    expect(await reopened.currentWorkout()).toEqual(started);
  });
});

describe("an abandoned workout (#45)", () => {
  /** A workout started at 18:00 with sets logged at 18:10 and 18:20. */
  async function withSets() {
    const env = await started();
    const { f, id, at } = env;
    await f.addExercise(id, "bench-press");
    await f.addExercise(id, "leg-press"); // never done
    at(18, 10);
    await f.logSet(id, "bench-press", { load: 135, reps: 8 });
    at(18, 20);
    await f.logSet(id, "bench-press", { load: 135, reps: 7 });
    return env;
  }

  it("is finished 3 hours after its last set, at that set's time", async () => {
    const { forge, id, at } = await withSets();
    at(21, 20);
    const reopened = forge();
    expect(await reopened.currentWorkout()).toBeUndefined();
    const saved = await reopened.getWorkout(id);
    expect(new Date(saved?.finishedAt ?? "")).toEqual(
      new Date(2026, 9, 25, 18, 20),
    );
    expect(saved?.entries.map((e) => e.exerciseId)).toEqual(["bench-press"]);
  });

  it("stays in progress until then", async () => {
    const { forge, id, at } = await withSets();
    at(21, 19);
    expect((await forge().currentWorkout())?.id).toBe(id);
  });

  it("is finished days later too, and a new workout can start", async () => {
    const { forge, id, at } = await withSets();
    at(9, 0, 27);
    const reopened = forge();
    const work = (await reopened.listGyms())[0];
    const next = await reopened.startWorkout(work.id);
    expect(next.id).not.toBe(id);
    expect(next.date).toBe("2026-10-27");
    expect((await reopened.getWorkout(id))?.finishedAt).toBeDefined();
  });

  it("is discarded with no sets, 3 hours after it started", async () => {
    const { forge, id, at } = await started();
    at(21, 0);
    const reopened = forge();
    expect(await reopened.currentWorkout()).toBeUndefined();
    expect(await reopened.getWorkout(id)).toBeUndefined();
    expect(await reopened.takeAutoFinished()).toBeUndefined();
  });

  it("is mentioned once", async () => {
    const { forge, id, at } = await withSets();
    at(22, 0);
    const reopened = forge();
    await reopened.currentWorkout();
    expect((await reopened.takeAutoFinished())?.id).toBe(id);
    expect(await reopened.takeAutoFinished()).toBeUndefined();
    expect(await forge().takeAutoFinished()).toBeUndefined();
  });

  it("isn't mentioned when finished by tapping Finish", async () => {
    const { f, id } = await withSets();
    await f.finishWorkout(id);
    expect(await f.takeAutoFinished()).toBeUndefined();
  });

  it("is caught when the app comes back to the foreground", async () => {
    const { f, at } = await withSets();
    at(19, 0);
    expect(await f.finishAbandonedWorkout()).toBe(false);
    at(21, 30);
    expect(await f.finishAbandonedWorkout()).toBe(true);
    expect(await f.finishAbandonedWorkout()).toBe(false);
    expect(await f.currentWorkout()).toBeUndefined();
  });
});
