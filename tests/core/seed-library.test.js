import { describe, expect, it } from "vitest";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { MUSCLE_GROUPS } from "../../app/js/core/muscle-groups.js";

// The 17 muscle groups as defined in GLOSSARY.md, in display order.
/** @type {import("../../app/js/core/types.js").MuscleGroup[]} */
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
  it("has about 150 exercises, with unique ids and names", () => {
    expect(SEED_LIBRARY.length).toBeGreaterThanOrEqual(140);
    expect(SEED_LIBRARY.length).toBeLessThanOrEqual(170);
    expect(new Set(SEED_LIBRARY.map((e) => e.id)).size).toBe(
      SEED_LIBRARY.length,
    );
    expect(new Set(SEED_LIBRARY.map((e) => e.name)).size).toBe(
      SEED_LIBRARY.length,
    );
  });

  it("keeps every starter exercise id, since workouts reference exercises by id", () => {
    // The 43 ids shipped in #6 (PR #24). Ids are permanent: never rename or remove one.
    const starterIds = [
      "barbell-bench-press",
      "db-bench-press",
      "incline-db-press",
      "machine-chest-press",
      "cable-fly",
      "push-up",
      "assisted-dip",
      "db-shoulder-press",
      "machine-shoulder-press",
      "db-lateral-raise",
      "cable-lateral-raise",
      "face-pull",
      "reverse-pec-deck",
      "lat-pulldown",
      "assisted-pull-up",
      "pull-up",
      "seated-cable-row",
      "one-arm-db-row",
      "chest-supported-row",
      "db-shrug",
      "back-extension",
      "db-curl",
      "cable-curl",
      "hammer-curl",
      "triceps-pushdown",
      "overhead-cable-extension",
      "barbell-back-squat",
      "leg-press",
      "goblet-squat",
      "db-bulgarian-split-squat",
      "leg-extension",
      "romanian-deadlift",
      "seated-leg-curl",
      "hip-thrust",
      "hip-adduction-machine",
      "standing-calf-raise",
      "seated-calf-raise",
      "cable-crunch",
      "hanging-knee-raise",
      "plank",
      "side-plank",
      "pallof-press",
      "treadmill",
    ];
    const ids = new Set(SEED_LIBRARY.map((e) => e.id));
    expect(starterIds.filter((id) => !ids.has(id))).toEqual([]);
  });

  it("makes every muscle group the primary muscle group of at least three exercises", () => {
    const thin = GLOSSARY_MUSCLE_GROUPS.filter(
      (m) => SEED_LIBRARY.filter((e) => e.primary.includes(m)).length < 3,
    );
    expect(thin).toEqual([]);
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
