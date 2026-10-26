/** @import { Exercise, ExerciseFilter, Gym, Settings, Store } from "./types.js" */

/** @typedef {ReturnType<typeof createForge>} Forge */

/**
 * The Forge core: every phase 1 rule, with no DOM or Firestore inside.
 * @param {{ store: Store, library: Exercise[] }} deps
 */
export function createForge({ store, library }) {
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
