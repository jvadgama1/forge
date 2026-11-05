import { describe, expect, it } from "vitest";
import { FIGURES } from "../../app/js/screens/body-figures.js";
import { MUSCLE_GROUPS } from "../../app/js/core/muscle-groups.js";

describe("body heat map figures (#85)", () => {
  it("draws every muscle group on at least one figure", () => {
    const drawn = new Set(
      FIGURES.flatMap((f) => f.shapes.map((s) => s.muscleGroup)),
    );
    expect(MUSCLE_GROUPS.filter((m) => !drawn.has(m.id))).toEqual([]);
  });

  it("draws each muscle group once per figure, so both its sides share a shade", () => {
    for (const figure of FIGURES) {
      const groups = figure.shapes.map((s) => s.muscleGroup);
      expect(groups).toEqual([...new Set(groups)]);
    }
  });
});
