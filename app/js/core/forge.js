/** @import { Mark, RangeId } from "./dashboard.js" */
/** @import { BodyWeightEntry, Exercise, ExerciseDraft, ExerciseFilter, ExerciseSettings, ExerciseInWorkout, ExerciseType, Measure, Gym, Load, RecordKind, Routine, RoutineDay, RoutineDayDraft, RoutineDayRef, RoutineVersion, SetInput, SetRef, Settings, Slot, Store, SuggestedWeight, Superset, SupersetRound, Workout, WorkoutEntry, WorkoutSet } from "./types.js" */

import { TYPE_RULES, distanceUnit } from "./exercise-types.js";
import {
  DEFAULT_RANGE,
  countsIn,
  e1rmHeadline,
  hardSetsBehind,
  hardSetsCard,
  rangeFor,
} from "./dashboard.js";

/** @typedef {ReturnType<typeof createForge>} Forge */

/**
 * Each workout's best e1RM for an exercise, oldest first, in one unit.
 * @typedef {{ unit: Load["unit"], points: { workoutId: string, date: string, value: number }[] }} E1rmTrend
 */

// A workout left this long after its last set (or its start, with no sets)
// was abandoned, not paused: no real workout rests 3 hours (#45).
const ABANDONED_AFTER = 3 * 60 * 60_000;

// A break this long makes the next workout with an exercise a comeback,
// which suggests this share of the last working load (spec #3, Rules; #15).
const COMEBACK_DAYS = 14;
const COMEBACK_PERCENT = 90;

const DAY = 86_400_000;

// The rest timer's default (spec #3, story 38) and the range a rest default
// can be set to (#21).
const REST_DEFAULT = 90;
const REST_MIN = 5;
const REST_MAX = 15 * 60;

/**
 * The default increment (GLOSSARY: Increment): 5 lb upper body, 10 lb lower
 * (spec #3); in kg, 2.5 and 5, the plates a kg gym has (#21).
 * @param {Exercise["body"] | undefined} body
 * @param {Load["unit"]} unit
 */
const defaultIncrement = (body, unit) =>
  (body === "lower" ? 10 : 5) / (unit === "kg" ? 2 : 1);

// Records compare loads in kg, so a unit change doesn't fake one (spec #3).
const KG_PER_LB = 0.45359237;

/** @param {Load} load */
const inKg = ({ load, unit }) => (unit === "kg" ? load : load * KG_PER_LB);

/**
 * @param {number} kg
 * @param {Load["unit"]} unit
 */
const fromKg = (kg, unit) => (unit === "kg" ? kg : kg / KG_PER_LB);

/**
 * The same load in either unit, to 100 g, the key for reps at a load: 60 kg
 * and 132.3 lb are one load, as a plate or pin stack would mark them.
 * @param {Load} load
 */
const loadKey = (load) => Math.round(inKg(load) * 10);

/**
 * Neither a warm-up nor a drop set (GLOSSARY: Working set).
 * @param {WorkoutSet} set
 */
const working = (set) => !set.warmUp && !set.drop;

/**
 * A set's measure (#19): its load and count, with nothing else.
 * @param {WorkoutSet} set
 * @returns {Measure}
 */
function measureOf({ load, unit, reps, seconds, distance, distanceUnit }) {
  return {
    load,
    unit,
    ...(reps === undefined ? {} : { reps }),
    ...(seconds === undefined ? {} : { seconds }),
    ...(distance === undefined ? {} : { distance, distanceUnit }),
  };
}

/**
 * A set's measure as the next set starts from it: no unit, since the screen
 * shows the exercise's.
 * @param {WorkoutSet} set
 */
function inputOf(set) {
  // eslint-disable-next-line no-unused-vars -- left out on purpose
  const { unit, ...input } = measureOf(set);
  return input;
}

/**
 * A working set and the load its heaviest record and e1RM count (#19): its
 * own load, or for bodyweight × reps the body weight on its workout's date
 * plus the added load, which is none without a body weight on record.
 * @typedef {{ set: WorkoutSet, recordLoad: Load | undefined }} Counted
 */

/**
 * Epley's estimated one-rep max (spec #3, Rules), in kg to compare: for sets
 * of 1 to 12 reps with a load. Callers check the exercise type has an e1RM.
 * @param {Counted} counted
 * @returns {number | undefined}
 */
function e1rmKg({ set, recordLoad }) {
  const reps = set.reps ?? 0;
  if (!recordLoad || recordLoad.load <= 0 || reps < 1 || reps > 12)
    return undefined;
  return inKg(recordLoad) * (1 + reps / 30);
}

/**
 * Records from counted working sets (spec #3, Rules; #19): the heaviest
 * load, or for assisted the least assist; the best e1RM, in its set's unit;
 * and the most reps at each of the sets' own loads (the added load, or the
 * assist), heaviest first. None for timed holds or cardio.
 * @param {Counted[]} counted
 * @param {ExerciseType} type
 */
function recordsOf(counted, type) {
  /** @type {Load | undefined} */
  let heaviest;
  /** @type {Load | undefined} */
  let leastAssist;
  /** @type {{ set: WorkoutSet, kg: number } | undefined} */
  let best;
  /** @type {Map<number, Load & { reps: number }>} */
  const atLoad = new Map();
  const rules = TYPE_RULES[type];
  for (const c of rules.records ? counted : []) {
    const { set, recordLoad } = c;
    if (rules.harder === "lighter") {
      if (!leastAssist || inKg(set) < inKg(leastAssist))
        leastAssist = { load: set.load, unit: set.unit };
    } else if (recordLoad && (!heaviest || inKg(recordLoad) > inKg(heaviest)))
      heaviest = recordLoad;
    const kg = rules.e1rm ? e1rmKg(c) : undefined;
    if (kg !== undefined && (!best || kg > best.kg)) best = { set, kg };
    if (set.reps === undefined) continue;
    const key = loadKey(set);
    if ((atLoad.get(key)?.reps ?? 0) < set.reps)
      atLoad.set(key, { load: set.load, unit: set.unit, reps: set.reps });
  }
  const repsAtLoad = [...atLoad.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, r]) => r);
  return {
    ...(heaviest && { heaviest }),
    ...(leastAssist && { leastAssist }),
    ...(best && {
      bestE1rm: { set: best.set, value: fromKg(best.kg, best.set.unit) },
    }),
    repsAtLoad,
  };
}

/**
 * Rows as CSV (RFC 4180, #22): a field with a comma, quote or line break is
 * quoted, quotes doubled; a missing value is empty; lines end in CRLF. Text
 * starting like a formula (=, +, -, @) gets a leading ' so a spreadsheet
 * shows it rather than runs it, and a byte-order mark tells Excel it's
 * UTF-8, so names like "Farmer's Carry ×2" read right.
 * @param {(string | number | undefined)[][]} rows
 */
function csv(rows) {
  /** @param {string | number | undefined} value */
  const field = (value) => {
    const text =
      value === undefined
        ? ""
        : typeof value === "string" && /^[=+\-@\t\r]/.test(value)
          ? `'${value}`
          : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  return (
    "\uFEFF" + rows.map((row) => row.map(field).join(",")).join("\r\n") + "\r\n"
  );
}

/**
 * The Forge core: every phase 1 rule, with no DOM or Firestore inside.
 * @param {{ store: Store, library: Exercise[], now?: () => Date }} deps
 *   `now` is the clock; tests pass a fixed one.
 */
export function createForge({ store, library, now = () => new Date() }) {
  // Changes that read a document and write it back run one at a time:
  // Firestore reads wait for the server, so two quick ticks would otherwise
  // both start from the old list and the second would erase the first.
  let lastChange = Promise.resolve();
  /**
   * @template T
   * @param {() => Promise<T>} change
   * @returns {Promise<T>}
   */
  function inTurn(change) {
    const run = lastChange.then(change);
    lastChange = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  return {
    searchExercises,

    getExercise: findExercise,

    /**
     * Creates or edits a custom exercise (#21): a name no other exercise
     * has, at least one primary muscle group, and a body half for its
     * default increment. Its type is fixed once made, since its sets are
     * measured by it (#19).
     * @param {ExerciseDraft} draft
     * @returns {Promise<Exercise>}
     */
    saveCustomExercise(draft) {
      return inTurn(async () => {
        const name = draft.name.trim();
        if (!name) throw new Error("Give the exercise a name");
        const clash = [
          ...library,
          .../** @type {Exercise[]} */ (await store.list("customExercises")),
        ].find(
          (e) =>
            e.id !== draft.id && e.name.toLowerCase() === name.toLowerCase(),
        );
        if (clash) throw new Error(`${clash.name} is already an exercise`);
        if (!draft.primary.length)
          throw new Error("Pick at least one primary muscle group");
        const saved =
          draft.id === undefined
            ? undefined
            : /** @type {Exercise | undefined} */ (
                await store.get("customExercises", draft.id)
              );
        /** @type {Exercise} */
        const exercise = {
          id: saved?.id ?? `custom-${crypto.randomUUID()}`,
          name,
          type: saved?.type ?? draft.type,
          primary: draft.primary,
          secondary: draft.secondary.filter((m) => !draft.primary.includes(m)),
          body: draft.body,
          custom: true,
        };
        await store.put("customExercises", exercise);
        return exercise;
      });
    },

    exerciseSettings,

    /**
     * The default increment for a body half in a unit (#21), so an editor
     * can show it as the unit or body half changes.
     */
    defaultIncrement,

    /**
     * Changes an exercise's settings (#21): any of its unit, increment,
     * rest default and pinned note. An increment equal to the unit's
     * default isn't kept, so it follows a later change of unit; a blank
     * note removes it.
     * @param {string} exerciseId
     * @param {Partial<ExerciseSettings>} changes
     */
    saveExerciseSettings(exerciseId, changes) {
      return inTurn(async () => {
        const { unit, increment, rest, note } = changes;
        if (unit !== undefined && unit !== "lb" && unit !== "kg")
          throw new Error("Pick lb or kg");
        if (increment !== undefined && !(increment > 0))
          throw new Error("The increment must be more than 0");
        if (
          rest !== undefined &&
          rest !== "off" &&
          !(Number.isInteger(rest) && rest >= REST_MIN && rest <= REST_MAX)
        )
          throw new Error("Rest is 5 s to 15 min, or Off");
        const saved = (await store.get("exerciseSettings", exerciseId)) ?? {
          id: exerciseId,
        };
        const next = { ...saved, ...changes };
        if (note !== undefined) next.note = note.trim();
        if (!next.note) delete next.note;
        const body = (await findExercise(exerciseId))?.body;
        if (next.increment === defaultIncrement(body, next.unit ?? "lb"))
          delete next.increment;
        await store.put("exerciseSettings", next);
      });
    },

    exerciseType: typeOf,

    /**
     * The exercise picker: the gym's exercises, searched and filtered like
     * the library (spec #3, story 7). The whole library with `showAll`
     * (story 10), with no gym, or once the gym is gone (deleted on another
     * device, say).
     * @param {ExerciseFilter & { gymId?: string, showAll?: boolean }} filter
     * @returns {Promise<Exercise[]>}
     */
    async pickExercises({ gymId, showAll = false, ...filter }) {
      const found = await searchExercises(filter);
      const gym = gymId === undefined ? undefined : await findGym(gymId);
      if (showAll || !gym) return found;
      const here = new Set(gym.exerciseIds);
      return found.filter((e) => here.has(e.id));
    },

    listGyms,

    getGym: findGym,

    /**
     * A new gym, with no exercises yet (spec #3, story 6).
     * @param {string} name
     * @returns {Promise<Gym>}
     */
    async createGym(name) {
      const gym = {
        id: crypto.randomUUID(),
        name: gymName(name),
        exerciseIds: [],
      };
      await store.put("gyms", gym);
      return gym;
    },

    /**
     * @param {string} gymId
     * @param {string} name
     * @returns {Promise<Gym>} the gym as saved
     */
    renameGym(gymId, name) {
      return inTurn(async () => {
        const gym = { ...(await gymById(gymId)), name: gymName(name) };
        await store.put("gyms", gym);
        return gym;
      });
    },

    /**
     * Ticks or unticks an exercise as available at a gym (spec #3, story 7).
     * @param {string} gymId
     * @param {string} exerciseId
     * @param {boolean} available
     */
    setExerciseAtGym(gymId, exerciseId, available) {
      return inTurn(async () => {
        const gym = await gymById(gymId);
        const others = gym.exerciseIds.filter((id) => id !== exerciseId);
        await store.put("gyms", {
          ...gym,
          exerciseIds: available ? [...others, exerciseId] : others,
        });
      });
    },

    /**
     * If it was the current gym, currentGym falls back to the first one left.
     * @param {string} gymId
     */
    deleteGym(gymId) {
      return inTurn(() => store.remove("gyms", gymId));
    },

    /**
     * Makes a gym the current one, remembered as the last used (spec #3,
     * story 8).
     * @param {string} gymId
     */
    chooseGym(gymId) {
      return inTurn(async () => {
        await store.put("settings", {
          ...(await settings()),
          lastGymId: gymId,
        });
      });
    },

    /**
     * Starts a workout at a gym: freestyle (spec #3, story 24), or from a
     * routine `day` (story 23) with its slots laid out as the workout's
     * exercises, at the routine's current version. Dated today, or a past
     * `date` to log a workout afterwards (story 55), which then counts by
     * that date.
     * @param {string} gymId
     * @param {{ day?: RoutineDayRef, date?: string }} [options]
     * @returns {Promise<Workout>}
     */
    startWorkout(gymId, { day, date } = {}) {
      return inTurn(async () => {
        await finishIfAbandoned();
        if (await workoutInProgress())
          throw new Error("A workout is already in progress");
        const started = now();
        /** @type {Workout} */
        const workout = {
          id: crypto.randomUUID(),
          date: date === undefined ? localDate(started) : checkPastDate(date),
          startedAt: started.toISOString(),
          gymId,
          entries: [],
        };
        if (day) {
          const version = currentVersion(await routineById(day.routineId));
          const routineDay = version?.days.find((d) => d.id === day.dayId);
          if (!version || !routineDay)
            throw new Error("That routine day is gone");
          workout.routine = {
            routineId: day.routineId,
            version: version.number,
            dayId: routineDay.id,
          };
          workout.entries = routineDay.slots.map((slot) => ({
            exerciseId: slot.exerciseId,
            sets: [],
          }));
          // The day's planned pairs (#17), each with an id of its own.
          const supersets = plannedPairs(routineDay.slots).map(
            (exerciseIds) => ({ id: crypto.randomUUID(), exerciseIds }),
          );
          if (supersets.length) workout.supersets = supersets;
        }
        await store.put("workouts", workout);
        // Its gym is now the one last trained at (story 8).
        await store.put("settings", {
          ...(await settings()),
          workoutInProgress: workout.id,
          lastGymId: gymId,
        });
        return workout;
      });
    },

    /**
     * The workout in progress, once any abandoned one is finished (#45), so
     * it never reopens.
     * @returns {Promise<Workout | undefined>}
     */
    currentWorkout() {
      return inTurn(async () => {
        await finishIfAbandoned();
        return workoutInProgress();
      });
    },

    /**
     * @param {string} workoutId
     * @returns {Promise<Workout | undefined>}
     */
    async getWorkout(workoutId) {
      return /** @type {Workout | undefined} */ (
        await store.get("workouts", workoutId)
      );
    },

    /**
     * Finishes the workout (spec #3, story 42): it's no longer in progress.
     * One with nothing logged is discarded (the maintainer's choice, #11).
     * @param {string} workoutId
     * @returns {Promise<Workout | undefined>} the finished workout, or
     *   undefined if it was discarded
     */
    finishWorkout(workoutId, { saveToRoutine = false } = {}) {
      return inTurn(async () => {
        const workout = await workoutById(workoutId);
        if (workout.finishedAt) return workout; // a second tap on Finish
        if (saveToRoutine) await saveDayAsDone(workout);
        return finish(workout, now());
      });
    },

    currentVersion,

    newSlot,

    /**
     * Adds a body weight entry (spec #3, story 56): any date up to today.
     * @param {Omit<BodyWeightEntry, "id" | "loggedAt">} entry
     * @returns {Promise<BodyWeightEntry>}
     */
    async addBodyWeight(entry) {
      /** @type {BodyWeightEntry} */
      const added = {
        id: crypto.randomUUID(),
        ...checkBodyWeight(entry),
        loggedAt: now().toISOString(),
      };
      await store.put("bodyWeights", added);
      return added;
    },

    /**
     * Corrects a body weight entry (#18), keeping when it was logged, so it
     * keeps its place among entries on one date.
     * @param {string} id
     * @param {Omit<BodyWeightEntry, "id" | "loggedAt">} entry
     * @returns {Promise<BodyWeightEntry>}
     */
    async updateBodyWeight(id, entry) {
      const saved = /** @type {BodyWeightEntry | undefined} */ (
        await store.get("bodyWeights", id)
      );
      if (!saved) throw new Error("Body weight entry not found");
      const updated = { ...saved, ...checkBodyWeight(entry) };
      await store.put("bodyWeights", updated);
      return updated;
    },

    /**
     * Deletes a body weight entry (#18).
     * @param {string} id
     */
    async deleteBodyWeight(id) {
      await store.remove("bodyWeights", id);
    },

    listBodyWeights,

    /**
     * Today's date where the user is, YYYY-MM-DD, by the core's clock: the
     * default and latest date a screen offers (#18).
     */
    today() {
      return localDate(now());
    },

    /**
     * The body weight on a date (spec #3, story 57): the latest entry on or
     * before it, for bodyweight exercises' load (#19); none before the
     * first entry.
     * @param {string} date YYYY-MM-DD
     * @returns {Promise<BodyWeightEntry | undefined>}
     */
    async bodyWeightOn(date) {
      return (await listBodyWeights()).find((e) => e.date <= date);
    },

    /**
     * Every workout, newest first by workout date (spec #3, story 53), the
     * one in progress included.
     * @returns {Promise<Workout[]>}
     */
    listWorkouts,

    /**
     * Whether a workout was logged afterwards for an earlier date (#20):
     * dated before the day it was started.
     * @param {Workout} workout
     */
    isBackDated(workout) {
      return workout.date < localDate(new Date(workout.startedAt));
    },

    /**
     * The exercises of a workout that have sets, as a past workout shows
     * them (#20): what finishing keeps.
     * @param {Workout} workout
     */
    exercisesDone(workout) {
      return workout.entries.filter((e) => e.sets.length > 0);
    },

    /**
     * Corrects a set of any workout, finished or not (spec #3, story 54),
     * with the same checks as logging it; it keeps when it was logged.
     * @param {SetRef} ref
     * @param {SetInput} set
     */
    async editSet({ workoutId, exerciseId, index }, set) {
      const type = await typeOf(exerciseId);
      return changeWorkout(workoutId, (w) =>
        changeEntry(w, exerciseId, (e) => {
          const old = e.sets[index];
          if (!old) throw new Error("No such set");
          const sets = [...e.sets];
          sets[index] = checkSet(set, old.loggedAt, type, old.unit);
          return { ...e, sets };
        }),
      );
    },

    /**
     * Deletes a set of any workout (spec #3, story 54). A finished workout
     * keeps only exercises with sets, as finishing would, and goes
     * altogether with its last set, as finishing an empty one does (#11).
     * @param {SetRef} ref
     * @returns {Promise<Workout | undefined>} the workout, or undefined if
     *   it went
     */
    deleteSet({ workoutId, exerciseId, index }) {
      return inTurn(async () => {
        const w = await workoutById(workoutId);
        const changed = changeEntry(w, exerciseId, (e) => {
          if (!e.sets[index]) throw new Error("No such set");
          return { ...e, sets: e.sets.filter((_, i) => i !== index) };
        });
        if (!w.finishedAt) {
          await store.put("workouts", changed);
          return changed;
        }
        const kept = {
          ...changed,
          entries: changed.entries.filter((e) => e.sets.length > 0),
        };
        if (kept.entries.length) {
          await store.put("workouts", kept);
          return kept;
        }
        await removeWorkout(workoutId);
        return undefined;
      });
    },

    /**
     * Deletes a workout (spec #3, story 54). The one in progress can go
     * too, so another can start.
     * @param {string} workoutId
     */
    deleteWorkout(workoutId) {
      return inTurn(() => removeWorkout(workoutId));
    },

    /**
     * Routines by name (#14).
     * @returns {Promise<Routine[]>}
     */
    async listRoutines() {
      const routines = /** @type {Routine[]} */ (await store.list("routines"));
      return routines.sort((a, b) => a.name.localeCompare(b.name));
    },

    /**
     * A routine with all its versions (#14).
     * @param {string} routineId
     * @returns {Promise<Routine | undefined>}
     */
    async getRoutine(routineId) {
      return /** @type {Routine | undefined} */ (
        await store.get("routines", routineId)
      );
    },

    /**
     * Saves a routine (spec #3, stories 18-21): a new one at version 1, or a
     * new version of an existing one when its days changed, keeping every
     * earlier version as it was. A rename alone adds no version.
     * @param {{ id?: string, name: string, days: RoutineDayDraft[] }} routine
     * @returns {Promise<Routine>}
     */
    saveRoutine({ id, name, days }) {
      return inTurn(async () => {
        const trimmed = name.trim();
        if (!trimmed) throw new Error("Give the routine a name");
        const checked = await checkDays(days);
        const existing = id === undefined ? undefined : await routineById(id);
        return saveVersion(
          {
            id: existing?.id ?? crypto.randomUUID(),
            name: trimmed,
            versions: existing?.versions ?? [],
          },
          checked,
        );
      });
    },

    /**
     * The routine day that comes next (spec #3, Rules; story 22): the day
     * of the current version after the one done most recently, wrapping
     * around; the first day before any is done. Days keep their ids across
     * versions, so saving a change doesn't restart the rotation; a day since
     * removed is passed over.
     * @param {string} routineId
     * @returns {Promise<RoutineDay | undefined>}
     */
    async nextRoutineDay(routineId) {
      const version = currentVersion(await routineById(routineId));
      if (!version?.days.length) return undefined;
      const ids = version.days.map((d) => d.id);
      const workouts = /** @type {Workout[]} */ (await store.list("workouts"));
      const last = workouts
        .filter(
          (w) =>
            w.routine?.routineId === routineId && ids.includes(w.routine.dayId),
        )
        .sort(byWorkoutDate)[0];
      const index = ids.indexOf(last?.routine?.dayId ?? "");
      return version.days[(index + 1) % version.days.length];
    },

    /**
     * What a workout is called (#14): its routine day's name, or Freestyle.
     * @param {Workout} workout
     */
    async workoutTitle(workout) {
      return (await followedDay(workout))?.name ?? "Freestyle";
    },

    /**
     * The exercise's targets in a routine workout (spec #3, story 23), from
     * the version it followed; none for an exercise added on the day.
     * @param {Workout} workout
     * @param {string} exerciseId
     * @returns {Promise<Omit<Slot, "exerciseId"> | undefined>}
     */
    async targets(workout, exerciseId) {
      const slot = await followedSlot(workout, exerciseId);
      if (!slot) return undefined;
      const { sets, repMin, repMax, rir } = slot;
      return { sets, repMin, repMax, ...withRir(rir) };
    },

    /**
     * Whether a routine workout's exercises differ from its routine day as
     * the routine now stands: one added, skipped or moved (spec #3, stories
     * 34-35), so finishing can offer to save them. Nothing to save once the
     * day is gone from the routine.
     * @param {Workout | undefined} workout
     */
    async routineChanges(workout) {
      const day = workout && (await dayNow(workout));
      if (!workout || !day) return false;
      // A swap is for this workout only (#16): it reads as its slot.
      const live = workout.entries.filter((e) => !e.skipped).map(slotOf);
      // A pair made or broken counts too (#17): each exercise's partners.
      /** @param {string[][]} groups */
      const partners = (groups) =>
        JSON.stringify(
          live.map((id) =>
            [...(groups.find((g) => g.includes(id)) ?? [])].sort().join(),
          ),
        );
      const planned = plannedPairs(day.slots);
      return (
        JSON.stringify(day.slots.map((s) => s.exerciseId)) !==
          JSON.stringify(live) ||
        partners(planned) !==
          partners(
            (workout.supersets ?? []).map((s) =>
              s.exerciseIds.map((id) => slotIdOf(workout, id)),
            ),
          )
      );
    },

    supersetOf,

    atGym,

    swapCandidates,

    /**
     * The swaps to offer for an exercise, if any (spec #3, story 36; #16):
     * for a routine slot whose exercise isn't at the gym, or one already
     * swapped (to change your mind), before its first set. `swappedFor` is
     * the slot's exercise once swapped.
     * @param {Workout} workout
     * @param {string} exerciseId
     * @returns {Promise<{ candidates: string[], swappedFor?: string } | undefined>}
     */
    async swapOffer(workout, exerciseId) {
      const entry = workout.entries.find((e) => e.exerciseId === exerciseId);
      if (
        !entry ||
        entry.sets.length ||
        !(await followedSlot(workout, exerciseId))
      )
        return undefined;
      if (!entry.swappedFor && (await atGym(workout, exerciseId)))
        return undefined;
      return {
        candidates: await swapCandidates(workout, slotOf(entry)),
        ...(entry.swappedFor ? { swappedFor: entry.swappedFor } : {}),
      };
    },

    /**
     * Swaps an exercise in the workout for another (#16; spec #3, story
     * 26): for this workout only, keeping the slot's targets and place, and
     * any superset. The one swapped in is logged as itself. Before its
     * first set, so no set is logged under the wrong exercise.
     * @param {string} workoutId
     * @param {string} exerciseId
     * @param {string} replacementId
     */
    swapExercise(workoutId, exerciseId, replacementId) {
      return changeWorkout(workoutId, (w) => {
        if (inPlay(w, exerciseId).sets.length)
          throw new Error("Swap before logging a set");
        if (w.entries.some((e) => e.exerciseId === replacementId))
          throw new Error("That exercise is in the workout already");
        return {
          ...changeEntry(w, exerciseId, (e) => ({
            exerciseId: replacementId,
            swappedFor: e.swappedFor ?? exerciseId,
            sets: [],
          })),
          ...(w.supersets && {
            supersets: w.supersets.map((s) => ({
              ...s,
              exerciseIds: s.exerciseIds.map((id) =>
                id === exerciseId ? replacementId : id,
              ),
            })),
          }),
        };
      });
    },

    /**
     * The exercises a set of `exerciseId` can be supersetted with (#17):
     * the others in the workout, not skipped and not already in its
     * superset.
     * @param {Workout} workout
     * @param {string} exerciseId
     */
    partnersFor(workout, exerciseId) {
      const members = supersetOf(workout, exerciseId) ?? [exerciseId];
      return workout.entries
        .filter((e) => !e.skipped && !members.includes(e.exerciseId))
        .map((e) => e.exerciseId);
    },

    /**
     * Pairs a routine day's slot with the next as a planned superset, or
     * splits them (#17), returning the slots: a group is a run of slots
     * named by its first one's exercise, so splitting a run of three in the
     * middle leaves the first alone and the rest a group of their own.
     * @param {Slot[]} slots
     * @param {number} i
     * @param {boolean} paired
     * @returns {Slot[]}
     */
    pairWithNext(slots, i, paired) {
      const next = slots[i + 1];
      if (!next) return slots;
      const runs = slots.map((s) => s.superset);
      if (paired) {
        const group = runs[i] ?? slots[i].exerciseId;
        const old = runs[i + 1];
        runs[i] = group;
        // The next slot joins, bringing any run it was in.
        for (let j = i + 1; j < slots.length; j++) {
          if (j > i + 1 && (old === undefined || runs[j] !== old)) break;
          runs[j] = group;
        }
      } else {
        const old = runs[i];
        for (let j = i + 1; j < slots.length && runs[j] === old; j++)
          runs[j] = slots[i + 1].exerciseId;
      }
      // Named by their first slot's exercise; a group of one is no group.
      return slots.map((s, j) => {
        // eslint-disable-next-line no-unused-vars -- set again just below
        const { superset, ...slot } = s;
        const group = runs[j];
        const members = slots.filter((_, k) => runs[k] === group);
        return group !== undefined && members.length > 1
          ? { ...slot, superset: groupName(members.map((m) => m.exerciseId)) }
          : slot;
      });
    },

    /**
     * The exercise whose set an undo on `exerciseId`'s screen takes back
     * (#17): in a superset, the members' most recent set, so undoing just
     * after moving to the partner takes back the set just logged.
     * @param {Workout} workout
     * @param {string} exerciseId
     */
    undoTarget(workout, exerciseId) {
      let latest = { exerciseId, at: "" };
      for (const id of supersetOf(workout, exerciseId) ?? [exerciseId]) {
        const at =
          workout.entries.find((e) => e.exerciseId === id)?.sets.at(-1)
            ?.loggedAt ?? "";
        if (at > latest.at) latest = { exerciseId: id, at };
      }
      return latest.exerciseId;
    },

    /**
     * Pairs an exercise with another in the workout (#17; spec #3, story
     * 62): the other joins the first's superset, or a new one, leaving any
     * superset it was in, so a third joining a pair makes a superset of
     * three (story 70). Changes only sets logged afterwards, and only this
     * workout.
     * @param {string} workoutId
     * @param {string} exerciseId
     * @param {string} partnerId
     */
    pairExercises(workoutId, exerciseId, partnerId) {
      return changeWorkout(workoutId, (w) => {
        inPlay(w, exerciseId);
        inPlay(w, partnerId);
        const others = withoutMember(w.supersets ?? [], partnerId);
        const mine = others.find((s) => s.exerciseIds.includes(exerciseId));
        /** @type {Superset[]} */
        const supersets = mine
          ? others.map((s) =>
              s === mine
                ? { ...s, exerciseIds: [...s.exerciseIds, partnerId] }
                : s,
            )
          : [
              ...others,
              { id: crypto.randomUUID(), exerciseIds: [exerciseId, partnerId] },
            ];
        return { ...w, supersets };
      });
    },

    /**
     * Takes an exercise out of its superset (#17); a pair left with one
     * member ends. Sets already logged keep their membership.
     * @param {string} workoutId
     * @param {string} exerciseId
     */
    unpairExercise(workoutId, exerciseId) {
      return changeWorkout(workoutId, (w) => ({
        ...w,
        supersets: withoutMember(w.supersets ?? [], exerciseId),
      }));
    },

    /**
     * The exercise to log next after a set of `exerciseId` (#17; spec #3,
     * Rules: next set to log): within a superset, the next member that
     * still has target sets left and hasn't done this round, in member
     * order; after the round's last set, the first member with sets left.
     * A member with none left drops out; alone, or outside a superset, it's
     * the same exercise.
     * @param {Workout} workout as logged
     * @param {string} exerciseId
     * @returns {Promise<string>}
     */
    async nextExercise(workout, exerciseId) {
      return (await roundAfter(workout, exerciseId)).next;
    },

    /**
     * Finishes the workout in progress if it was abandoned (#45): for when
     * the app opens or comes back to the foreground, on any screen.
     * @returns {Promise<boolean>} whether one was finished or discarded
     */
    finishAbandonedWorkout() {
      return inTurn(finishIfAbandoned);
    },

    /**
     * The workout last finished automatically (#45), to mention on the Log
     * tab until `dismissAutoFinished`, with how many calendar days ago it
     * was dated.
     * @returns {Promise<{ workout: Workout, daysAgo: number } | undefined>}
     */
    async autoFinished() {
      const { autoFinished: id } = await settings();
      if (id === undefined) return undefined;
      const workout = /** @type {Workout | undefined} */ (
        await store.get("workouts", id)
      );
      if (!workout) return undefined;
      const [year, month, day] = workout.date.split("-").map(Number);
      const today = now();
      const days =
        Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
        Date.UTC(year, month - 1, day);
      return { workout, daysAgo: Math.round(days / 86_400_000) };
    },

    /** The auto-finished workout has been mentioned (#45): once is enough. */
    dismissAutoFinished() {
      return inTurn(async () => {
        const changed = await settings();
        if (changed.autoFinished === undefined) return;
        delete changed.autoFinished;
        await store.put("settings", changed);
      });
    },

    /**
     * A workout's summary (spec #3, story 42): exercises with at least one
     * set, every set logged, and minutes from start to finish (or to now,
     * while in progress).
     * @param {Workout} workout
     */
    summarize(workout) {
      const done = workout.entries.filter((e) => e.sets.length > 0);
      const end = workout.finishedAt ? new Date(workout.finishedAt) : now();
      return {
        exercises: done.length,
        sets: done.reduce((n, e) => n + e.sets.length, 0),
        minutes: Math.round(
          (end.getTime() - new Date(workout.startedAt).getTime()) / 60_000,
        ),
      };
    },

    /**
     * Logs a set for an exercise in the workout (spec #3, stories 29–32),
     * measured as its exercise type needs (#19), with optional RIR and a
     * warm-up or drop-set flag, in the exercise's unit (#21).
     * @param {string} workoutId
     * @param {string} exerciseId
     * @param {SetInput} set
     */
    async logSet(workoutId, exerciseId, set) {
      const logged = checkSet(
        set,
        now().toISOString(),
        await typeOf(exerciseId),
        (await exerciseSettings(exerciseId)).unit,
      );
      return changeWorkout(workoutId, (w) => {
        inPlay(w, exerciseId);
        // Its superset and round, from how it was logged (#17): the round
        // under way, or the next once this exercise has done it. A warm-up
        // or drop set is outside the rotation.
        const group = groupOf(w, exerciseId);
        const membership = group &&
          working(logged) && { superset: nextRound(w, group, exerciseId) };
        return changeEntry(w, exerciseId, (e) => ({
          ...e,
          sets: [...e.sets, { ...logged, ...membership }],
        }));
      });
    },

    /**
     * Removes an exercise's most recent set, to fix a mistyped one before
     * full editing arrives (#42, #20).
     * @param {string} workoutId
     * @param {string} exerciseId
     */
    undoLastSet(workoutId, exerciseId) {
      return changeWorkout(workoutId, (w) => {
        if (!inPlay(w, exerciseId).sets.length)
          throw new Error("No set to undo");
        return changeEntry(w, exerciseId, (e) => ({
          ...e,
          sets: e.sets.slice(0, -1),
        }));
      });
    },

    /**
     * The exercise the logging screen opens on, never a skipped one: the one
     * asked for (a link to it) if it's in the workout, else the one with the
     * most recently logged set, so a reopened workout continues where it left
     * off (spec #3, story 43), else the first.
     * @param {Workout} workout
     * @param {string} [requested] an exercise id
     * @returns {string | undefined} its exercise id
     */
    exerciseToShow(workout, requested) {
      const live = workout.entries.filter((e) => !e.skipped);
      if (live.some((e) => e.exerciseId === requested)) return requested;
      let latest;
      for (const entry of live)
        for (const set of entry.sets)
          if (!latest || set.loggedAt > latest.loggedAt)
            latest = { exerciseId: entry.exerciseId, loggedAt: set.loggedAt };
      return latest?.exerciseId ?? live[0]?.exerciseId;
    },

    /**
     * The suggested weight for an exercise's working sets in `workout`
     * (spec #3, Rules; #15), worked out with no AI (ADR-0004); none without
     * history, or for an exercise type double progression doesn't cover.
     * @param {Workout} workout
     * @param {string} exerciseId
     * @returns {Promise<SuggestedWeight | undefined>}
     */
    async suggestedWeight(workout, exerciseId) {
      return (await progression(workout, exerciseId))?.suggested;
    },

    /**
     * Seconds to rest after a set of the exercise (spec #3, story 38; Rules:
     * rest after a set): its rest default (#21), or none when that's Off
     * (#52). In a superset (#17), none within a round, and after the
     * round's last set the longest rest default of the members that did the
     * round, an Off one counting as 0 s.
     * @param {string} exerciseId
     * @param {Workout} [workout] as logged, for a superset
     * @returns {Promise<number | undefined>}
     */
    async restAfterSet(exerciseId, workout) {
      const round = workout && (await roundAfter(workout, exerciseId));
      if (round && !round.complete) return undefined;
      const rests = await Promise.all(
        (round?.members ?? [exerciseId]).map(
          async (id) => (await exerciseSettings(id)).rest,
        ),
      );
      const longest = Math.max(...rests.map((r) => (r === "off" ? 0 : r)));
      return longest > 0 ? longest : undefined;
    },

    lastWorkout,

    /**
     * The last workout as the logging screen's line shows it (spec #3,
     * story 25): its date, its working sets (what to beat) and the last
     * one's RIR. No sets means it had only warm-ups or drop sets. Any
     * exercises it was supersetted with are its `partners` (#17).
     * @param {string} exerciseId
     * @param {string} [excluding] the workout in progress
     * @returns {Promise<{ date: string, sets: Measure[], rir?: number, partners?: string[] } | undefined>}
     */
    async lastWorkoutLine(exerciseId, excluding) {
      const last = await lastWorkout(exerciseId, excluding);
      if (!last) return undefined;
      const done = last.sets.filter(working);
      const rir = done.at(-1)?.rir;
      const ids = new Set(last.sets.map((s) => s.superset?.id));
      const partners = last.workout.entries
        .filter(
          (e) =>
            e.exerciseId !== exerciseId &&
            e.sets.some((s) => s.superset && ids.has(s.superset.id)),
        )
        .map((e) => e.exerciseId);
      return {
        date: last.workout.date,
        sets: done.map(measureOf),
        ...(rir === undefined ? {} : { rir }),
        ...(partners.length ? { partners } : {}),
      };
    },

    history,

    /**
     * The exercise's records (spec #3, Rules; #19), from its working sets.
     * @param {string} exerciseId
     */
    async records(exerciseId) {
      const type = await typeOf(exerciseId);
      const each = await counted(await history(exerciseId), type);
      return recordsOf(each.flat(), type);
    },

    /**
     * Each workout's best e1RM, oldest first (spec #3, story 51), for the
     * history chart and list: compared in kg and given in the unit of the
     * latest one, so a unit change doesn't put lb and kg on one axis.
     * @param {string} exerciseId
     * @returns {Promise<E1rmTrend>}
     */
    e1rmTrend: (exerciseId) => e1rmTrendOf(exerciseId),

    /**
     * The records the exercise's latest set in `workout` beats (spec #3,
     * story 40), for the celebration: none for a warm-up or drop set, and
     * none in the first workout with the exercise, where every better set
     * would otherwise count. After that, the workout's earlier sets count
     * too. Matching a record isn't beating it.
     * @param {Workout} workout
     * @param {string} exerciseId
     * @returns {Promise<RecordKind[]>}
     */
    async recordsSetBy(workout, exerciseId) {
      const sets = workout.entries.find(
        (e) => e.exerciseId === exerciseId,
      )?.sets;
      const latest = sets?.at(-1);
      if (!sets || !latest || !working(latest)) return [];
      const others = (await history(exerciseId)).filter(
        (h) => h.workout.id !== workout.id,
      );
      if (!others.some((h) => h.sets.some(working))) return [];
      const type = await typeOf(exerciseId);
      const [mine, ...earlier] = await counted(
        [{ workout, sets }, ...others],
        type,
      );
      const latestCounted = /** @type {Counted} */ (mine.at(-1));
      const before = recordsOf([...earlier.flat(), ...mine.slice(0, -1)], type);
      /** @type {RecordKind[]} */
      const beaten = [];
      const { recordLoad } = latestCounted;
      if (
        recordLoad &&
        before.heaviest &&
        inKg(recordLoad) > inKg(before.heaviest)
      )
        beaten.push("heaviest");
      if (before.leastAssist && inKg(latest) < inKg(before.leastAssist))
        beaten.push("least-assist");
      const estimate = TYPE_RULES[type].e1rm
        ? e1rmKg(latestCounted)
        : undefined;
      const bestBefore =
        before.bestE1rm &&
        inKg({ load: before.bestE1rm.value, unit: before.bestE1rm.set.unit });
      if (
        estimate !== undefined &&
        bestBefore !== undefined &&
        estimate > bestBefore
      )
        beaten.push("e1rm");
      const atLoad = before.repsAtLoad.find(
        (r) => loadKey(r) === loadKey(latest),
      );
      if (atLoad && (latest.reps ?? 0) > atLoad.reps) beaten.push("reps");
      return beaten;
    },

    /**
     * What the next set of an exercise starts filled in with: the previous
     * set's measure (spec #3, story 28). The first set starts from the
     * suggested weight and the bottom of the rep range; with no rep range,
     * or no suggestion (timed holds, cardio: #19), from the last workout's
     * first working set, at any comeback load (story 27, #15). Empty with no
     * history.
     * @param {Workout} workout
     * @param {string} exerciseId
     * @returns {Promise<Omit<Measure, "unit"> | undefined>}
     */
    async nextSet(workout, exerciseId) {
      const sets = workout.entries.find(
        (e) => e.exerciseId === exerciseId,
      )?.sets;
      const last = sets?.at(-1);
      if (last) return inputOf(last);
      const p = await progression(workout, exerciseId);
      if (p?.range) return { load: p.suggested.load, reps: p.range.repMin };
      const first = (await recentWork(workout, exerciseId)).recent[0]?.[0];
      if (!first) return undefined;
      const { unit, increment } = await exerciseSettings(exerciseId);
      return {
        ...inputOf(first),
        load: inUnit(first, unit, increment),
        ...(p?.suggested.reason === "comeback" && { load: p.suggested.load }),
      };
    },

    /**
     * Adds an exercise to the end of the workout (spec #3, story 34).
     * @param {string} workoutId
     * @param {string} exerciseId
     */
    addExercise(workoutId, exerciseId) {
      return changeWorkout(workoutId, (w) => {
        // Already here: bring it back if skipped, never list it twice.
        if (w.entries.some((e) => e.exerciseId === exerciseId))
          return changeEntry(w, exerciseId, (e) => ({
            exerciseId: e.exerciseId,
            sets: e.sets,
          }));
        return { ...w, entries: [...w.entries, { exerciseId, sets: [] }] };
      });
    },

    /**
     * The workout's optional note (spec #3, story 41); blank removes it.
     * @param {string} workoutId
     * @param {string} note
     */
    setWorkoutNote(workoutId, note) {
      return changeWorkout(workoutId, (w) => {
        /** @type {Workout} */
        const changed = { ...w, note: note.trim() };
        if (!changed.note) delete changed.note;
        return changed;
      });
    },

    /**
     * Moves an exercise to a new position in the workout (spec #3, story 34).
     * @param {string} workoutId
     * @param {string} exerciseId
     * @param {number} position 0-based; clamped to the list.
     */
    moveExercise(workoutId, exerciseId, position) {
      return changeWorkout(workoutId, (w) => {
        const moving = w.entries.find((e) => e.exerciseId === exerciseId);
        if (!moving) return w;
        const rest = w.entries.filter((e) => e !== moving);
        const at = Math.max(0, Math.min(position, rest.length));
        return {
          ...w,
          entries: [...rest.slice(0, at), moving, ...rest.slice(at)],
        };
      });
    },

    /**
     * Skips an exercise in this workout (spec #3, story 34); adding it again
     * brings it back.
     * @param {string} workoutId
     * @param {string} exerciseId
     */
    skipExercise(workoutId, exerciseId) {
      return changeWorkout(workoutId, (w) => ({
        ...changeEntry(w, exerciseId, (e) => ({ ...e, skipped: true })),
        // A skipped exercise leaves its superset (#17).
        supersets: withoutMember(w.supersets ?? [], exerciseId),
      }));
    },

    /**
     * All the user's data, as one JSON-ready object (#22; spec #3, story
     * 58): every gym, custom exercise, exercise setting, routine with all
     * its versions, workout and body weight entry, and the settings, for
     * their own backup.
     */
    async exportJson() {
      const [gyms, customExercises, exerciseSettings, routines] =
        await Promise.all([
          listGyms(),
          store.list("customExercises"),
          store.list("exerciseSettings"),
          store.list("routines"),
        ]);
      return {
        app: "Forge",
        exportedAt: now().toISOString(),
        gyms,
        customExercises,
        exerciseSettings,
        routines,
        workouts: await listWorkouts(),
        bodyWeights: await listBodyWeights(),
        settings: await settings(),
      };
    },

    /**
     * Every set as CSV, one row per set, oldest workout first (#22): its
     * workout's date and gym, the exercise, the set's number and measure,
     * RIR, flags, and its superset (numbered within the workout) and round.
     */
    async exportSetsCsv() {
      // Oldest first: listWorkouts gives newest first.
      const workouts = (await listWorkouts()).reverse();
      const gyms = new Map((await listGyms()).map((g) => [g.id, g.name]));
      /** @type {Map<string, string>} */
      const names = new Map();
      /** @param {string} id */
      const nameOf = async (id) => {
        if (!names.has(id)) names.set(id, (await findExercise(id))?.name ?? id);
        return /** @type {string} */ (names.get(id));
      };
      /**
       * One set and where it sits, for the columns to read.
       * @typedef {{ w: Workout, e: WorkoutEntry, s: WorkoutSet, n: number, superset: number | undefined, partners: string[], exercise: string, planned: string | undefined }} Row
       */
      /** @type {[string, (row: Row) => string | number | undefined][]} */
      const columns = [
        ["date", (r) => r.w.date],
        ["gym", (r) => gyms.get(r.w.gymId)],
        ["exercise", (r) => r.exercise],
        ["set", (r) => r.n],
        ["load", (r) => r.s.load],
        ["unit", (r) => r.s.unit],
        ["reps", (r) => r.s.reps],
        ["seconds", (r) => r.s.seconds],
        ["distance", (r) => r.s.distance],
        ["distance_unit", (r) => r.s.distanceUnit],
        ["rir", (r) => r.s.rir],
        ["warm_up", (r) => (r.s.warmUp ? "yes" : undefined)],
        ["drop_set", (r) => (r.s.drop ? "yes" : undefined)],
        ["superset", (r) => r.superset],
        ["round", (r) => r.s.superset?.round],
        ["superset_with", (r) => r.partners.join("; ") || undefined],
        ["swapped_for", (r) => r.planned],
        ["in_progress", (r) => (r.w.finishedAt ? undefined : "yes")],
      ];
      /** @type {(string | number | undefined)[][]} */
      const rows = [columns.map(([header]) => header)];
      for (const w of workouts) {
        // Supersets numbered within the workout, in the order first logged.
        /** @type {Map<string, number>} */
        const numbers = new Map();
        for (const e of w.entries)
          for (const [n, s] of e.sets.entries()) {
            const id = s.superset?.id;
            if (id !== undefined && !numbers.has(id))
              numbers.set(id, numbers.size + 1);
            // Its partners: the other exercises with sets in that superset.
            const partners = id
              ? await Promise.all(
                  w.entries
                    .filter(
                      (o) =>
                        o !== e && o.sets.some((x) => x.superset?.id === id),
                    )
                    .map((o) => nameOf(o.exerciseId)),
                )
              : [];
            /** @type {Row} */
            const row = {
              w,
              e,
              s,
              n: n + 1,
              superset: id === undefined ? undefined : numbers.get(id),
              partners,
              exercise: await nameOf(e.exerciseId),
              planned: e.swappedFor && (await nameOf(e.swappedFor)),
            };
            rows.push(columns.map(([, value]) => value(row)));
          }
      }
      return csv(rows);
    },

    /** Body weight entries as CSV, oldest first (#22). */
    async exportBodyWeightCsv() {
      // Oldest first: listBodyWeights gives newest first.
      const entries = (await listBodyWeights()).reverse();
      return csv([
        ["date", "weight", "unit"],
        ...entries.map((e) => [e.date, e.load, e.unit]),
      ]);
    },

    /**
     * The gym to preselect: the last one chosen, or the first gym until one
     * is; undefined when there are no gyms.
     * @returns {Promise<Gym | undefined>}
     */
    async currentGym() {
      const gyms = await listGyms();
      const { lastGymId } = await settings();
      return gyms.find((g) => g.id === lastGymId) ?? gyms[0];
    },

    /**
     * Remembers the Stats board's range or e1RM exercise (spec #80, stories
     * 4 and 13), in the settings, so the phone and the computer agree.
     * @param {{ range?: RangeId, exerciseId?: string }} choice
     */
    chooseDashboard({ range, exerciseId }) {
      return inTurn(async () => {
        await store.put("settings", {
          ...(await settings()),
          ...(range && { dashboardRange: range }),
          ...(exerciseId && { dashboardExerciseId: exerciseId }),
        });
      });
    },

    /**
     * Everything the Stats board draws (spec #80), for the range last
     * chosen.
     */
    async dashboard() {
      const { dashboardRange = DEFAULT_RANGE, dashboardExerciseId } =
        await settings();
      const range = rangeFor(dashboardRange, localDate(now()));
      // One read of the workouts for the whole board, so opening Stats
      // costs one Firestore query however many exercises there are.
      const workouts = await listWorkouts();
      const choices = await e1rmChoices(workouts);
      // The one chosen while it's still offered, else the most recent
      // (spec #80, Rules: Default exercise).
      const exerciseId =
        choices.find((id) => id === dashboardExerciseId) ?? choices[0];
      const counted = workouts.filter(countsIn(range));
      const exerciseOf = await exercisesIn(counted);
      return {
        range,
        e1rm:
          exerciseId === undefined
            ? undefined
            : await e1rmCard(exerciseId, countsIn(range), choices, workouts),
        hardSets: hardSetsCard(counted, exerciseOf),
      };
    },

    /**
     * The workouts behind a mark on the Stats board (#84; spec #80,
     * stories 51–52), over the range the mark was made in, so a reloaded
     * list stays the same. For now, a muscle group's hard-sets bar.
     * @param {Mark} mark
     */
    async workoutsBehind({ muscleGroup, range: rangeId }) {
      const range = rangeFor(rangeId, localDate(now()));
      const counted = (await listWorkouts()).filter(countsIn(range));
      return {
        range,
        ...hardSetsBehind(counted, await exercisesIn(counted), muscleGroup),
      };
    },
  };

  /**
   * The members of the exercise's superset in the workout, in member order;
   * none when it isn't in one (#17).
   * @param {Workout} workout
   * @param {string} exerciseId
   * @returns {string[] | undefined}
   */
  function supersetOf(workout, exerciseId) {
    return groupOf(workout, exerciseId)?.exerciseIds;
  }

  /**
   * The exercise's superset in the workout, if any (#17).
   * @param {Workout} workout
   * @param {string} exerciseId
   */
  function groupOf(workout, exerciseId) {
    return (workout.supersets ?? []).find((s) =>
      s.exerciseIds.includes(exerciseId),
    );
  }

  /**
   * The round a set of `exerciseId` joins (#17): the superset's latest
   * round, or the one after once this exercise has done it. One joining a
   * pair mid-workout joins the round under way.
   * @param {Workout} workout
   * @param {Superset} group
   * @param {string} exerciseId
   * @returns {SupersetRound}
   */
  function nextRound(workout, group, exerciseId) {
    const rounds = workout.entries.flatMap((e) =>
      e.sets
        .filter((s) => s.superset?.id === group.id)
        .map((s) => ({
          exerciseId: e.exerciseId,
          round: s.superset?.round ?? 0,
        })),
    );
    const latest = Math.max(0, ...rounds.map((r) => r.round));
    const done = rounds.some(
      (r) => r.exerciseId === exerciseId && r.round === latest,
    );
    return { id: group.id, round: latest === 0 || done ? latest + 1 : latest };
  }

  /**
   * A planned group's name in a routine (#17): its first exercise, so the
   * same pairs saved again compare equal and add no version.
   * @param {string[]} members exercise ids, in order
   */
  function groupName(members) {
    return members[0];
  }

  /**
   * A routine day's planned superset groups, as exercise ids in slot order
   * (#17); a group needs two slots.
   * @param {Slot[]} slots
   * @returns {string[][]}
   */
  function plannedPairs(slots) {
    /** @type {Map<string, string[]>} */
    const groups = new Map();
    for (const { superset, exerciseId } of slots)
      if (superset !== undefined)
        groups.set(superset, [...(groups.get(superset) ?? []), exerciseId]);
    return [...groups.values()].filter((ids) => ids.length > 1);
  }

  /**
   * Supersets without an exercise, dropping any left with one member (#17).
   * @param {Superset[]} supersets
   * @param {string} exerciseId
   */
  function withoutMember(supersets, exerciseId) {
    return supersets
      .map((s) => ({
        ...s,
        exerciseIds: s.exerciseIds.filter((id) => id !== exerciseId),
      }))
      .filter((s) => s.exerciseIds.length > 1);
  }

  /**
   * Where a superset's round stands after a set of `exerciseId` (#17; spec
   * #3, Rules): whether the round is complete, the members that did it, and
   * the exercise to log next. A member with target sets left is still in
   * the rotation; one without targets (freestyle) always is. Outside a
   * superset the round is that one set.
   * @param {Workout} workout as logged
   * @param {string} exerciseId
   */
  async function roundAfter(workout, exerciseId) {
    const entry = workout.entries.find((e) => e.exerciseId === exerciseId);
    const membership = entry?.sets.at(-1)?.superset;
    const group = (workout.supersets ?? []).find(
      (s) => s.id === membership?.id,
    );
    if (!membership || !group)
      return { complete: true, members: [exerciseId], next: exerciseId };
    const { round } = membership;
    /** @param {string} id */
    const setsOf = (id) =>
      workout.entries.find((e) => e.exerciseId === id)?.sets ?? [];
    // Targets count working sets, as progression does (#15).
    /** @param {string} id */
    const workingSets = (id) => setsOf(id).filter(working).length;
    /** @param {string} id */
    const didRound = (id) =>
      setsOf(id).some(
        (s) => s.superset?.id === group.id && s.superset.round === round,
      );
    const order = group.exerciseIds;
    // Target sets from the routine day it follows; none in freestyle.
    const targets = new Map(
      await Promise.all(
        order.map(
          async (id) =>
            /** @type {const} */ ([
              id,
              (await followedSlot(workout, id))?.sets,
            ]),
        ),
      ),
    );
    /** @param {string} id */
    const inRotation = (id) => {
      const target = targets.get(id);
      return target === undefined || workingSets(id) < target;
    };
    const after = [
      ...order.slice(order.indexOf(exerciseId) + 1),
      ...order.slice(0, order.indexOf(exerciseId)),
    ];
    const pending = after.find((id) => inRotation(id) && !didRound(id));
    if (pending) return { complete: false, members: [], next: pending };
    return {
      complete: true,
      members: order.filter(didRound),
      next: order.find(inRotation) ?? exerciseId,
    };
  }

  /**
   * The exercise's last workout (spec #3, Rules): the most recent finished
   * workout by workout date that has its sets, never `excluding` (the
   * current one). A back-dated workout counts by its date, not when it was
   * logged.
   * @param {string} exerciseId
   * @param {string} [excluding]
   * @returns {Promise<ExerciseInWorkout | undefined>}
   */
  async function lastWorkout(exerciseId, excluding) {
    return (await history(exerciseId)).find(
      (h) => h.workout.finishedAt && h.workout.id !== excluding,
    );
  }

  /**
   * An exercise's settings, with the defaults for any not set (#21): lb,
   * the body half's increment in that unit, and a 90 s rest. With no
   * exercise, the defaults a new one starts with.
   * @param {string} [exerciseId]
   * @returns {Promise<ExerciseSettings>}
   */
  async function exerciseSettings(exerciseId) {
    const saved =
      exerciseId === undefined
        ? undefined
        : /** @type {Partial<ExerciseSettings> | undefined} */ (
            await store.get("exerciseSettings", exerciseId)
          );
    const unit = saved?.unit ?? "lb";
    return {
      unit,
      increment:
        saved?.increment ??
        defaultIncrement(
          exerciseId === undefined
            ? undefined
            : (await findExercise(exerciseId))?.body,
          unit,
        ),
      rest: saved?.rest ?? REST_DEFAULT,
      ...(saved?.note ? { note: saved.note } : {}),
    };
  }

  /**
   * A load in another unit, to the nearest multiple of the increment, so
   * progression carries across a unit change (#21; spec #3: comparisons
   * convert to kg).
   * @param {Load} load
   * @param {Load["unit"]} unit
   * @param {number} increment
   */
  function inUnit(load, unit, increment) {
    if (load.unit === unit) return load.load;
    return Math.round(fromKg(inKg(load), unit) / increment) * increment;
  }

  /**
   * Double progression for an exercise in `workout` (spec #3, Rules; #15):
   * the suggested weight, the rep range it used, and the last workout's
   * working sets. A comeback after 14 or more days without the exercise
   * comes first. Dropping takes two short workouts in a row at the same
   * load, so one short workout after a drop holds rather than dropping
   * again. None without history, or for a type it doesn't cover.
   * @param {Workout} workout
   * @param {string} exerciseId
   */
  async function progression(workout, exerciseId) {
    const type = await typeOf(exerciseId);
    const { harder } = TYPE_RULES[type];
    if (!harder) return undefined;
    const { done, recent } = await recentWork(workout, exerciseId);
    const lastSets = recent[0];
    if (!lastSets) return undefined;
    const lastSet = /** @type {WorkoutSet} */ (lastSets.at(-1));
    const { unit, increment: step } = await exerciseSettings(exerciseId);
    const load = inUnit(lastSet, unit, step);
    // Across a unit change (#21), the comeback takes 90% of the exact load,
    // not of the load rounded to the new increment.
    const exact =
      lastSet.unit === unit ? lastSet.load : fromKg(inKg(lastSet), unit);
    const range = await repRange(workout, exerciseId);
    // Less assist is harder (spec #3, Rules: assisted progression).
    const up = harder === "lighter" ? -step : step;
    /** @param {WorkoutSet[] | undefined} sets */
    const short = (sets) =>
      !!range &&
      !!sets?.some((s) => (s.reps ?? 0) < range.repMin) &&
      loadKey(/** @type {WorkoutSet} */ (sets.at(-1))) === loadKey(lastSet);
    /** @type {SuggestedWeight} */
    let suggested = { load, unit, reason: "hold" };
    // A warm-up-only workout still did the exercise: the break counts from it.
    const comeback =
      daysBetween(done[0].workout.date, workout.date) >= COMEBACK_DAYS;
    if (comeback && harder === "lighter")
      // 90% of an assist would make it harder: one increment more (#19).
      suggested = { load: load + step, unit, reason: "comeback", by: step };
    else if (comeback)
      suggested = {
        // In whole percents, so 135 lb gives 121.5, not 121.49999.
        load: Math.floor((exact * COMEBACK_PERCENT) / 100 / step) * step,
        unit,
        reason: "comeback",
        percent: COMEBACK_PERCENT,
      };
    else if (range && lastSets.every((s) => (s.reps ?? 0) >= range.repMax))
      suggested = {
        load: Math.max(0, load + up),
        unit,
        reason: "up",
        by: step,
      };
    else if (short(recent[0]) && short(recent[1]))
      suggested = {
        load: Math.max(0, load - up),
        unit,
        reason: "down",
        by: step,
      };
    // No room to move (no assist left to take, no added load to drop): hold.
    if (suggested.reason !== "comeback" && suggested.load === load)
      suggested = { load, unit, reason: "hold" };
    return { suggested, range, lastSets };
  }

  /**
   * The exercise's finished workouts other than `workout`, newest first,
   * and the working sets of those that have any: what progression and the
   * first set read (#15, #19).
   * @param {Workout} workout
   * @param {string} exerciseId
   */
  async function recentWork(workout, exerciseId) {
    const done = (await history(exerciseId)).filter(
      (h) => h.workout.finishedAt && h.workout.id !== workout.id,
    );
    const recent = done
      .map((h) => h.sets.filter(working))
      .filter((sets) => sets.length > 0);
    return { done, recent };
  }

  /**
   * The exercise's working sets in each of `entries`, counted for records
   * (#19): a bodyweight set with the body weight on or before its workout's
   * date (spec #3, story 57) plus the added load.
   * @param {ExerciseInWorkout[]} entries
   * @param {ExerciseType} type
   * @returns {Promise<Counted[][]>}
   */
  async function counted(entries, type) {
    const { withBody } = TYPE_RULES[type];
    const weights = withBody ? await listBodyWeights() : [];
    return entries.map(({ workout, sets }) => {
      const body = weights.find((e) => e.date <= workout.date);
      return sets.filter(working).map((set) => ({
        set,
        recordLoad: !withBody
          ? { load: set.load, unit: set.unit }
          : body && plusBody(set, body),
      }));
    });
  }

  /**
   * An exercise's type; an unknown one (since deleted, say) counts as
   * weight × reps.
   * @param {string} exerciseId
   * @returns {Promise<ExerciseType>}
   */
  async function typeOf(exerciseId) {
    return (await findExercise(exerciseId))?.type ?? "weight-reps";
  }

  /**
   * The exercise's rep range for double progression (spec #3, Rules): its
   * slot in the routine day the workout follows; otherwise, as in
   * freestyle, its slot in the routine saved most recently that has it.
   * @param {Workout} workout
   * @param {string} exerciseId
   * @returns {Promise<{ repMin: number, repMax: number } | undefined>}
   */
  async function repRange(workout, exerciseId) {
    const followed = await followedSlot(workout, exerciseId);
    if (followed) return followed;
    const routines = /** @type {Routine[]} */ (await store.list("routines"));
    return routines
      .map((r) => currentVersion(r))
      .filter((v) => v !== undefined)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
      .flatMap((v) => v.days.flatMap((d) => d.slots))
      .find((s) => s.exerciseId === exerciseId);
  }

  /**
   * The exercise's slot in the routine day the workout followed, if any.
   * @param {Workout} workout
   * @param {string} exerciseId
   */
  async function followedSlot(workout, exerciseId) {
    const slotId = slotIdOf(workout, exerciseId);
    return (await followedDay(workout))?.slots.find(
      (s) => s.exerciseId === slotId,
    );
  }

  /**
   * The routine slot's exercise an entry stands for: the one it was
   * swapped for (#16), or itself.
   * @param {Workout} workout
   * @param {string} exerciseId
   */
  function slotIdOf(workout, exerciseId) {
    const entry = workout.entries.find((e) => e.exerciseId === exerciseId);
    return entry ? slotOf(entry) : exerciseId;
  }

  /**
   * The routine slot's exercise an entry stands for (#16).
   * @param {WorkoutEntry} entry
   */
  function slotOf(entry) {
    return entry.swappedFor ?? entry.exerciseId;
  }

  /**
   * Whether an exercise is at the workout's gym (#16): one that isn't is
   * marked, with swaps offered. Every exercise counts as here once the
   * gym is gone.
   * @param {Workout} workout
   * @param {string} exerciseId
   */
  async function atGym(workout, exerciseId) {
    const gym = await findGym(workout.gymId);
    return !gym || gym.exerciseIds.includes(exerciseId);
  }

  /**
   * The exercises a slot's exercise can be swapped for (spec #3, Rules:
   * swap candidates; #16): at the workout's gym, the same kind (strength,
   * timed hold or cardio), not already in the workout, sharing at least
   * one primary muscle group; most shared first, then by name.
   * @param {Workout} workout
   * @param {string} exerciseId
   * @returns {Promise<string[]>} exercise ids
   */
  async function swapCandidates(workout, exerciseId) {
    const target = await findExercise(exerciseId);
    const gym = await findGym(workout.gymId);
    if (!target || !gym) return [];
    const kind = TYPE_RULES[target.type].kind;
    // Not one in the workout already, nor the slot's own once swapped.
    const inWorkout = new Set(
      workout.entries.flatMap((e) => [e.exerciseId, slotOf(e)]),
    );
    /** @param {Exercise} e */
    const shared = (e) =>
      e.primary.filter((m) => target.primary.includes(m)).length;
    return (await searchExercises({}))
      .filter(
        (e) =>
          gym.exerciseIds.includes(e.id) &&
          !inWorkout.has(e.id) &&
          TYPE_RULES[e.type].kind === kind &&
          shared(e) > 0,
      )
      .sort((a, b) => shared(b) - shared(a) || a.name.localeCompare(b.name))
      .map((e) => e.id);
  }

  /**
   * A seeded or custom exercise.
   * @param {string} exerciseId
   * @returns {Promise<Exercise | undefined>}
   */
  async function findExercise(exerciseId) {
    return (
      library.find((e) => e.id === exerciseId) ??
      /** @type {Exercise | undefined} */ (
        await store.get("customExercises", exerciseId)
      )
    );
  }

  /**
   * Calendar days from one date to a later one, both YYYY-MM-DD.
   * @param {string} from
   * @param {string} to
   */
  function daysBetween(from, to) {
    const utc = (/** @type {string} */ date) => {
      const [year, month, day] = date.split("-").map(Number);
      return Date.UTC(year, month - 1, day);
    };
    return Math.round((utc(to) - utc(from)) / DAY);
  }

  /**
   * Every workout, newest first by workout date (spec #3, story 53), the
   * one in progress included.
   * @returns {Promise<Workout[]>}
   */
  async function listWorkouts() {
    const workouts = /** @type {Workout[]} */ (await store.list("workouts"));
    return workouts.sort(byWorkoutDate);
  }

  /**
   * Body weight entries, newest first by date, then by when logged (#18).
   * @returns {Promise<BodyWeightEntry[]>}
   */
  async function listBodyWeights() {
    const entries = /** @type {BodyWeightEntry[]} */ (
      await store.list("bodyWeights")
    );
    return entries.sort(
      (a, b) =>
        b.date.localeCompare(a.date) || b.loggedAt.localeCompare(a.loggedAt),
    );
  }

  /**
   * A body weight entry that can be right (#18): a real date no later than
   * today, and a load above 0 and under 1,000 in lb or kg. The bound catches
   * a slipped decimal point (1816 for 181.6).
   * @param {Omit<BodyWeightEntry, "id" | "loggedAt">} entry
   */
  function checkBodyWeight({ date, load, unit }) {
    checkPastDate(date);
    if (!(load > 0 && load < 1000))
      throw new Error("Enter a weight above 0 and under 1,000");
    if (unit !== "lb" && unit !== "kg") throw new Error("Pick lb or kg");
    return { date, load, unit };
  }

  /**
   * Removes a workout, and any setting pointing at it: the workout in
   * progress, or the auto-finished one to mention (#20). Callers hold the
   * turn.
   * @param {string} workoutId
   */
  async function removeWorkout(workoutId) {
    await store.remove("workouts", workoutId);
    const changed = await settings();
    const pointers = /** @type {const} */ ([
      "workoutInProgress",
      "autoFinished",
    ]);
    const stale = pointers.filter((key) => changed[key] === workoutId);
    for (const key of stale) delete changed[key];
    if (stale.length) await store.put("settings", changed);
  }

  /**
   * A real calendar date no later than today (#18, #20): body weight and
   * back-dated workouts can't be in the future.
   * @param {string} date YYYY-MM-DD
   */
  function checkPastDate(date) {
    const [year, month, day] = date.split("-").map(Number);
    const parsed = new Date(year, month - 1, day);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      parsed.getMonth() !== month - 1 ||
      parsed.getDate() !== day
    )
      throw new Error("Pick a date");
    if (date > localDate(now()))
      throw new Error("That date hasn't happened yet");
    return date;
  }

  /**
   * A set checked and shaped for storing (spec #3, stories 29-32; #19): the
   * measure its exercise type needs (whole reps of 1 or more; whole seconds
   * for a hold; time and an optional distance for cardio), a load of 0 or
   * more, RIR 0-4, and not both a warm-up and a drop set. Loads are in lb
   * until per-exercise units arrive (#21).
   * @param {SetInput} set
   * @param {string} loggedAt
   * @param {ExerciseType} type
   * @param {Load["unit"]} [unit]
   * @returns {WorkoutSet}
   */
  function checkSet(set, loggedAt, type, unit = "lb") {
    const { reps, seconds, distance, rir, warmUp, drop } = set;
    const rules = TYPE_RULES[type];
    // A blank added load or assist is none: 0 is a real value for them (#19).
    const load = set.load ?? (rules.load === "needed" ? NaN : 0);
    /** @type {Partial<WorkoutSet>} */
    let measure;
    if (rules.measure === "seconds") {
      if (!(Number.isInteger(seconds) && Number(seconds) >= 1))
        throw new Error("Seconds must be 1 or more");
      measure = { seconds };
    } else if (rules.measure === "time-distance") {
      const time = Math.round(Number(seconds));
      if (!(time >= 1)) throw new Error("Time must be more than 0");
      measure = { seconds: time };
      if (distance !== undefined) {
        if (!(distance > 0)) throw new Error("Distance must be more than 0");
        const per = set.distanceUnit ?? distanceUnit(unit);
        if (per !== "mi" && per !== "km") throw new Error("Pick mi or km");
        measure = { ...measure, distance, distanceUnit: per };
      }
    } else {
      if (!(Number.isInteger(reps) && Number(reps) >= 1))
        throw new Error("Reps must be 1 or more");
      measure = { reps };
    }
    if (!(load >= 0)) throw new Error("Load must be 0 or more");
    if (rir !== undefined && !(Number.isInteger(rir) && rir >= 0 && rir <= 4))
      throw new Error("RIR is 0 to 4");
    if (!rules.effort && (rir !== undefined || drop))
      throw new Error("A timed hold or cardio set takes no RIR or drop set");
    if (warmUp && drop)
      throw new Error("A set is a warm-up or a drop set, not both");
    return {
      load: rules.load === "none" ? 0 : load,
      unit,
      ...measure,
      ...withRir(rir),
      ...(warmUp ? { warmUp: true } : {}),
      ...(drop ? { drop: true } : {}),
      loggedAt,
    };
  }

  /**
   * A bodyweight set's record load (#19): the body weight plus the added
   * load, in the set's unit, to 0.1 across units.
   * @param {WorkoutSet} set
   * @param {Load} body
   * @returns {Load}
   */
  function plusBody(set, body) {
    if (body.unit === set.unit)
      return { load: body.load + set.load, unit: set.unit };
    const total = fromKg(inKg(body) + inKg(set), set.unit);
    return { load: Math.round(total * 10) / 10, unit: set.unit };
  }

  /**
   * Newest first by workout date, then by start (#13, #20).
   * @param {Workout} a
   * @param {Workout} b
   */
  function byWorkoutDate(a, b) {
    return (
      b.date.localeCompare(a.date) || b.startedAt.localeCompare(a.startedAt)
    );
  }

  /**
   * @param {string} routineId
   * @returns {Promise<Routine>}
   */
  async function routineById(routineId) {
    const routine = /** @type {Routine | undefined} */ (
      await store.get("routines", routineId)
    );
    if (!routine) throw new Error("Routine not found");
    return routine;
  }

  /**
   * The routine's current version (#14): the one new workouts follow.
   * @param {Routine} routine
   * @returns {RoutineVersion | undefined}
   */
  function currentVersion(routine) {
    return routine.versions.at(-1);
  }

  /**
   * A slot for an exercise added to a routine day, until its targets are
   * set: 3 sets of 8-12 reps (#14).
   * @param {string} exerciseId
   * @param {number} [sets]
   * @returns {Slot}
   */
  function newSlot(exerciseId, sets = 3) {
    return { exerciseId, sets, repMin: 8, repMax: 12 };
  }

  /**
   * A target RIR as an optional field: absent rather than undefined, so a
   * routine compares equal when unchanged.
   * @param {number | undefined} rir
   */
  function withRir(rir) {
    return rir === undefined ? {} : { rir };
  }

  /**
   * The routine day a workout followed, at its version; none for freestyle
   * or a routine since deleted.
   * @param {Workout} workout
   */
  async function followedDay(workout) {
    if (!workout.routine) return undefined;
    const { routineId, version, dayId } = workout.routine;
    const routine = /** @type {Routine | undefined} */ (
      await store.get("routines", routineId)
    );
    return routine?.versions
      .find((v) => v.number === version)
      ?.days.find((d) => d.id === dayId);
  }

  /**
   * The workout's routine day as the routine now stands: the same day in the
   * current version, if it's still there.
   * @param {Workout} workout
   */
  async function dayNow(workout) {
    if (!workout.routine) return undefined;
    const { routineId, dayId } = workout.routine;
    const routine = /** @type {Routine | undefined} */ (
      await store.get("routines", routineId)
    );
    return routine && currentVersion(routine)?.days.find((d) => d.id === dayId);
  }

  /**
   * Checked days in a fixed shape, so an unchanged routine compares equal:
   * named days, each exercise once a day, targets that can be followed. A
   * problem names the day and exercise, since the editor shows many.
   * @param {RoutineDayDraft[]} days
   * @returns {Promise<RoutineDay[]>}
   */
  async function checkDays(days) {
    /** @type {Map<string, string>} */
    const names = new Map(library.map((e) => [e.id, e.name]));
    for (const e of await store.list("customExercises"))
      names.set(e.id, e.name);
    return days.map((day) => {
      const name = day.name.trim();
      if (!name) throw new Error("Each day needs a name");
      const seen = new Set();
      return {
        id: day.id ?? crypto.randomUUID(),
        name,
        slots: day.slots.map(
          ({ exerciseId, sets, repMin, repMax, rir, superset }) => {
            const exercise = names.get(exerciseId);
            if (!exercise) throw new Error(`${name}: unknown exercise`);
            if (seen.has(exerciseId))
              throw new Error(`${name}: ${exercise} appears twice`);
            seen.add(exerciseId);
            /** @param {string} problem */
            const refuse = (problem) =>
              new Error(`${name}, ${exercise}: ${problem}`);
            if (!(Number.isInteger(sets) && sets >= 1 && sets <= 20))
              throw refuse("target sets are 1 to 20");
            if (!(
              Number.isInteger(repMin) &&
              Number.isInteger(repMax) &&
              repMin >= 1 &&
              repMin <= repMax &&
              repMax <= 100
            ))
              throw refuse("the rep range runs from low to high, 1 to 100");
            if (
              rir !== undefined &&
              !(Number.isInteger(rir) && rir >= 0 && rir <= 4)
            )
              throw refuse("target RIR is 0 to 4");
            // A planned pair needs two slots of the day (#17).
            const paired =
              superset !== undefined &&
              day.slots.filter((s) => s.superset === superset).length > 1;
            return {
              exerciseId,
              sets,
              repMin,
              repMax,
              ...withRir(rir),
              ...(paired ? { superset } : {}),
            };
          },
        ),
      };
    });
  }

  /**
   * Stores the routine, adding a version when `days` differ from its latest
   * (spec #3, story 21). Callers hold the turn.
   * @param {Routine} routine
   * @param {RoutineDay[]} days
   */
  async function saveVersion(routine, days) {
    const latest = currentVersion(routine);
    /** @type {Routine} */
    const saved =
      latest && JSON.stringify(latest.days) === JSON.stringify(days)
        ? routine
        : {
            ...routine,
            versions: [
              ...routine.versions,
              {
                number: routine.versions.length + 1,
                savedAt: now().toISOString(),
                days,
              },
            ],
          };
    await store.put("routines", saved);
    return saved;
  }

  /**
   * Saves a workout's day as it was done (spec #3, story 35), onto the
   * routine as it now stands, so targets changed since the workout started
   * are kept: its exercises in order, each keeping its current targets, and
   * an added one targeting the working sets logged. Nothing once the day is
   * gone from the routine.
   * @param {Workout} workout
   */
  async function saveDayAsDone(workout) {
    const day = await dayNow(workout);
    if (!workout.routine || !day) return;
    const routine = await routineById(workout.routine.routineId);
    const version = currentVersion(routine);
    if (!version) return;
    const slots = workout.entries
      .filter((e) => !e.skipped)
      .map((e) => {
        // A swapped-in exercise saves as its slot: a swap is for this
        // workout only (#16).
        const slotId = slotOf(e);
        // eslint-disable-next-line no-unused-vars -- replaced just below
        const { superset: planned, ...slot } =
          day.slots.find((s) => s.exerciseId === slotId) ??
          newSlot(slotId, e.sets.filter(working).length || undefined);
        // The pairs as they stand now become the day's planned pairs (#17),
        // each named by its first exercise, so saving the same pairs again
        // adds no version.
        const members = supersetOf(workout, e.exerciseId);
        return members
          ? {
              ...slot,
              superset: groupName(members.map((id) => slotIdOf(workout, id))),
            }
          : slot;
      });
    await saveVersion(
      routine,
      version.days.map((d) => (d.id === day.id ? { ...d, slots } : d)),
    );
  }

  /**
   * Every workout with sets of the exercise, newest first by workout date
   * (spec #3, story 50), the one in progress included.
   * @param {string} exerciseId
   * @param {Workout[]} [workouts] every workout, if already read
   * @returns {Promise<ExerciseInWorkout[]>}
   */
  async function history(exerciseId, workouts) {
    const all =
      workouts ?? /** @type {Workout[]} */ (await store.list("workouts"));
    return all
      .map((workout) => ({
        workout,
        sets:
          workout.entries.find((e) => e.exerciseId === exerciseId)?.sets ?? [],
      }))
      .filter((h) => h.sets.length > 0)
      .sort((a, b) => byWorkoutDate(a.workout, b.workout));
  }

  /**
   * Each kept workout's best e1RM for the exercise, oldest first (spec #3,
   * story 51; spec #80): compared in kg and given in the unit of the latest
   * one, so a unit change doesn't put lb and kg on one axis.
   * @param {string} exerciseId
   * @param {(workout: Workout) => boolean} [keep] which workouts count
   * @param {Workout[]} [workouts] every workout, if already read
   * @returns {Promise<E1rmTrend>}
   */
  async function e1rmTrendOf(exerciseId, keep = () => true, workouts) {
    const type = await typeOf(exerciseId);
    if (!TYPE_RULES[type].e1rm) return { unit: "lb", points: [] };
    const entries = (await history(exerciseId, workouts)).filter((h) =>
      keep(h.workout),
    );
    const each = await counted(entries, type);
    const best = entries
      .map(({ workout }, i) => {
        const top = recordsOf(each[i], type).bestE1rm;
        return (
          top && {
            workout,
            kg: inKg({ ...top.set, load: top.value }),
            unit: top.set.unit,
          }
        );
      })
      .filter((b) => b !== undefined)
      .reverse();
    const unit = best.at(-1)?.unit ?? "lb";
    return {
      unit,
      points: best.map((b) => ({
        workoutId: b.workout.id,
        date: b.workout.date,
        value: fromKg(b.kg, unit),
      })),
    };
  }

  /**
   * The exercises the workouts have, looked up together, since a custom
   * exercise is a store read each.
   * @param {Workout[]} workouts
   * @returns {Promise<(exerciseId: string) => Exercise | undefined>}
   */
  async function exercisesIn(workouts) {
    const ids = new Set(
      workouts.flatMap((w) => w.entries.map((e) => e.exerciseId)),
    );
    const exercises = new Map(
      await Promise.all(
        [...ids].map(
          async (id) =>
            /** @type {[string, Exercise | undefined]} */ ([
              id,
              await findExercise(id),
            ]),
        ),
      ),
    );
    return (id) => exercises.get(id);
  }

  /**
   * The board's e1RM card for an exercise (spec #80): its trend over the
   * counted workouts and the headline above it.
   * @param {string} exerciseId
   * @param {(workout: Workout) => boolean} counts
   * @param {string[]} choices the exercises it offers
   * @param {Workout[]} workouts every workout
   */
  async function e1rmCard(exerciseId, counts, choices, workouts) {
    const trend = await e1rmTrendOf(exerciseId, counts, workouts);
    const named = await Promise.all(
      choices.map(async (id) => ({
        id,
        name: (await findExercise(id))?.name ?? id,
      })),
    );
    return {
      exerciseId,
      name: named.find((c) => c.id === exerciseId)?.name ?? exerciseId,
      ...trend,
      ...e1rmHeadline(trend.points),
      choices: named.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  /**
   * The exercises the board's e1RM card offers (spec #80, story 17): those
   * in the library with an e1RM in a finished workout. The first is the
   * default (Rules: Default exercise; story 12): the one whose latest e1RM
   * is in the most recent workout, and within it the one logged last.
   * @param {Workout[]} workouts every workout, newest first
   * @returns {Promise<string[]>}
   */
  async function e1rmChoices(workouts) {
    /** @param {Workout} w */
    const finished = (w) => Boolean(w.finishedAt);
    const done = new Set(
      workouts
        .filter(finished)
        .flatMap((w) => w.entries.map((e) => e.exerciseId)),
    );
    /** @type {{ id: string, order: number, loggedAt: string }[]} */
    const offered = [];
    for (const id of done) {
      if (!(await findExercise(id))) continue;
      const latest = (await e1rmTrendOf(id, finished, workouts)).points.at(-1);
      if (!latest) continue;
      const order = workouts.findIndex((w) => w.id === latest.workoutId);
      const sets =
        workouts[order].entries.find((e) => e.exerciseId === id)?.sets ?? [];
      const loggedAt = sets.reduce(
        (last, set) => (set.loggedAt > last ? set.loggedAt : last),
        "",
      );
      offered.push({ id, order, loggedAt });
    }
    return offered
      .sort((a, b) => a.order - b.order || b.loggedAt.localeCompare(a.loggedAt))
      .map((o) => o.id);
  }

  /**
   * Alphabetically, so the order never shuffles (the maintainer's choice, #10).
   * @returns {Promise<Gym[]>}
   */
  async function listGyms() {
    const gyms = /** @type {Gym[]} */ (await store.list("gyms"));
    return gyms.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * A gym name, trimmed; a blank one is refused, since a gym is chosen by
   * its name (#10).
   * @param {string} name
   */
  function gymName(name) {
    const trimmed = name.trim();
    if (!trimmed) throw new Error("A gym needs a name");
    return trimmed;
  }

  /**
   * The exercise's entry, if sets can be logged or undone for it: the
   * workout is in progress and the exercise is in it, not skipped.
   * @param {Workout} workout
   * @param {string} exerciseId
   * @returns {WorkoutEntry}
   */
  function inPlay(workout, exerciseId) {
    if (workout.finishedAt) throw new Error("That workout is finished");
    const entry = workout.entries.find(
      (e) => e.exerciseId === exerciseId && !e.skipped,
    );
    if (!entry) throw new Error("Add the exercise to the workout first");
    return entry;
  }

  /**
   * The workout with one exercise's entry changed.
   * @param {Workout} workout
   * @param {string} exerciseId
   * @param {(entry: WorkoutEntry) => WorkoutEntry} change
   * @returns {Workout}
   */
  function changeEntry(workout, exerciseId, change) {
    return {
      ...workout,
      entries: workout.entries.map((e) =>
        e.exerciseId === exerciseId ? change(e) : e,
      ),
    };
  }

  /** @param {string} workoutId */
  async function workoutById(workoutId) {
    const workout = /** @type {Workout | undefined} */ (
      await store.get("workouts", workoutId)
    );
    if (!workout) throw new Error(`No workout ${workoutId}`);
    return workout;
  }

  /**
   * Reads a workout, changes it and saves it, in turn with other changes.
   * @param {string} workoutId
   * @param {(workout: Workout) => Workout} change
   * @returns {Promise<Workout>} the workout as saved
   */
  function changeWorkout(workoutId, change) {
    return inTurn(async () => {
      const changed = change(await workoutById(workoutId));
      await store.put("workouts", changed);
      return changed;
    });
  }

  /**
   * The workout in progress, if any: it survives closing the app (spec #3,
   * story 43). One already finished isn't, even if still marked so (the
   * settings write after Finish failed, say).
   * @returns {Promise<Workout | undefined>}
   */
  async function workoutInProgress() {
    const { workoutInProgress: id } = await settings();
    if (id === undefined) return undefined;
    const workout = /** @type {Workout | undefined} */ (
      await store.get("workouts", id)
    );
    return workout?.finishedAt ? undefined : workout;
  }

  /**
   * Finishes the workout in progress if it was abandoned (#45), at the time
   * of its last set. Callers hold the turn.
   * @returns {Promise<boolean>} whether one was finished or discarded
   */
  async function finishIfAbandoned() {
    const workout = await workoutInProgress();
    if (!workout) return false;
    const lastActive = lastActivity(workout);
    if (now().getTime() - lastActive.getTime() < ABANDONED_AFTER) return false;
    await finish(workout, lastActive, { auto: true });
    return true;
  }

  /**
   * When the workout was last touched: its latest set, or its start.
   * @param {Workout} workout
   */
  function lastActivity(workout) {
    const times = workout.entries.flatMap((e) =>
      e.sets.map((s) => Date.parse(s.loggedAt)),
    );
    return new Date(Math.max(Date.parse(workout.startedAt), ...times));
  }

  /**
   * Ends a workout in progress (spec #3, story 42), keeping what was done:
   * exercises with sets, as plain entries, since skipping only mattered
   * while it was in progress. One with nothing logged is discarded (the
   * maintainer's choice, #11).
   * @param {Workout} workout
   * @param {Date} at The finish time.
   * @param {{ auto?: boolean }} [how] `auto`: finished for the user (#45),
   *   so the Log tab mentions it.
   * @returns {Promise<Workout | undefined>} the finished workout, or
   *   undefined if it was discarded
   */
  async function finish(workout, at, { auto = false } = {}) {
    const done = workout.entries
      .filter((e) => e.sets.length > 0)
      .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets }));
    const finished = done.length
      ? { ...workout, entries: done, finishedAt: at.toISOString() }
      : undefined;
    if (finished) await store.put("workouts", finished);
    else await store.remove("workouts", workout.id);
    const changed = await settings();
    const inProgress = changed.workoutInProgress === workout.id;
    if (inProgress) delete changed.workoutInProgress;
    if (finished && auto) changed.autoFinished = workout.id;
    if (inProgress || (finished && auto)) await store.put("settings", changed);
    return finished;
  }

  /**
   * The calendar date where the user is, not in UTC: a workout at 11pm
   * belongs to that day.
   * @param {Date} time
   */
  function localDate(time) {
    const pad = (/** @type {number} */ n) => String(n).padStart(2, "0");
    return `${time.getFullYear()}-${pad(time.getMonth() + 1)}-${pad(time.getDate())}`;
  }

  /** @returns {Promise<Settings>} */
  async function settings() {
    const saved = /** @type {Settings | undefined} */ (
      await store.get("settings", "user")
    );
    return saved ?? { id: "user" };
  }

  /**
   * Exercises matching the search text and, optionally, a muscle group.
   * With a muscle group, exercises where it is primary come before those
   * where it is secondary; otherwise (and within each group) by name.
   * @param {ExerciseFilter} filter
   * @returns {Promise<Exercise[]>}
   */
  async function searchExercises({ query = "", muscleGroup }) {
    const text = query.trim().toLowerCase();
    /** @param {Exercise} e */
    const rank = (e) =>
      !muscleGroup || e.primary.includes(muscleGroup) ? 0 : 1;
    const custom = /** @type {Exercise[]} */ (
      await store.list("customExercises")
    );
    const all = [...library, ...custom];
    return all
      .filter((e) => e.name.toLowerCase().includes(text))
      .filter(
        (e) =>
          !muscleGroup ||
          e.primary.includes(muscleGroup) ||
          e.secondary.includes(muscleGroup),
      )
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name));
  }

  /**
   * @param {string} gymId
   * @returns {Promise<Gym | undefined>}
   */
  async function findGym(gymId) {
    return /** @type {Gym | undefined} */ (await store.get("gyms", gymId));
  }

  /** @param {string} gymId */
  async function gymById(gymId) {
    const gym = await findGym(gymId);
    if (!gym) throw new Error(`No gym ${gymId}`);
    return gym;
  }
}
