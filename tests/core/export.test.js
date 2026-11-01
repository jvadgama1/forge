import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/**
 * The core on 25 Oct 2026 with one of everything: a gym, a custom
 * exercise with settings, a routine saved twice, a finished workout with a
 * superset and flags, and two body weight entries.
 */
async function setup() {
  const store = createMemoryStore();
  let clock = new Date(2026, 9, 25, 18, 0);
  const f = createForge({ store, library, now: () => clock });
  const gym = await f.createGym("Work, upstairs");
  const band = await f.saveCustomExercise({
    name: 'Band "Pull" Apart',
    type: "weight-reps",
    primary: ["rear-delts"],
    secondary: [],
    body: "upper",
  });
  await f.saveExerciseSettings("bench-press", { rest: 120, note: "Notch 3" });
  const routine = await f.saveRoutine({
    name: "Upper",
    days: [
      {
        name: "A",
        slots: [{ exerciseId: "bench-press", sets: 3, repMin: 8, repMax: 12 }],
      },
    ],
  });
  await f.saveRoutine({
    id: routine.id,
    name: "Upper",
    days: [
      {
        id: routine.versions[0].days[0].id,
        name: "A",
        slots: [{ exerciseId: "bench-press", sets: 4, repMin: 8, repMax: 12 }],
      },
    ],
  });
  let w = await f.startWorkout(gym.id);
  for (const id of ["bench-press", band.id]) w = await f.addExercise(w.id, id);
  w = await f.pairExercises(w.id, "bench-press", band.id);
  w = await f.logSet(w.id, "bench-press", { load: 95, reps: 10, warmUp: true });
  w = await f.logSet(w.id, "bench-press", { load: 135, reps: 8, rir: 2 });
  w = await f.logSet(w.id, band.id, { load: 20, reps: 15 });
  await f.finishWorkout(w.id);
  await f.addBodyWeight({ date: "2026-10-20", load: 181.6, unit: "lb" });
  await f.addBodyWeight({ date: "2026-10-24", load: 82.5, unit: "kg" });
  clock = new Date(2026, 9, 25, 20, 0);
  return { f, band, routine };
}

describe("export (#22)", () => {
  it("as JSON has every gym, custom exercise, setting, routine version, workout and body weight entry", async () => {
    const { f, band } = await setup();
    const data = await f.exportJson();
    expect(data.app).toBe("Forge");
    expect(data.exportedAt).toBe(new Date(2026, 9, 25, 20, 0).toISOString());
    expect(data.gyms.map((g) => g.name)).toEqual(["Work, upstairs"]);
    expect(data.customExercises.map((e) => e.id)).toEqual([band.id]);
    expect(data.exerciseSettings).toEqual([
      { id: "bench-press", rest: 120, note: "Notch 3" },
    ]);
    expect(data.routines[0].versions).toHaveLength(2);
    expect(data.workouts).toHaveLength(1);
    expect(data.workouts[0].entries.flatMap((e) => e.sets)).toHaveLength(3);
    expect(data.bodyWeights.map((b) => b.load)).toEqual([82.5, 181.6]);
    expect(data.settings).toMatchObject({ id: "user" });
  });

  it("as CSV has one row per set, with its date, gym, exercise, measure, RIR, flags and superset", async () => {
    const { f } = await setup();
    const rows = (await f.exportSetsCsv()).trim().split("\r\n");
    expect(rows[0]).toBe(
      "date,gym,exercise,set,load,unit,reps,seconds,distance,distance_unit,rir,warm_up,drop_set,superset,round",
    );
    expect(rows.slice(1)).toEqual([
      '2026-10-25,"Work, upstairs",Bench Press,1,95,lb,10,,,,,yes,,,',
      '2026-10-25,"Work, upstairs",Bench Press,2,135,lb,8,,,,2,,,1,1',
      '2026-10-25,"Work, upstairs","Band ""Pull"" Apart",1,20,lb,15,,,,,,,1,1',
    ]);
  });

  it("as CSV has body weight entries, oldest first", async () => {
    const { f } = await setup();
    expect((await f.exportBodyWeightCsv()).trim().split("\r\n")).toEqual([
      "date,weight,unit",
      "2026-10-20,181.6,lb",
      "2026-10-24,82.5,kg",
    ]);
  });
});
