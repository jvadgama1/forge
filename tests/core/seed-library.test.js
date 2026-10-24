import { describe, expect, it } from "vitest";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { MUSCLE_GROUPS } from "../../app/js/core/muscle-groups.js";

// The 17 muscle groups as defined in GLOSSARY.md, in display order.
const GLOSSARY_MUSCLE_GROUPS = [
  "chest",
  "front-delts",
  "side-delts",
  "rear-delts",
  "biceps",
  "triceps",
  "forearms",
  "lats-upper-back",
  "traps",
  "lower-back",
  "abs",
  "obliques",
  "glutes",
  "quads",
  "hamstrings",
  "adductors",
  "calves",
];
const EXERCISE_TYPES = [
  "weight-reps",
  "bodyweight-reps",
  "assisted",
  "timed",
  "cardio",
];

describe("muscle groups", () => {
  it("are exactly the 17 glossary muscle groups, each in one region", () => {
    expect(MUSCLE_GROUPS.map((m) => m.id)).toEqual(GLOSSARY_MUSCLE_GROUPS);
    for (const m of MUSCLE_GROUPS)
      expect(["push", "pull", "legs", "core"]).toContain(m.region);
  });
});

describe("seeded exercise library", () => {
  it("has at least the starter set of exercises, with unique ids and names", () => {
    expect(SEED_LIBRARY.length).toBeGreaterThanOrEqual(35);
    expect(new Set(SEED_LIBRARY.map((e) => e.id)).size).toBe(
      SEED_LIBRARY.length,
    );
    expect(new Set(SEED_LIBRARY.map((e) => e.name)).size).toBe(
      SEED_LIBRARY.length,
    );
  });

  it("uses only glossary muscle groups and known exercise types, with at least one primary muscle group", () => {
    for (const e of SEED_LIBRARY) {
      expect(e.primary.length, e.name).toBeGreaterThan(0);
      for (const m of [...e.primary, ...e.secondary])
        expect(GLOSSARY_MUSCLE_GROUPS, e.name).toContain(m);
      expect(EXERCISE_TYPES, e.name).toContain(e.type);
      expect(["upper", "lower"], e.name).toContain(e.body);
    }
  });
});
