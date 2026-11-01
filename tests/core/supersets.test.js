import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** @import { Workout } from "../../app/js/core/types.js" */

/** The core on 25 Oct 2026, with a gym. */
async function setup() {
  const store = createMemoryStore();
  const f = createForge({
    store,
    library,
    now: () => new Date(2026, 9, 25, 18, 0),
  });
  const gym = await f.createGym("Work");
  return { f, store, gym };
}

/**
 * A freestyle workout with bench press, lat pulldown and leg press added.
 * @param {Awaited<ReturnType<typeof setup>>} env
 */
async function freestyle({ f, gym }) {
  let w = await f.startWorkout(gym.id);
  for (const id of ["bench-press", "lat-pulldown", "leg-press"])
    w = await f.addExercise(w.id, id);
  return w;
}

/**
 * Logs a set of `exerciseId` and says where to go and how long to rest.
 * @param {Awaited<ReturnType<typeof setup>>["f"]} f
 * @param {Workout} w
 * @param {string} exerciseId
 */
async function log(f, w, exerciseId) {
  const logged = await f.logSet(w.id, exerciseId, { load: 100, reps: 8 });
  return {
    w: logged,
    next: await f.nextExercise(logged, exerciseId),
    rest: await f.restAfterSet(exerciseId, logged),
  };
}

/** A routine whose Upper A pairs bench press with lat pulldown. */
const PAIRED = {
  name: "Upper",
  days: [
    {
      name: "Upper A",
      slots: [
        {
          exerciseId: "bench-press",
          sets: 4,
          repMin: 8,
          repMax: 12,
          superset: "s1",
        },
        {
          exerciseId: "lat-pulldown",
          sets: 2,
          repMin: 8,
          repMax: 12,
          superset: "s1",
        },
        { exerciseId: "leg-press", sets: 3, repMin: 10, repMax: 15 },
      ],
    },
  ],
};

describe("pairing exercises in a workout (#17)", () => {
  it("pairs two exercises, unpairs one, and re-pairs it with another", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    expect(f.supersetOf(w, "bench-press")).toEqual([
      "bench-press",
      "lat-pulldown",
    ]);
    w = await f.unpairExercise(w.id, "lat-pulldown");
    expect(f.supersetOf(w, "bench-press")).toBeUndefined();
    w = await f.pairExercises(w.id, "bench-press", "leg-press");
    expect(f.supersetOf(w, "leg-press")).toEqual(["bench-press", "leg-press"]);
  });

  it("adds a third to a pair as a tri-set, never blocking it", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    w = await f.pairExercises(w.id, "bench-press", "leg-press");
    expect(f.supersetOf(w, "leg-press")).toEqual([
      "bench-press",
      "lat-pulldown",
      "leg-press",
    ]);
  });

  it("applies a routine day's planned pairs when the workout starts", async () => {
    const env = await setup();
    const { f, gym } = env;
    const routine = await f.saveRoutine(PAIRED);
    const w = await f.startWorkout(gym.id, {
      day: { routineId: routine.id, dayId: routine.versions[0].days[0].id },
    });
    expect(f.supersetOf(w, "bench-press")).toEqual([
      "bench-press",
      "lat-pulldown",
    ]);
    expect(f.supersetOf(w, "leg-press")).toBeUndefined();
  });

  it("changes only this workout, unless saved to the routine", async () => {
    const env = await setup();
    const { f, gym } = env;
    const routine = await f.saveRoutine({
      name: "Upper",
      days: [
        {
          name: "Upper A",
          slots: [
            { exerciseId: "bench-press", sets: 3, repMin: 8, repMax: 12 },
            { exerciseId: "lat-pulldown", sets: 3, repMin: 8, repMax: 12 },
          ],
        },
      ],
    });
    const day = {
      routineId: routine.id,
      dayId: routine.versions[0].days[0].id,
    };
    let w = await f.startWorkout(gym.id, { day });
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    w = await f.logSet(w.id, "bench-press", { load: 100, reps: 8 });
    expect((await f.getRoutine(routine.id))?.versions).toHaveLength(1);
    await f.finishWorkout(w.id, { saveToRoutine: true });
    const saved = await f.getRoutine(routine.id);
    const slots = saved?.versions.at(-1)?.days[0].slots ?? [];
    expect(slots[0].superset).toBeDefined();
    expect(slots[0].superset).toBe(slots[1].superset);
  });
});

describe("the next set to log in a superset (#17)", () => {
  it("alternates through the pair and returns to the first after each round", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    let step = await log(f, w, "bench-press");
    expect(step.next).toBe("lat-pulldown");
    step = await log(f, step.w, "lat-pulldown");
    expect(step.next).toBe("bench-press");
    step = await log(f, step.w, "bench-press");
    expect(step.next).toBe("lat-pulldown");
  });

  it("drops a member with no target sets left, carrying on alone", async () => {
    // Bench press targets 4 sets, lat pulldown 2.
    const env = await setup();
    const { f, gym } = env;
    const routine = await f.saveRoutine(PAIRED);
    let w = await f.startWorkout(gym.id, {
      day: { routineId: routine.id, dayId: routine.versions[0].days[0].id },
    });
    const order = [];
    let at = "bench-press";
    for (let i = 0; i < 6; i++) {
      order.push(at);
      const step = await log(f, w, at);
      w = step.w;
      at = step.next;
    }
    expect(order).toEqual([
      "bench-press",
      "lat-pulldown",
      "bench-press",
      "lat-pulldown",
      "bench-press",
      "bench-press",
    ]);
  });

  it("is the same exercise outside a superset", async () => {
    const env = await setup();
    const { f } = env;
    const w = await freestyle(env);
    expect((await log(f, w, "leg-press")).next).toBe("leg-press");
  });
});

describe("rest in a superset (#17, #52)", () => {
  it("is none within a round, then the longest member rest default", async () => {
    const env = await setup();
    const { f } = env;
    await f.saveExerciseSettings("lat-pulldown", { rest: 120 });
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    const first = await log(f, w, "bench-press");
    expect(first.rest).toBeUndefined();
    const second = await log(f, first.w, "lat-pulldown");
    expect(second.rest).toBe(120);
  });

  it("counts an Off member as 0 s, and starts none when every member is Off", async () => {
    const env = await setup();
    const { f } = env;
    await f.saveExerciseSettings("bench-press", { rest: "off" });
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    let step = await log(f, w, "bench-press");
    step = await log(f, step.w, "lat-pulldown");
    expect(step.rest).toBe(90);
    await f.saveExerciseSettings("lat-pulldown", { rest: "off" });
    step = await log(f, step.w, "bench-press");
    step = await log(f, step.w, "lat-pulldown");
    expect(step.rest).toBeUndefined();
  });

  it("uses a single exercise's own rest default once its partner drops out", async () => {
    const env = await setup();
    const { f, gym } = env;
    await f.saveExerciseSettings("lat-pulldown", { rest: 180 });
    const routine = await f.saveRoutine(PAIRED);
    let w = await f.startWorkout(gym.id, {
      day: { routineId: routine.id, dayId: routine.versions[0].days[0].id },
    });
    let rest;
    for (const id of [
      "bench-press",
      "lat-pulldown",
      "bench-press",
      "lat-pulldown",
      "bench-press",
    ]) {
      const step = await log(f, w, id);
      w = step.w;
      rest = step.rest;
    }
    // Lat pulldown's 2 sets are done: bench press rests its own 90 s.
    expect(rest).toBe(90);
  });
});

describe("superset membership on each set (#17)", () => {
  it("records the superset and round automatically, and stays truthful after an unpair", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    for (const id of ["bench-press", "lat-pulldown", "bench-press"])
      w = await f.logSet(w.id, id, { load: 100, reps: 8 });
    w = await f.unpairExercise(w.id, "bench-press");
    w = await f.logSet(w.id, "bench-press", { load: 100, reps: 8 });
    const bench = w.entries.find((e) => e.exerciseId === "bench-press")?.sets;
    const id = bench?.[0].superset?.id;
    expect(id).toBeDefined();
    expect(bench?.map((s) => s.superset)).toEqual([
      { id, round: 1 },
      { id, round: 2 },
      undefined,
    ]);
    const lat = w.entries.find((e) => e.exerciseId === "lat-pulldown")?.sets;
    expect(lat?.[0].superset).toEqual({ id, round: 1 });
  });

  it("names the partner on the last-workout line", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    w = await f.logSet(w.id, "bench-press", { load: 100, reps: 8 });
    w = await f.logSet(w.id, "lat-pulldown", { load: 90, reps: 10 });
    w = await f.logSet(w.id, "leg-press", { load: 200, reps: 10 });
    await f.finishWorkout(w.id);
    expect((await f.lastWorkoutLine("bench-press"))?.partners).toEqual([
      "lat-pulldown",
    ]);
    expect((await f.lastWorkoutLine("leg-press"))?.partners).toBeUndefined();
  });
});

describe("superset edge cases (#17)", () => {
  it("lets a third join a pair mid-workout, in the round under way", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    for (const id of ["bench-press", "lat-pulldown", "bench-press"])
      w = await f.logSet(w.id, id, { load: 100, reps: 8 });
    expect(f.partnersFor(w, "bench-press")).toEqual(["leg-press"]);
    w = await f.pairExercises(w.id, "bench-press", "leg-press");
    w = await f.logSet(w.id, "leg-press", { load: 200, reps: 10 });
    const leg = w.entries.find((e) => e.exerciseId === "leg-press")?.sets;
    // Bench press has started round 2; leg press joins it.
    expect(leg?.[0].superset?.round).toBe(2);
    expect(await f.nextExercise(w, "leg-press")).toBe("lat-pulldown");
  });

  it("takes a skipped exercise out of its superset, its partner carrying on alone", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    w = await f.skipExercise(w.id, "lat-pulldown");
    expect(f.supersetOf(w, "bench-press")).toBeUndefined();
    const step = await log(f, w, "bench-press");
    expect(step.next).toBe("bench-press");
    expect(step.rest).toBe(90);
  });

  it("keeps warm-ups and drop sets out of the rotation", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    w = await f.logSet(w.id, "bench-press", {
      load: 60,
      reps: 10,
      warmUp: true,
    });
    expect(w.entries[0].sets[0].superset).toBeUndefined();
    expect(await f.nextExercise(w, "bench-press")).toBe("bench-press");
  });

  it("undoes the superset's most recent set from the partner's screen", async () => {
    const env = await setup();
    const { f } = env;
    let w = await freestyle(env);
    w = await f.pairExercises(w.id, "bench-press", "lat-pulldown");
    w = await f.logSet(w.id, "lat-pulldown", { load: 90, reps: 10 });
    w = await f.logSet(w.id, "bench-press", { load: 100, reps: 8 });
    // The screen has moved on to lat pulldown; undo takes back the bench set.
    expect(f.undoTarget(w, "lat-pulldown")).toBe("bench-press");
    expect(f.undoTarget(w, "leg-press")).toBe("leg-press");
  });
});

describe("planned pairs in the routine editor (#17)", () => {
  /** @param {string[]} ids @param {(string | undefined)[]} groups */
  const slots = (ids, groups) =>
    ids.map((exerciseId, i) => ({
      exerciseId,
      sets: 3,
      repMin: 8,
      repMax: 12,
      ...(groups[i] === undefined ? {} : { superset: groups[i] }),
    }));
  /** @param {{ superset?: string }[]} list */
  const groups = (list) => list.map((s) => s.superset);

  it("pairs a slot with the next, and a third joins as a superset of three", async () => {
    const { f } = await setup();
    let list = slots(["a", "b", "c"], []);
    list = f.pairWithNext(list, 0, true);
    expect(groups(list)).toEqual(["a", "a", undefined]);
    list = f.pairWithNext(list, 1, true);
    expect(groups(list)).toEqual(["a", "a", "a"]);
  });

  it("splits a run of three in the middle, leaving the first alone", async () => {
    const { f } = await setup();
    const list = f.pairWithNext(
      slots(["a", "b", "c"], ["a", "a", "a"]),
      0,
      false,
    );
    expect(groups(list)).toEqual([undefined, "b", "b"]);
  });
});
