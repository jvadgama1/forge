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
 * How a list of exercises is narrowed: by text in the name, and by muscle
 * group.
 * @typedef {{ query?: string, muscleGroup?: MuscleGroup }} ExerciseFilter
 */

/**
 * A named place the user trains, defined by the exercises available there.
 * @typedef {object} Gym
 * @property {string} id
 * @property {string} name
 * @property {string[]} exerciseIds
 */

/**
 * One effort at an exercise (GLOSSARY: Set).
 * @typedef {object} WorkoutSet
 * @property {number} load
 * @property {"lb" | "kg"} unit
 * @property {number} reps
 * @property {number} [rir] Reps in reserve, 0–4; 4 means "4 or more".
 * @property {boolean} [warmUp]
 * @property {boolean} [drop]
 * @property {string} loggedAt ISO 8601 timestamp.
 */

/**
 * Which set of which workout (#20): the exercise's set at `index`, from 0.
 * @typedef {{ workoutId: string, exerciseId: string, index: number }} SetRef
 */

/**
 * A set as the user enters it, to log or correct (#11, #20).
 * @typedef {{ load: number, reps: number, rir?: number, warmUp?: boolean, drop?: boolean }} SetInput
 */

/**
 * An exercise in a workout, with its sets in the order logged.
 * @typedef {object} WorkoutEntry
 * @property {string} exerciseId
 * @property {boolean} [skipped]
 * @property {WorkoutSet[]} sets
 */

/**
 * One training occasion on one date at one gym. In progress until it has a
 * finish time.
 * @typedef {object} Workout
 * @property {string} id
 * @property {string} date Local date, YYYY-MM-DD.
 * @property {string} startedAt ISO 8601 timestamp.
 * @property {string} [finishedAt] ISO 8601 timestamp.
 * @property {string} gymId
 * @property {WorkoutRoutine} [routine] The routine day it followed (#14).
 * @property {string} [note]
 * @property {WorkoutEntry[]} entries In workout order.
 */

/**
 * A dated body-weight reading (GLOSSARY: Body weight entry; #18). `loggedAt`
 * orders two on one date: the one logged later is the latest, and an edit
 * keeps its place.
 * @typedef {Load & { id: string, date: string, loggedAt: string }} BodyWeightEntry
 */

/**
 * Which routine day to start (#14).
 * @typedef {{ routineId: string, dayId: string }} RoutineDayRef
 */

/**
 * The routine day a workout followed, at the version it followed (#14).
 * @typedef {{ routineId: string, version: number, dayId: string }} WorkoutRoutine
 */

/**
 * One exercise in a routine day (GLOSSARY: Slot): target sets, a
 * rep range and an optional target RIR.
 * @typedef {object} Slot
 * @property {string} exerciseId
 * @property {number} sets
 * @property {number} repMin
 * @property {number} repMax
 * @property {number} [rir] 0–4; 4 means "4 or more".
 */

/**
 * One workout's worth of a routine, such as Push A (GLOSSARY: Routine day).
 * @typedef {{ id: string, name: string, slots: Slot[] }} RoutineDay
 */

/**
 * A routine day as an editor saves it: a new one has no id yet.
 * @typedef {{ id?: string, name: string, slots: Slot[] }} RoutineDayDraft
 */

/**
 * An immutable snapshot of a routine (GLOSSARY: Routine version).
 * @typedef {{ number: number, savedAt: string, days: RoutineDay[] }} RoutineVersion
 */

/**
 * A named, versioned set of routine days (GLOSSARY: Routine), every version kept so past
 * workouts stay linked to the one they followed (spec #3, story 21).
 * @typedef {{ id: string, name: string, versions: RoutineVersion[] }} Routine
 */

/**
 * A load with its unit, as entered (spec #3: loads are stored as entered).
 * @typedef {{ load: number, unit: "lb" | "kg" }} Load
 */

/**
 * A suggested weight (GLOSSARY: Suggested weight; #15) and why: up by the
 * increment, hold, down by the increment, or a comeback.
 * @typedef {Load & { reason: "up" | "hold" | "down" | "comeback" }} Suggestion
 */

/**
 * One exercise's sets in one workout, for its last workout and history.
 * @typedef {{ workout: Workout, sets: WorkoutSet[] }} ExerciseInWorkout
 */

/**
 * A record a set can beat (GLOSSARY: Record): heaviest load, best e1RM, most
 * reps at a load.
 * @typedef {"heaviest" | "e1rm" | "reps"} RecordKind
 */

/**
 * The user's settings: one document, id "user", created on first change.
 * @typedef {object} Settings
 * @property {"user"} id
 * @property {string} [lastGymId] The gym last chosen (spec #3, story 8).
 * @property {string} [workoutInProgress] The unfinished workout's id, so it
 *   is found without listing every workout (spec #3, story 43).
 * @property {string} [autoFinished] A workout finished automatically, not yet
 *   mentioned on the Log tab (#45).
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
