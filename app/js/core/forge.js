/** @import { Exercise, ExerciseFilter, Gym, Settings, Store, Workout, WorkoutEntry, WorkoutSet } from "./types.js" */

/** @typedef {ReturnType<typeof createForge>} Forge */

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
     * Starts a freestyle workout at a gym, today (spec #3, story 24).
     * @param {string} gymId
     * @returns {Promise<Workout>}
     */
    startWorkout(gymId) {
      return inTurn(async () => {
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

    currentWorkout: workoutInProgress,

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
    finishWorkout(workoutId) {
      return inTurn(async () => {
        const workout = await workoutById(workoutId);
        if (workout.finishedAt) return workout; // a second tap on Finish
        // What was done: exercises with sets, as plain entries. Skipping
        // only mattered while the workout was in progress.
        const done = workout.entries
          .filter((e) => e.sets.length > 0)
          .map((e) => ({ exerciseId: e.exerciseId, sets: e.sets }));
        const finished = done.length
          ? { ...workout, entries: done, finishedAt: now().toISOString() }
          : undefined;
        if (finished) await store.put("workouts", finished);
        else await store.remove("workouts", workoutId);
        const changed = await settings();
        if (changed.workoutInProgress === workoutId) {
          delete changed.workoutInProgress;
          await store.put("settings", changed);
        }
        return finished;
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
        if (w.finishedAt) throw new Error("That workout is finished");
        if (!w.entries.some((e) => e.exerciseId === exerciseId && !e.skipped))
          throw new Error("Add the exercise to the workout first");
        return changeEntry(w, exerciseId, (e) => ({
          ...e,
          sets: [...e.sets, logged],
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
   * The unfinished workout, if any: it survives closing the app (spec #3,
   * story 43).
   * @returns {Promise<Workout | undefined>}
   */
  async function workoutInProgress() {
    const { workoutInProgress: id } = await settings();
    if (id === undefined) return undefined;
    return /** @type {Workout | undefined} */ (await store.get("workouts", id));
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
