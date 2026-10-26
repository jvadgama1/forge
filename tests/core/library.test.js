import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

function forge() {
  return createForge({ store: createMemoryStore(), library });
}

describe("exercise by id", () => {
  it("finds seeded and custom exercises, and nothing for an unknown id", async () => {
    const custom = {
      id: "custom-landmine-press",
      name: "Landmine Press",
      type: "weight-reps",
      primary: ["front-delts"],
      secondary: ["chest"],
      body: "upper",
    };
    const f = createForge({
      store: createMemoryStore({ customExercises: [custom] }),
      library,
    });
    expect((await f.getExercise("leg-press"))?.name).toBe("Leg Press");
    expect(await f.getExercise("custom-landmine-press")).toEqual(custom);
    expect(await f.getExercise("no-such-exercise")).toBeUndefined();
  });
});

describe("exercise library", () => {
  it("finds exercises whose name contains the search text, ignoring case", async () => {
    const results = await forge().searchExercises({ query: "PRESS" });
    expect(results.map((e) => e.name)).toEqual([
      "Bench Press",
      "Incline DB Press",
      "Leg Press",
    ]);
  });

  it("filters by muscle group, listing exercises where it is a primary muscle before those where it is secondary", async () => {
    // Triceps is primary for Triceps Pushdown and secondary for Bench Press:
    // primary-first must beat alphabetical order here.
    const triceps = await forge().searchExercises({ muscleGroup: "triceps" });
    expect(triceps.map((e) => e.name)).toEqual([
      "Triceps Pushdown",
      "Bench Press",
    ]);
  });

  it("includes the user's custom exercises alongside the seeded library", async () => {
    const store = createMemoryStore({
      customExercises: [
        {
          id: "custom-landmine-press",
          name: "Landmine Press",
          type: "weight-reps",
          primary: ["front-delts"],
          secondary: ["chest"],
          body: "upper",
        },
      ],
    });
    const results = await createForge({ store, library }).searchExercises({
      query: "press",
    });
    expect(results.map((e) => e.name)).toEqual([
      "Bench Press",
      "Incline DB Press",
      "Landmine Press",
      "Leg Press",
    ]);
  });

  it("combines search text with a muscle group filter", async () => {
    const results = await forge().searchExercises({
      query: "incline",
      muscleGroup: "front-delts",
    });
    expect(results.map((e) => e.name)).toEqual(["Incline DB Press"]);
  });
});
