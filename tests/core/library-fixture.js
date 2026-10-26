// A small exercise library for core tests: two chest presses, a back, a legs
// and a triceps exercise.

/** @type {import("../../app/js/core/types.js").Exercise[]} */
export const library = [
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
