/** @import { Exercise, ExerciseFilter, ExerciseInWorkout, Gym, Load, RecordKind, Routine, RoutineDay, RoutineDayDraft, RoutineDayRef, RoutineVersion, Settings, Slot, Store, Workout, WorkoutEntry, WorkoutSet } from "./types.js" */

/** @typedef {ReturnType<typeof createForge>} Forge */

// A workout left this long after its last set (or its start, with no sets)
// was abandoned, not paused: no real workout rests 3 hours (#45).
const ABANDONED_AFTER = 3 * 60 * 60_000;

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
 * Epley's estimated one-rep max (spec #3, Rules), in kg to compare: for
 * working sets of 1 to 12 reps with a load. Callers check the exercise has
 * an e1RM at all (`hasE1rm`).
 * @param {WorkoutSet} set
 * @returns {number | undefined}
 */
function e1rmKg(set) {
  if (!working(set) || set.load <= 0 || set.reps < 1 || set.reps > 12)
    return undefined;
  return inKg(set) * (1 + set.reps / 30);
}

/**
 * Records from a set of sets (spec #3, Rules): the heaviest working load,
 * the best e1RM (when `withE1rm`, in its set's unit), and the most reps at
 * each load, heaviest load first.
 * @param {WorkoutSet[]} sets
 * @param {boolean} withE1rm
 */
function recordsOf(sets, withE1rm) {
  /** @type {Load | undefined} */
  let heaviest;
  /** @type {{ set: WorkoutSet, kg: number } | undefined} */
  let best;
  /** @type {Map<number, Load & { reps: number }>} */
  const atLoad = new Map();
  for (const set of sets.filter(working)) {
    if (!heaviest || inKg(set) > inKg(heaviest))
      heaviest = { load: set.load, unit: set.unit };
    const kg = withE1rm ? e1rmKg(set) : undefined;
    if (kg !== undefined && (!best || kg > best.kg)) best = { set, kg };
    const key = loadKey(set);
    if ((atLoad.get(key)?.reps ?? 0) < set.reps)
      atLoad.set(key, { load: set.load, unit: set.unit, reps: set.reps });
  }
  const repsAtLoad = [...atLoad.entries()]
    .sort(([a], [b]) => b - a)
    .map(([, r]) => r);
  return {
    ...(heaviest && { heaviest }),
    ...(best && {
      bestE1rm: { set: best.set, value: fromKg(best.kg, best.set.unit) },
    }),
    repsAtLoad,
  };
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

    /**
     * A seeded or custom exercise.
     * @param {string} exerciseId
     * @returns {Promise<Exercise | undefined>}
     */
    async getExercise(exerciseId) {
      return (
        library.find((e) => e.id === exerciseId) ??
        /** @type {Exercise | undefined} */ (
          await store.get("customExercises", exerciseId)
        )
      );
    },

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
     * Starts a workout at a gym, today: freestyle (spec #3, story 24), or
     * from a routine day (story 23) with its slots laid out as the
     * workout's exercises, at the routine's current version.
     * @param {string} gymId
     * @param {RoutineDayRef} [from]
     * @returns {Promise<Workout>}
     */
    startWorkout(gymId, from) {
      return inTurn(async () => {
        await finishIfAbandoned();
        if (await workoutInProgress())
          throw new Error("A workout is already in progress");
        const started = now();
        /** @type {Workout} */
        const workout = {
          id: crypto.randomUUID(),
          date: localDate(started),
          startedAt: started.toISOString(),
          gymId,
          entries: [],
        };
        if (from) {
          const version = currentVersion(await routineById(from.routineId));
          const day = version?.days.find((d) => d.id === from.dayId);
          if (!version || !day) throw new Error("That routine day is gone");
          workout.routine = {
            routineId: from.routineId,
            version: version.number,
            dayId: day.id,
          };
          workout.entries = day.slots.map((slot) => ({
            exerciseId: slot.exerciseId,
            sets: [],
          }));
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
        .sort(
          (a, b) =>
            b.date.localeCompare(a.date) ||
            b.startedAt.localeCompare(a.startedAt),
        )[0];
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
      const slot = (await followedDay(workout))?.slots.find(
        (s) => s.exerciseId === exerciseId,
      );
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
      return (
        JSON.stringify(day.slots.map((s) => s.exerciseId)) !==
        JSON.stringify(
          workout.entries.filter((e) => !e.skipped).map((e) => e.exerciseId),
        )
      );
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
     * Logs a weight × reps set for an exercise in the workout (spec #3,
     * stories 29–32), with optional RIR and a warm-up or drop-set flag.
     * Loads are in lb until per-exercise units arrive (#21).
     * @param {string} workoutId
     * @param {string} exerciseId
     * @param {{ load: number, reps: number, rir?: number, warmUp?: boolean, drop?: boolean }} set
     */
    async logSet(workoutId, exerciseId, { load, reps, rir, warmUp, drop }) {
      if (!Number.isInteger(reps) || reps < 1)
        throw new Error("Reps must be 1 or more");
      if (!(load >= 0)) throw new Error("Load must be 0 or more");
      if (rir !== undefined && !(Number.isInteger(rir) && rir >= 0 && rir <= 4))
        throw new Error("RIR is 0 to 4");
      if (warmUp && drop)
        throw new Error("A set is a warm-up or a drop set, not both");
      /** @type {WorkoutSet} */
      const logged = { load, unit: "lb", reps, loggedAt: now().toISOString() };
      if (rir !== undefined) logged.rir = rir;
      if (warmUp) logged.warmUp = true;
      if (drop) logged.drop = true;
      return changeWorkout(workoutId, (w) => {
        inPlay(w, exerciseId);
        return changeEntry(w, exerciseId, (e) => ({
          ...e,
          sets: [...e.sets, logged],
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
     * The load steppers' step: the exercise's increment, by default 5 lb for
     * upper body and 10 lb for lower (GLOSSARY: Increment). Per-exercise
     * increments arrive with #21.
     * @param {string} exerciseId
     */
    loadStep(exerciseId) {
      return library.find((e) => e.id === exerciseId)?.body === "lower"
        ? 10
        : 5;
    },

    /**
     * Seconds to rest after a set of the exercise: its rest default, 90 s
     * (spec #3, story 38). Per-exercise defaults arrive with #21, rest
     * within supersets with #17.
     * @param {string} exerciseId
     */
    // eslint-disable-next-line no-unused-vars -- per exercise from #21
    restAfterSet(exerciseId) {
      return 90;
    },

    lastWorkout,

    /**
     * The last workout as the logging screen's line shows it (spec #3,
     * story 25): its date, its working sets (what to beat) and the last
     * one's RIR. No sets means it had only warm-ups or drop sets.
     * @param {string} exerciseId
     * @param {string} [excluding] the workout in progress
     * @returns {Promise<{ date: string, sets: (Load & { reps: number })[], rir?: number } | undefined>}
     */
    async lastWorkoutLine(exerciseId, excluding) {
      const last = await lastWorkout(exerciseId, excluding);
      if (!last) return undefined;
      const done = last.sets.filter(working);
      const rir = done.at(-1)?.rir;
      return {
        date: last.workout.date,
        sets: done.map(({ load, unit, reps }) => ({ load, unit, reps })),
        ...(rir === undefined ? {} : { rir }),
      };
    },

    history,

    /**
     * The exercise's records (spec #3, Rules), from its working sets.
     * @param {string} exerciseId
     */
    async records(exerciseId) {
      const sets = (await history(exerciseId)).flatMap((h) => h.sets);
      return recordsOf(sets, await hasE1rm(exerciseId));
    },

    /**
     * Each workout's best e1RM, oldest first (spec #3, story 51), for the
     * history chart and list: compared in kg and given in the unit of the
     * latest one, so a unit change doesn't put lb and kg on one axis.
     * @param {string} exerciseId
     * @returns {Promise<{ unit: Load["unit"], points: { workoutId: string, date: string, value: number }[] }>}
     */
    async e1rmTrend(exerciseId) {
      if (!(await hasE1rm(exerciseId))) return { unit: "lb", points: [] };
      const best = (await history(exerciseId))
        .map(({ workout, sets }) => {
          const top = recordsOf(sets, true).bestE1rm;
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
    },

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
      const others = (await history(exerciseId))
        .filter((h) => h.workout.id !== workout.id)
        .flatMap((h) => h.sets);
      if (!others.some(working)) return [];
      const withE1rm = await hasE1rm(exerciseId);
      const before = recordsOf([...others, ...sets.slice(0, -1)], withE1rm);
      if (!before.heaviest) return [];
      /** @type {RecordKind[]} */
      const beaten = [];
      if (inKg(latest) > inKg(before.heaviest)) beaten.push("heaviest");
      const estimate = withE1rm ? e1rmKg(latest) : undefined;
      const bestBefore = before.bestE1rm && e1rmKg(before.bestE1rm.set);
      if (
        estimate !== undefined &&
        bestBefore !== undefined &&
        estimate > bestBefore
      )
        beaten.push("e1rm");
      const atLoad = before.repsAtLoad.find(
        (r) => loadKey(r) === loadKey(latest),
      );
      if (atLoad && latest.reps > atLoad.reps) beaten.push("reps");
      return beaten;
    },

    /**
     * What the next set of an exercise starts filled in with: the previous
     * set's load and reps (spec #3, story 28). The first set starts empty
     * until last workouts and suggestions arrive (#13, #15).
     * @param {Workout} workout
     * @param {string} exerciseId
     * @returns {{ load: number, reps: number } | undefined}
     */
    nextSet(workout, exerciseId) {
      const sets = workout.entries.find(
        (e) => e.exerciseId === exerciseId,
      )?.sets;
      const last = sets?.at(-1);
      return last && { load: last.load, reps: last.reps };
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
      return changeWorkout(workoutId, (w) =>
        changeEntry(w, exerciseId, (e) => ({ ...e, skipped: true })),
      );
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
  };

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
        slots: day.slots.map(({ exerciseId, sets, repMin, repMax, rir }) => {
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
          return { exerciseId, sets, repMin, repMax, ...withRir(rir) };
        }),
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
      .map(
        (e) =>
          day.slots.find((s) => s.exerciseId === e.exerciseId) ??
          newSlot(e.exerciseId, e.sets.filter(working).length || undefined),
      );
    await saveVersion(
      routine,
      version.days.map((d) => (d.id === day.id ? { ...d, slots } : d)),
    );
  }

  /**
   * Every workout with sets of the exercise, newest first by workout date
   * (spec #3, story 50), the one in progress included.
   * @param {string} exerciseId
   * @returns {Promise<ExerciseInWorkout[]>}
   */
  async function history(exerciseId) {
    const workouts = /** @type {Workout[]} */ (await store.list("workouts"));
    return workouts
      .map((workout) => ({
        workout,
        sets:
          workout.entries.find((e) => e.exerciseId === exerciseId)?.sets ?? [],
      }))
      .filter((h) => h.sets.length > 0)
      .sort(
        (a, b) =>
          b.workout.date.localeCompare(a.workout.date) ||
          b.workout.startedAt.localeCompare(a.workout.startedAt),
      );
  }

  /**
   * Whether the exercise's sets have an e1RM: weight × reps only, until body
   * weight arrives for bodyweight exercises (#18, #19).
   * @param {string} exerciseId
   */
  async function hasE1rm(exerciseId) {
    const exercise =
      library.find((e) => e.id === exerciseId) ??
      /** @type {Exercise | undefined} */ (
        await store.get("customExercises", exerciseId)
      );
    return exercise?.type === "weight-reps";
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
