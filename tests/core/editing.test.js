import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** The core on a clock tests move, 25 Oct 2026 by default, with a gym. */
async function setup() {
  let clock = new Date(2026, 9, 25, 18, 0);
  const f = createForge({
    store: createMemoryStore(),
    library,
    now: () => clock,
  });
  const gym = await f.createGym("Work");
  return {
    f,
    gym,
    /** @param {number} day of Oct 2026 @param {number} [hour] */
    on: (day, hour = 18) => {
      clock = new Date(2026, 9, day, hour, 0);
    },
  };
}

/**
 * A finished workout of bench press sets, started now.
 * @param {Awaited<ReturnType<typeof setup>>} env
 * @param {Array<[load: number, reps: number]>} sets
 * @param {string} [date] to back-date it
 */
async function benchWorkout(env, sets, date) {
  const w = await env.f.startWorkout(env.gym.id, date ? { date } : {});
  await env.f.addExercise(w.id, "bench-press");
  for (const [load, reps] of sets)
    await env.f.logSet(w.id, "bench-press", { load, reps });
  const done = await env.f.finishWorkout(w.id);
  if (!done) throw new Error("discarded");
  return done;
}

describe("the workout list (#20)", () => {
  it("lists workouts newest first by workout date, the one in progress included", async () => {
    const env = await setup();
    env.on(20);
    const a = await benchWorkout(env, [[135, 8]]);
    env.on(22);
    const b = await benchWorkout(env, [[135, 9]]);
    env.on(25);
    // Logged today, but back-dated to the 21st.
    const c = await benchWorkout(env, [[130, 10]], "2026-10-21");
    const now = await env.f.startWorkout(env.gym.id);
    expect((await env.f.listWorkouts()).map((w) => w.id)).toEqual([
      now.id,
      b.id,
      c.id,
      a.id,
    ]);
  });
});

describe("back-dating (#20)", () => {
  it("starts a workout on a past date, which counts by that date", async () => {
    const env = await setup();
    env.on(22);
    await benchWorkout(env, [[135, 8]]);
    env.on(25);
    const past = await benchWorkout(env, [[200, 1]], "2026-10-20");
    expect(past.date).toBe("2026-10-20");
    // The Oct 22 workout is still the last; the back-dated one sits before it.
    expect((await env.f.lastWorkout("bench-press"))?.workout.date).toBe(
      "2026-10-22",
    );
    expect(
      (await env.f.history("bench-press")).map((h) => h.workout.date),
    ).toEqual(["2026-10-22", "2026-10-20"]);
  });

  it("refuses a future or impossible date", async () => {
    const env = await setup();
    await expect(
      env.f.startWorkout(env.gym.id, { date: "2026-10-26" }),
    ).rejects.toThrow("That date hasn't happened yet");
    await expect(
      env.f.startWorkout(env.gym.id, { date: "2026-02-30" }),
    ).rejects.toThrow("Pick a date");
  });
});

describe("editing a set (#20)", () => {
  it("changes a finished workout's set, keeping when it was logged", async () => {
    const env = await setup();
    const w = await benchWorkout(env, [
      [135, 8],
      [135, 7],
    ]);
    const edited = await env.f.editSet(w.id, "bench-press", 1, {
      load: 135,
      reps: 9,
      rir: 1,
    });
    const sets = edited.entries[0].sets;
    expect(sets.map((s) => s.reps)).toEqual([8, 9]);
    expect(sets[1]).toMatchObject({ load: 135, reps: 9, rir: 1 });
    expect(sets[1].loggedAt).toBe(w.entries[0].sets[1].loggedAt);
  });

  it("changes the records and the last workout", async () => {
    const env = await setup();
    env.on(20);
    await benchWorkout(env, [[135, 8]]);
    env.on(22);
    const w = await benchWorkout(env, [[1355, 8]]); // a slipped digit
    expect((await env.f.records("bench-press")).heaviest?.load).toBe(1355);
    await env.f.editSet(w.id, "bench-press", 0, { load: 135, reps: 9 });
    expect((await env.f.records("bench-press")).heaviest?.load).toBe(135);
    expect((await env.f.lastWorkoutLine("bench-press"))?.sets).toEqual([
      { load: 135, unit: "lb", reps: 9 },
    ]);
  });

  it("refuses what logging refuses", async () => {
    const env = await setup();
    const w = await benchWorkout(env, [[135, 8]]);
    await expect(
      env.f.editSet(w.id, "bench-press", 0, { load: 135, reps: 0 }),
    ).rejects.toThrow("Reps must be 1 or more");
    await expect(
      env.f.editSet(w.id, "bench-press", 3, { load: 135, reps: 8 }),
    ).rejects.toThrow("No such set");
  });
});

describe("deleting (#20)", () => {
  it("deletes a set; an exercise left with none goes from a finished workout", async () => {
    const env = await setup();
    const w = await benchWorkout(env, [
      [135, 8],
      [135, 7],
    ]);
    const one = await env.f.deleteSet(w.id, "bench-press", 0);
    expect(one.entries[0].sets.map((s) => s.reps)).toEqual([7]);
    const none = await env.f.deleteSet(w.id, "bench-press", 0);
    expect(none.entries).toEqual([]);
  });

  it("deletes a workout, which leaves the history and records", async () => {
    const env = await setup();
    env.on(20);
    await benchWorkout(env, [[135, 8]]);
    env.on(22);
    const w = await benchWorkout(env, [[145, 5]]);
    await env.f.deleteWorkout(w.id);
    expect(await env.f.getWorkout(w.id)).toBeUndefined();
    expect((await env.f.lastWorkout("bench-press"))?.workout.date).toBe(
      "2026-10-20",
    );
    expect((await env.f.records("bench-press")).heaviest?.load).toBe(135);
  });

  it("deletes the workout in progress, so a new one can start", async () => {
    const env = await setup();
    const w = await env.f.startWorkout(env.gym.id);
    await env.f.deleteWorkout(w.id);
    expect(await env.f.currentWorkout()).toBeUndefined();
    expect((await env.f.startWorkout(env.gym.id)).id).not.toBe(w.id);
  });
});
