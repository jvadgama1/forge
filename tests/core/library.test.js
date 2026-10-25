import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";

/** @type {import("../../app/js/core/types.js").Exercise[]} */
const library = [
  {
    id: "bench-press",
    name: "Bench Press",
    type: "weight-reps",
    primary: ["chest"],
    secondary: ["triceps", "front-delts"],
    body: "upper",
  },
  {
    id: "incline-db-press",
    name: "Incline DB Press",
    type: "weight-reps",
    primary: ["chest"],
    secondary: ["front-delts"],
    body: "upper",
  },
  {
    id: "lat-pulldown",
    name: "Lat Pulldown",
    type: "weight-reps",
    primary: ["lats-upper-back"],
    secondary: ["biceps"],
    body: "upper",
  },
  {
    id: "leg-press",
    name: "Leg Press",
    type: "weight-reps",
    primary: ["quads"],
    secondary: ["glutes"],
    body: "lower",
  },
  {
    id: "triceps-pushdown",
    name: "Triceps Pushdown",
    type: "weight-reps",
    primary: ["triceps"],
    secondary: [],
    body: "upper",
  },
];

function forge() {
  return createForge({ store: createMemoryStore(), library });
}

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
