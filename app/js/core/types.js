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
 * A stored document: plain JSON data with a string id, unique within its
 * collection. Only strings, numbers, booleans, null, arrays and plain objects:
 * dates and times are ISO 8601 strings (e.g. "2026-10-24", or a full
 * timestamp), never Date objects, so every store returns exactly what was put.
 * @typedef {{ id: string, [field: string]: any }} Doc
 */

/**
 * The storage port the core depends on: a document store of named
 * collections, all belonging to the signed-in user. The core holds every
 * rule; stores only keep documents. Implemented by the in-memory store
 * (tests, previews) and the Firestore store, and pinned by one contract suite.
 * @typedef {object} Store
 * @property {(collection: string, id: string) => Promise<Doc | undefined>} get
 * @property {(collection: string) => Promise<Doc[]>} list
 * @property {(collection: string, doc: Doc) => Promise<void>} put Replaces any document with the same id.
 * @property {(collection: string, id: string) => Promise<void>} remove A missing document is not an error.
 */

export {};
