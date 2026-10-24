// Shared domain types (JSDoc only; ADR-0002). Terms follow GLOSSARY.md.

/**
 * @typedef {"chest" | "front-delts" | "side-delts" | "rear-delts" | "biceps" | "triceps"
 *   | "forearms" | "lats-upper-back" | "traps" | "lower-back" | "abs" | "obliques"
 *   | "glutes" | "quads" | "hamstrings" | "adductors" | "calves"} MuscleGroup
 */

/** @typedef {"push" | "pull" | "legs" | "core"} Region */

/** @typedef {"weight-reps" | "bodyweight-reps" | "assisted" | "timed" | "cardio"} ExerciseType */

/**
 * @typedef {object} Exercise
 * @property {string} id Stable identifier; never reused.
 * @property {string} name
 * @property {ExerciseType} type
 * @property {MuscleGroup[]} primary
 * @property {MuscleGroup[]} secondary
 * @property {"upper" | "lower"} body Picks the default increment.
 */

/**
 * The storage port the core depends on. Implemented by the in-memory store
 * (tests, previews) and, later, the Firestore store.
 * @typedef {object} Store
 * @property {() => Promise<Exercise[]>} customExercises
 */

export {};
