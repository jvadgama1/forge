/** @import { Exercise, Store } from "./types.js" */

/**
 * An in-memory Store, for tests and previews.
 * @param {{ customExercises?: Exercise[] }} [seed]
 * @returns {Store}
 */
export function createMemoryStore(seed = {}) {
  const custom = [...(seed.customExercises ?? [])];
  return {
    async customExercises() {
      return [...custom];
    },
  };
}
