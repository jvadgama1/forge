// The kinds of change a coach proposal can make (spec #191), one entry each.
// The proposal module runs every change through its kind's entry, so a new
// kind is a new entry here and nothing else changes shape. Every kind makes
// its change through the Forge core's own methods, so the core's rules and
// reasons apply, and none can delete anything.
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { rirLabel } from "../../app/js/screens/screen.js";

/** @import { Forge } from "../../app/js/core/forge.js" */
/** @import { Routine, RoutineDay, RoutineVersion, Slot } from "../../app/js/core/types.js" */

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
 * @property {(change: Change) => DocRef[]} writes The existing documents
 *   the change writes over, also in the fingerprint: `apply` backs up each
 *   that exists before it writes anything (spec #191).
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
      checkDay(day);
      if ("id" in day)
        throw new Error(
          "A new routine's days have no ids: saving gives them their own",
        );
    }
  },
  dependsOn: customExercisesIn,
  // A new routine is a new document: there's nothing to back up.
  writes: () => [],
  async make(change, forge) {
    const name = /** @type {string} */ (change.name);
    // Names are unique per kind (spec #191), so a rerun can't duplicate a
    // routine; the core itself allows two of a name.
    const taken = named(await forge.listRoutines(), name);
    if (taken) throw new Error(`${taken.name} is already a routine`);
    return forge.saveRoutine({
      name,
      days: routineDays(change).map(({ name, slots }) => ({ name, slots })),
    });
  },
  async describe(/** @type {Routine} */ routine, forge) {
    const version = latest(routine);
    return {
      heading: `New routine: ${routine.name}, version ${version.number}`,
      groups: await Promise.all(
        version.days.map(async (day) => ({
          title: day.name,
          lines: await slotLines(day.slots, forge),
        })),
      ),
    };
  },
};

/**
 * A change to an existing routine (#195; spec #191): its id, an optional
 * new name, and the new version's routine days in full. A day naming its
 * existing day id continues, so the rotation carries on from the day done
 * last; a day with no id is new; a day left out is dropped from the new
 * version only. The core's `saveRoutine` keeps every earlier version, and
 * a rename alone adds none.
 * @type {ChangeKind}
 */
const changeRoutine = {
  check(change) {
    const { id, name, days } = change;
    if (typeof id !== "string" || !id)
      throw new Error("A routine change names the routine by its id");
    if (name !== undefined && typeof name !== "string")
      throw new Error("A routine change's new name is text");
    if (!Array.isArray(days))
      throw new Error("A routine change lists the new version's days in full");
    // Dropping every day would leave the routine nothing to start.
    if (!days.length)
      throw new Error("A routine change keeps at least one day");
    /** @type {Set<string>} */
    const ids = new Set();
    for (const day of days) {
      checkDay(day);
      if (!("id" in day)) continue;
      if (typeof day.id !== "string" || !day.id)
        throw new Error(
          "A routine day that continues names its day id; a new one has none",
        );
      if (ids.has(day.id))
        throw new Error(`Two routine days name the day id ${day.id}`);
      ids.add(day.id);
    }
  },
  dependsOn: (change) => [...routineOf(change), ...customExercisesIn(change)],
  writes: routineOf,
  async make(change, forge) {
    const id = /** @type {string} */ (change.id);
    const before = await forge.getRoutine(id);
    if (!before) throw new Error(`There's no routine ${id} in Forge`);
    const current = latest(before).days;
    const days = routineDays(change);
    // Only a day of the current version continues: any other id would name
    // a day the rotation no longer has, or none at all.
    for (const day of days)
      if (day.id !== undefined && !current.some((d) => d.id === day.id))
        throw new Error(
          `${before.name} has no day ${day.id} in its current version`,
        );
    // A new day can't take a current day's name, so a rerun after a partial
    // failure (#196) can't add a day that landed a second time: a day that
    // continues names its id instead.
    for (const day of days) {
      if (day.id !== undefined) continue;
      const taken = named(current, day.name);
      if (taken)
        throw new Error(`${taken.name} is already a day of ${before.name}`);
    }
    const name = /** @type {string | undefined} */ (change.name) ?? before.name;
    // Names are unique per kind (spec #191), so a rename can't take
    // another routine's.
    const taken = named(await forge.listRoutines(), name);
    if (taken && taken.id !== id)
      throw new Error(`${taken.name} is already a routine`);
    const after = await forge.saveRoutine({
      id,
      name,
      days: days.map(({ id, name, slots }) => ({
        ...(id === undefined ? {} : { id }),
        name,
        slots,
      })),
    });
    if (
      after.name === before.name &&
      after.versions.length === before.versions.length
    )
      throw new Error(`This changes nothing in ${before.name}`);
    return { before, after };
  },
  async describe(
    /** @type {{ before: Routine, after: Routine }} */ { before, after },
    forge,
  ) {
    const was = latest(before);
    const now = latest(after);
    const name =
      after.name === before.name
        ? before.name
        : `${before.name} → ${after.name}`;
    if (now.number === was.number)
      return {
        heading: `Rename routine: ${name}, still version ${was.number}`,
        groups: [],
      };
    /** @type {Description["groups"]} */
    const groups = [];
    const order = reordered(
      was.days,
      now.days,
      (d) => d.id,
      (d) => d.name,
    );
    if (order) groups.push({ lines: [`Day order: ${order}`] });
    for (const day of now.days) {
      const old = was.days.find((d) => d.id === day.id);
      groups.push(
        old
          ? await dayChange(old, day, forge)
          : {
              title: `${day.name} (new day)`,
              lines: await slotLines(day.slots, forge),
            },
      );
    }
    for (const old of was.days)
      if (!now.days.some((d) => d.id === old.id))
        groups.push({
          title: `${old.name} (dropped)`,
          lines: await slotLines(old.slots, forge),
        });
    return {
      heading: `Change routine: ${name}, version ${was.number} → ${now.number}`,
      groups,
    };
  },
};

/** @type {Record<string, ChangeKind>} */
export const CHANGE_KINDS = {
  "new-routine": newRoutine,
  "change-routine": changeRoutine,
};

/**
 * Throws unless a change's routine day is a name and a list of slots.
 * @param {unknown} day
 * @returns {asserts day is { name: string, slots: object[], id?: unknown }}
 */
function checkDay(day) {
  if (
    !isObject(day) ||
    typeof (/** @type {any} */ (day).name) !== "string" ||
    !Array.isArray(/** @type {any} */ (day).slots) ||
    !(/** @type {any} */ (day).slots.every(isObject))
  )
    throw new Error("Each routine day has a name and a list of slots");
}

/**
 * A change's routine days, once `check` has passed.
 * @param {Change} change
 */
const routineDays = (change) =>
  /** @type {{ id?: string, name: string, slots: Slot[] }[]} */ (change.days);

/**
 * The routine a routine change names, once `check` has passed.
 * @param {Change} change
 * @returns {DocRef[]}
 */
function routineOf(change) {
  return [{ collection: "routines", id: /** @type {string} */ (change.id) }];
}

/**
 * The custom exercises a change's routine days use, whose names the dry
 * run shows.
 * @param {Change} change
 * @returns {DocRef[]}
 */
function customExercisesIn(change) {
  const ids = routineDays(change).flatMap((day) =>
    day.slots.map((slot) => slot.exerciseId),
  );
  return [...new Set(ids)]
    .filter((id) => typeof id === "string" && !LIBRARY_IDS.has(id))
    .map((id) => ({ collection: "customExercises", id }));
}

/**
 * The one of `items` already called `name`, whatever its case and spacing:
 * a routine among the routines, a day among a routine's days.
 * @template {{ name: string }} T
 * @param {T[]} items
 * @param {string} name
 */
function named(items, name) {
  const wanted = name.trim().toLowerCase();
  return items.find((item) => item.name.toLowerCase() === wanted);
}

/**
 * A routine's current version: every saved routine has one.
 * @param {Routine} routine
 */
const latest = (routine) =>
  /** @type {RoutineVersion} */ (routine.versions.at(-1));

/**
 * A slot's targets as the workout screen shows them: "3 × 8–12 · RIR 2".
 * @param {Slot} slot
 */
function targets({ sets, repMin, repMax, rir }) {
  const target = `${sets} × ${repMin}–${repMax}`;
  return rir === undefined ? target : `${target} · RIR ${rirLabel(rir)}`;
}

/**
 * @param {Slot} slot
 * @param {Forge} forge
 */
const exerciseName = async ({ exerciseId }, forge) =>
  (await forge.getExercise(exerciseId))?.name ?? exerciseId;

/**
 * Each slot with its targets: "Barbell Row: 3 × 8–12 · RIR 2".
 * @param {Slot[]} slots
 * @param {Forge} forge
 */
const slotLines = (slots, forge) =>
  Promise.all(
    slots.map(async (s) => `${await exerciseName(s, forge)}: ${targets(s)}`),
  );

/**
 * A continuing routine day against the same day in the current version:
 * its slots in the new order, each added, changed or removed one marked,
 * old and new targets side by side, and both orders when slots moved.
 * @param {RoutineDay} old
 * @param {RoutineDay} day
 * @param {Forge} forge
 * @returns {Promise<Description["groups"][number]>}
 */
async function dayChange(old, day, forge) {
  /** @type {Map<string, string>} */
  const names = new Map();
  for (const slot of [...old.slots, ...day.slots])
    names.set(slot.exerciseId, await exerciseName(slot, forge));
  /** @param {Slot} slot */
  const nameOf = (slot) => /** @type {string} */ (names.get(slot.exerciseId));
  /** @param {Slot[]} slots @param {Slot} slot */
  const inSlots = (slots, slot) =>
    slots.find((s) => s.exerciseId === slot.exerciseId);
  let changed = false;
  /** @type {string[]} */
  const lines = [];
  for (const slot of day.slots) {
    const was = inSlots(old.slots, slot);
    if (was && targets(was) === targets(slot))
      lines.push(`${nameOf(slot)}: ${targets(slot)}`);
    else {
      changed = true;
      lines.push(
        was
          ? `${nameOf(slot)}: ${targets(was)} → ${targets(slot)}`
          : `${nameOf(slot)}: ${targets(slot)} (added)`,
      );
    }
  }
  for (const slot of old.slots)
    if (!inSlots(day.slots, slot)) {
      changed = true;
      lines.push(`${nameOf(slot)}: ${targets(slot)} (removed)`);
    }
  const order = reordered(old.slots, day.slots, (s) => s.exerciseId, nameOf);
  if (order) lines.push(`Order: ${order}`);
  const title =
    day.name !== old.name
      ? `${day.name} (was ${old.name})`
      : changed || order
        ? day.name
        : `${day.name} (unchanged)`;
  return { title, lines };
}

/**
 * Both orders, "A, B → B, A", when the items in both lists come in a
 * different order; nothing when they don't.
 * @template T
 * @param {T[]} old
 * @param {T[]} now
 * @param {(item: T) => string} key
 * @param {(item: T) => string} name
 */
function reordered(old, now, key, name) {
  /** @param {T[]} from @param {T[]} other */
  const kept = (from, other) => {
    const keys = new Set(other.map(key));
    return from.map(key).filter((k) => keys.has(k));
  };
  const a = kept(old, now);
  const b = kept(now, old);
  if (a.every((k, i) => k === b[i])) return undefined;
  return `${old.map(name).join(", ")} → ${now.map(name).join(", ")}`;
}
