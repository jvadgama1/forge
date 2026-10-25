/** @import { Exercise, MuscleGroup, Store } from "./types.js" */

/** @typedef {ReturnType<typeof createForge>} Forge */

/**
 * The Forge core: every phase 1 rule, with no DOM or Firestore inside.
 * @param {{ store: Store, library: Exercise[] }} deps
 */
export function createForge({ store, library }) {
  return {
    /**
     * Exercises matching the search text and, optionally, a muscle group.
     * With a muscle group, exercises where it is primary come before those
     * where it is secondary; otherwise (and within each group) by name.
     * @param {{ query?: string, muscleGroup?: MuscleGroup }} filter
     * @returns {Promise<Exercise[]>}
     */
    async searchExercises({ query = "", muscleGroup }) {
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
    },
  };
}
