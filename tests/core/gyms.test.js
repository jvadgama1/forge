import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

function forge(store = createMemoryStore()) {
  return createForge({ store, library });
}

describe("gyms", () => {
  it("lists the gyms alphabetically, whatever order they were created in", async () => {
    const f = forge();
    await f.createGym("Work");
    await f.createGym("Apartment");
    await f.createGym("Home");
    expect((await f.listGyms()).map((g) => g.name)).toEqual([
      "Apartment",
      "Home",
      "Work",
    ]);
  });

  it("renames a gym, keeping its exercises", async () => {
    const f = forge();
    const gym = await f.createGym("Wrok");
    await f.setExerciseAtGym(gym.id, "bench-press", true);
    await f.renameGym(gym.id, "Work");
    expect(await f.listGyms()).toEqual([
      { id: gym.id, name: "Work", exerciseIds: ["bench-press"] },
    ]);
  });

  it("finds a gym by id, and nothing once it's deleted", async () => {
    const f = forge();
    const home = await f.createGym("Home");
    expect((await f.getGym(home.id))?.name).toBe("Home");
    await f.deleteGym(home.id);
    expect(await f.getGym(home.id)).toBeUndefined();
  });

  it("returns the gym as saved after a rename", async () => {
    const f = forge();
    const gym = await f.createGym("Wrok");
    expect(await f.renameGym(gym.id, " Work ")).toEqual({
      id: gym.id,
      name: "Work",
      exerciseIds: [],
    });
  });

  it("trims gym names and refuses a blank one", async () => {
    const f = forge();
    const home = await f.createGym("  Home ");
    expect(home.name).toBe("Home");
    await expect(f.createGym("   ")).rejects.toThrow("A gym needs a name");
    await expect(f.renameGym(home.id, "")).rejects.toThrow(
      "A gym needs a name",
    );
    expect((await f.listGyms()).map((g) => g.name)).toEqual(["Home"]);
  });

  it("deletes a gym; if it was current, the first remaining gym is preselected", async () => {
    const f = forge();
    await f.createGym("Home");
    await f.createGym("Work");
    const apartment = await f.createGym("Apartment");
    await f.chooseGym(apartment.id);
    await f.deleteGym(apartment.id);
    expect((await f.listGyms()).map((g) => g.name)).toEqual(["Home", "Work"]);
    expect((await f.currentGym())?.name).toBe("Home");
  });
});

describe("current gym", () => {
  it("remembers the last gym chosen, across a reload", async () => {
    const store = createMemoryStore();
    const f = forge(store);
    await f.createGym("Apartment");
    const work = await f.createGym("Work");
    await f.chooseGym(work.id);
    const reloaded = forge(store);
    expect((await reloaded.currentGym())?.name).toBe("Work");
  });

  it("preselects the first gym alphabetically before any is chosen", async () => {
    const f = forge();
    await f.createGym("Work");
    await f.createGym("Apartment");
    expect((await f.currentGym())?.name).toBe("Apartment");
  });
});

describe("exercise picker", () => {
  it("lists only the gym's exercises, still searched and filtered by muscle group", async () => {
    const f = forge();
    const home = await f.createGym("Home");
    for (const id of ["bench-press", "leg-press", "triceps-pushdown"])
      await f.setExerciseAtGym(home.id, id, true);

    const names = async (/** @type {object} */ filter) =>
      (await f.pickExercises({ gymId: home.id, ...filter })).map((e) => e.name);

    expect(await names({})).toEqual([
      "Bench Press",
      "Leg Press",
      "Triceps Pushdown",
    ]);
    expect(await names({ query: "press" })).toEqual([
      "Bench Press",
      "Leg Press",
    ]);
    expect(await names({ muscleGroup: "triceps" })).toEqual([
      "Triceps Pushdown",
      "Bench Press",
    ]);
  });

  it("keeps every tick when they arrive faster than the store answers", async () => {
    // Firestore reads the document when asked but answers after a server
    // round trip, so quick taps overlap.
    const memory = createMemoryStore();
    /** @type {import("../../app/js/core/types.js").Store} */
    const slow = {
      ...memory,
      get: async (collection, id) => {
        const doc = await memory.get(collection, id);
        await new Promise((resolve) => setTimeout(resolve, 20));
        return doc;
      },
    };
    const f = forge(slow);
    const home = await f.createGym("Home");
    await Promise.all([
      f.setExerciseAtGym(home.id, "bench-press", true),
      f.setExerciseAtGym(home.id, "leg-press", true),
    ]);
    const here = await f.pickExercises({ gymId: home.id });
    expect(here.map((e) => e.name)).toEqual(["Bench Press", "Leg Press"]);
  });

  it("drops an unticked exercise from the gym", async () => {
    const f = forge();
    const home = await f.createGym("Home");
    await f.setExerciseAtGym(home.id, "bench-press", true);
    await f.setExerciseAtGym(home.id, "leg-press", true);
    await f.setExerciseAtGym(home.id, "bench-press", false);
    const here = await f.pickExercises({ gymId: home.id });
    expect(here.map((e) => e.name)).toEqual(["Leg Press"]);
  });

  it("lists the whole library when there's no gym, or the gym is gone", async () => {
    const f = forge();
    const everything = [
      "Bench Press",
      "Incline DB Press",
      "Lat Pulldown",
      "Leg Press",
      "Triceps Pushdown",
    ];
    const names = async (/** @type {string | undefined} */ gymId) =>
      (await f.pickExercises({ gymId })).map((e) => e.name);
    expect(await names(undefined)).toEqual(everything);
    expect(await names("deleted-on-another-device")).toEqual(everything);
  });

  it("shows the whole library with show all", async () => {
    const f = forge();
    const home = await f.createGym("Home");
    await f.setExerciseAtGym(home.id, "bench-press", true);
    const all = await f.pickExercises({ gymId: home.id, showAll: true });
    expect(all.map((e) => e.name)).toEqual([
      "Bench Press",
      "Incline DB Press",
      "Lat Pulldown",
      "Leg Press",
      "Triceps Pushdown",
    ]);
  });
});
