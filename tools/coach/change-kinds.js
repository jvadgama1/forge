// The kinds of change a coach proposal can make (spec #191), one entry each.
// The proposal module runs every change through its kind's entry, so a new
// kind is a new entry here and nothing else changes shape. Every kind makes
// its change through the Forge core's own methods, so the core's rules and
// reasons apply, and none can delete anything.
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { rirLabel } from "../../app/js/screens/screen.js";

/** @import { Forge } from "../../app/js/core/forge.js" */
/** @import { Routine, Slot } from "../../app/js/core/types.js" */

/**
 * A change as the proposal draft holds it: a kind, a reason, and the
 * kind's own fields.
 * @typedef {{ kind: string, reason: string, [field: string]: unknown }} Change
 */

/**
 * A document a change depends on, by collection and id.
 * @typedef {{ collection: string, id: string }} DocRef
 */

/**
 * What a change does, for the dry run and the record: a heading, then
 * groups of lines, each under an optional title.
 * @typedef {{ heading: string, groups: { title?: string, lines: string[] }[] }} Description
 */

/**
 * One kind of change.
 * @typedef {object} ChangeKind
 * @property {(change: Change) => void} check Throws, with the reason, when
 *   the change isn't shaped as this kind's; runs before anything is read.
 * @property {(change: Change) => DocRef[]} dependsOn The existing documents
 *   the change depends on: their state is part of the fingerprint, so a
 *   change to one after the preview refuses `apply`.
 * @property {(change: Change, forge: Forge) => Promise<unknown>} make Makes
 *   the change through the core, throwing the core's reason when it's
 *   refused; resolves to what `describe` describes.
 * @property {(made: any, forge: Forge) => Promise<Description>} describe
 */

const LIBRARY_IDS = new Set(SEED_LIBRARY.map((e) => e.id));

/** @param {unknown} value */
const isObject = (value) =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * A new routine (spec #191): a name and its routine days, each a name and
 * slots, saved at version 1 by the core's `saveRoutine`.
 * @type {ChangeKind}
 */
const newRoutine = {
  check(change) {
    // saveRoutine treats an id as an existing routine to change: a new
    // routine naming one would add a version to that routine instead.
    if ("id" in change)
      throw new Error("A new routine has no id: saving gives it its own");
    const { name, days } = change;
    if (typeof name !== "string" || !Array.isArray(days))
      throw new Error("A new routine has a name and a list of days");
    for (const day of days) {
      if (!isObject(day) || typeof day.name !== "string")
        throw new Error("Each routine day has a name and a list of slots");
      if ("id" in day)
        throw new Error(
          "A new routine's days have no ids: saving gives them their own",
        );
      if (!Array.isArray(day.slots) || !day.slots.every(isObject))
        throw new Error("Each routine day has a name and a list of slots");
    }
  },
  dependsOn(change) {
    // The custom exercises its slots use, whose names the dry run shows.
    const ids = routineDays(change).flatMap((day) =>
      day.slots.map((slot) => slot.exerciseId),
    );
    return [...new Set(ids)]
      .filter((id) => typeof id === "string" && !LIBRARY_IDS.has(id))
      .map((id) => ({ collection: "customExercises", id }));
  },
  async make(change, forge) {
    const name = /** @type {string} */ (change.name);
    // Names are unique per kind (spec #191), so a rerun can't duplicate a
    // routine; the core itself allows two of a name.
    const taken = (await forge.listRoutines()).find(
      (r) => r.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (taken) throw new Error(`${taken.name} is already a routine`);
    return forge.saveRoutine({
      name,
      days: routineDays(change).map(({ name, slots }) => ({ name, slots })),
    });
  },
  async describe(/** @type {Routine} */ routine, forge) {
    const version = /** @type {Routine["versions"][number]} */ (
      routine.versions.at(-1)
    );
    return {
      heading: `New routine: ${routine.name}, version ${version.number}`,
      groups: await Promise.all(
        version.days.map(async (day) => ({
          title: day.name,
          lines: await Promise.all(day.slots.map((s) => slotLine(s, forge))),
        })),
      ),
    };
  },
};

/** @type {Record<string, ChangeKind>} */
export const CHANGE_KINDS = { "new-routine": newRoutine };

/**
 * A change's routine days, once `check` has passed.
 * @param {Change} change
 */
const routineDays = (change) =>
  /** @type {{ name: string, slots: Slot[] }[]} */ (change.days);

/**
 * A slot as the workout screen shows its targets: "Barbell Row: 3 × 8–12 ·
 * RIR 2".
 * @param {Slot} slot
 * @param {Forge} forge
 */
async function slotLine({ exerciseId, sets, repMin, repMax, rir }, forge) {
  const name = (await forge.getExercise(exerciseId))?.name ?? exerciseId;
  const target = `${name}: ${sets} × ${repMin}–${repMax}`;
  return rir === undefined ? target : `${target} · RIR ${rirLabel(rir)}`;
}
