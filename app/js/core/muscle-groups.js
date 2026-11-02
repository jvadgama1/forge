/** @import { MuscleGroup, Region } from "./types.js" */

/** @typedef {{ id: MuscleGroup, label: string, region: Region }} MuscleGroupInfo */

/**
 * The four regions (GLOSSARY.md), in their fixed order: chart series and
 * summaries always run Push, Pull, Legs, Core (DESIGN.md § Look).
 * @type {{ id: Region, label: string }[]}
 */
export const REGIONS = [
  { id: "push", label: "Push" },
  { id: "pull", label: "Pull" },
  { id: "legs", label: "Legs" },
  { id: "core", label: "Core" },
];

/**
 * @param {Region} id
 * @returns {{ id: Region, label: string }}
 */
export function region(id) {
  const info = REGIONS.find((r) => r.id === id);
  if (!info) throw new Error(`Unknown region: ${id}`);
  return info;
}

/**
 * The 17 muscle groups (GLOSSARY.md), in display order, each in one region.
 * @type {MuscleGroupInfo[]}
 */
export const MUSCLE_GROUPS = [
  { id: "chest", label: "Chest", region: "push" },
  { id: "front-delts", label: "Front delts", region: "push" },
  { id: "side-delts", label: "Side delts", region: "push" },
  { id: "rear-delts", label: "Rear delts", region: "pull" },
  { id: "biceps", label: "Biceps", region: "pull" },
  { id: "triceps", label: "Triceps", region: "push" },
  { id: "forearms", label: "Forearms", region: "pull" },
  { id: "lats-upper-back", label: "Lats / upper back", region: "pull" },
  { id: "traps", label: "Traps", region: "pull" },
  { id: "lower-back", label: "Lower back", region: "core" },
  { id: "abs", label: "Abs", region: "core" },
  { id: "obliques", label: "Obliques", region: "core" },
  { id: "glutes", label: "Glutes", region: "legs" },
  { id: "quads", label: "Quads", region: "legs" },
  { id: "hamstrings", label: "Hamstrings", region: "legs" },
  { id: "adductors", label: "Adductors", region: "legs" },
  { id: "calves", label: "Calves", region: "legs" },
];

const byId = new Map(MUSCLE_GROUPS.map((m) => [m.id, m]));

/**
 * @param {MuscleGroup} id
 * @returns {MuscleGroupInfo}
 */
export function muscleGroup(id) {
  const info = byId.get(id);
  if (!info) throw new Error(`Unknown muscle group: ${id}`);
  return info;
}
