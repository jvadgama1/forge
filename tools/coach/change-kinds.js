// The kinds of change a coach proposal can make (spec #191), one entry each.
// The proposal module runs every change through its kind's entry, so a new
// kind is a new entry here. Every kind makes its change through the Forge
// core's own methods, so the core's rules and reasons apply, and none can
// delete anything. A change names a custom exercise made earlier in the
// same proposal by { "custom": "<name>" } (#197), which the run of the
// proposal resolves to the id the core gave it; a kind that makes several
// writes says what landed when one fails (LandedPartly).
import { TYPE_RULES, distanceUnit } from "../../app/js/core/exercise-types.js";
import { MUSCLE_GROUPS, muscleGroup } from "../../app/js/core/muscle-groups.js";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { TYPE_LABELS } from "../../app/js/screens/exercise-list.js";
import { restText, rirLabel } from "../../app/js/screens/screen.js";

/** @import { Forge } from "../../app/js/core/forge.js" */
/** @import { Exercise, ExerciseSettings, ExerciseType, Gym, MuscleGroup, Routine, RoutineDay, RoutineVersion, Slot } from "../../app/js/core/types.js" */

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
 * @property {(change: Change, forge: Forge, run: Run) => Promise<unknown>} make
 *   Makes the change through the core, throwing the core's reason when it's
 *   refused; resolves to what `describe` describes.
 * @property {(made: any, forge: Forge) => Promise<Description>} describe
 */

/**
 * What the changes made so far in one run of a proposal (its dry run, or
 * applying it) have made that later ones refer to: each custom exercise
 * made, by its name in lower case, so { "custom": "<name>" } finds it.
 * @typedef {{ customs: Map<string, Exercise> }} Run
 */

/**
 * Thrown by a change that makes several writes (#197) when one fails after
 * some landed, saying what was written and what wasn't, so `apply` can
 * report it landed partly. Its message is the failure's.
 */
export class LandedPartly extends Error {
  /**
   * @param {unknown} cause the write's failure
   * @param {string[]} lines what was written, then what wasn't
   */
  constructor(cause, lines) {
    super(cause instanceof Error ? cause.message : String(cause), { cause });
    this.lines = lines;
  }
}

/** A fresh run, before any change is made. */
export const newRun = () => /** @type {Run} */ ({ customs: new Map() });

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
  async make(change, forge, run) {
    const name = /** @type {string} */ (change.name);
    // Names are unique per kind (spec #191), so a rerun can't duplicate a
    // routine; the core itself allows two of a name.
    const taken = named(await forge.listRoutines(), name);
    if (taken) throw new Error(`${taken.name} is already a routine`);
    const days = await resolvedDays(change, forge, run);
    return forge.saveRoutine({
      name,
      days: days.map(({ name, slots }) => ({ name, slots })),
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
  async make(change, forge, run) {
    const id = /** @type {string} */ (change.id);
    const before = await forge.getRoutine(id);
    if (!before) throw new Error(`There's no routine ${id} in Forge`);
    const current = latest(before).days;
    const days = await resolvedDays(change, forge, run);
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

/** @type {Set<string>} */
const MUSCLE_IDS = new Set(MUSCLE_GROUPS.map((m) => m.id));

/**
 * A new custom exercise (#197; spec #191): a name, exercise type, primary
 * and secondary muscle groups and body half, saved by the core's
 * `saveCustomExercise` as the app's New exercise page saves one. The core
 * refuses a name already in use in the library or the custom exercises.
 * @type {ChangeKind}
 */
const newCustomExercise = {
  check(change) {
    // saveCustomExercise treats an id as an existing exercise to edit.
    if ("id" in change)
      throw new Error(
        "A new custom exercise has no id: saving gives it its own",
      );
    const { name, type, primary, secondary, body } = change;
    if (typeof name !== "string")
      throw new Error("A new custom exercise has a name");
    if (typeof type !== "string" || !Object.hasOwn(TYPE_RULES, type))
      throw new Error(
        `A custom exercise's type is one of ${Object.keys(TYPE_RULES).join(", ")}`,
      );
    for (const groups of [primary, secondary])
      if (
        !Array.isArray(groups) ||
        !groups.every((m) => typeof m === "string" && MUSCLE_IDS.has(m))
      )
        throw new Error(
          `A custom exercise's primary and secondary muscle groups are lists of ${[...MUSCLE_IDS].join(", ")}`,
        );
    if (body !== "upper" && body !== "lower")
      throw new Error("A custom exercise's body half is upper or lower");
  },
  dependsOn: () => [],
  // A new custom exercise is a new document: there's nothing to back up.
  writes: () => [],
  async make(change, forge, run) {
    const exercise = await forge.saveCustomExercise({
      name: /** @type {string} */ (change.name),
      type: /** @type {ExerciseType} */ (change.type),
      primary: /** @type {MuscleGroup[]} */ (change.primary),
      secondary: /** @type {MuscleGroup[]} */ (change.secondary),
      body: /** @type {Exercise["body"]} */ (change.body),
    });
    run.customs.set(exercise.name.toLowerCase(), exercise);
    return exercise;
  },
  async describe(/** @type {Exercise} */ exercise) {
    /** @param {MuscleGroup[]} groups */
    const labels = (groups) =>
      groups.map((m) => muscleGroup(m).label).join(", ") || "none";
    return {
      heading: `New custom exercise: ${exercise.name}`,
      groups: [
        {
          lines: [
            `Type: ${TYPE_LABELS[exercise.type]}`,
            `Primary: ${labels(exercise.primary)}`,
            `Secondary: ${labels(exercise.secondary)}`,
            `Body: ${exercise.body === "lower" ? "Lower" : "Upper"}`,
          ],
        },
      ],
    };
  },
};

/** The settings an exercise settings change can name, as the app names them. */
const SETTING_LABELS = /** @type {const} */ ({
  unit: "unit",
  increment: "increment",
  rest: "rest",
  note: "pinned note",
});

/**
 * An exercise's settings (#197; spec #191): any of its unit, increment,
 * rest default and pinned note, saved by the core's `saveExerciseSettings`.
 * Only the settings named are passed: the rest stay as they are, and an
 * increment at its default follows a change of unit to the new unit's
 * default by the core's own rule, as on the exercise page. The increment
 * only changes what double progression steps by (ADR-0004).
 * @type {ChangeKind}
 */
const exerciseSettings = {
  check(change) {
    checkExercise(
      change.exerciseId,
      "An exercise settings change names the exercise by its id",
    );
    const fields = Object.keys(change).filter(
      (k) => !["kind", "reason", "exerciseId"].includes(k),
    );
    const other = fields.find((k) => !Object.hasOwn(SETTING_LABELS, k));
    if (other)
      throw new Error(
        `An exercise settings change has only unit, increment, rest and note, not ${other}`,
      );
    if (!fields.length)
      throw new Error(
        "An exercise settings change names at least one of unit, increment, rest and note",
      );
    // The core's own checks take what the exercise page's fields give.
    if (change.increment !== undefined && typeof change.increment !== "number")
      throw new Error("An increment is a number");
    if (change.note !== undefined && typeof change.note !== "string")
      throw new Error("A pinned note is text; a blank one removes it");
  },
  dependsOn: (change) => customExercises([change.exerciseId]),
  // A custom exercise the proposal makes has no settings yet to back up.
  writes: (change) =>
    typeof change.exerciseId === "string"
      ? [{ collection: "exerciseSettings", id: change.exerciseId }]
      : [],
  async make(change, forge, run) {
    const exercise = await exerciseOf(change.exerciseId, forge, run);
    const before = await forge.exerciseSettings(exercise.id);
    const cardio = isCardio(exercise);
    const { unit, increment, rest } = /** @type {Partial<ExerciseSettings>} */ (
      change
    );
    const note = /** @type {string | undefined} */ (change.note)?.trim();
    if (cardio && increment !== undefined)
      throw new Error(`${exercise.name} is cardio: it has no increment`);
    // Each setting named is a change, so a proposal written against
    // settings that have since changed is refused, not quietly applied.
    const already = (/** @type {keyof typeof SETTING_LABELS} */ setting) =>
      new Error(
        `${exercise.name}'s ${SETTING_LABELS[setting]} is already ${settingText(setting, before, cardio)}`,
      );
    const nextUnit = unit ?? before.unit;
    if (unit === before.unit) throw already("unit");
    if (increment === before.increment && nextUnit === before.unit)
      throw already("increment");
    if (rest === before.rest) throw already("rest");
    if (note !== undefined && note === (before.note ?? ""))
      throw before.note
        ? already("note")
        : new Error(`${exercise.name} has no pinned note to remove`);
    await forge.saveExerciseSettings(exercise.id, {
      ...(unit === undefined ? {} : { unit }),
      ...(increment === undefined ? {} : { increment }),
      ...(rest === undefined ? {} : { rest }),
      ...(note === undefined ? {} : { note }),
    });
    return { exercise, before };
  },
  async describe(
    /** @type {{ exercise: Exercise, before: ExerciseSettings }} */ {
      exercise,
      before,
    },
    forge,
  ) {
    const after = await forge.exerciseSettings(exercise.id);
    const cardio = isCardio(exercise);
    const defaults = await forge.exerciseSettings(undefined);
    /**
     * @param {keyof typeof SETTING_LABELS} setting
     * @param {ExerciseSettings} settings
     */
    const shown = (setting, settings) => {
      const text = settingText(setting, settings, cardio);
      const isDefault =
        setting === "increment"
          ? settings.increment ===
            forge.defaultIncrement(exercise.body, settings.unit)
          : setting !== "note" && settings[setting] === defaults[setting];
      return isDefault ? `${text} (default)` : text;
    };
    const lines = /** @type {(keyof typeof SETTING_LABELS)[]} */ (
      Object.keys(SETTING_LABELS)
    )
      .filter((s) => !(cardio && s === "increment"))
      .filter(
        (s) => settingText(s, before, cardio) !== settingText(s, after, cardio),
      )
      .map((s) => {
        const label = SETTING_LABELS[s];
        return `${label[0].toUpperCase()}${label.slice(1)}: ${shown(s, before)} → ${shown(s, after)}`;
      });
    return {
      heading: `Exercise settings: ${exercise.name}`,
      groups: [{ lines }],
    };
  },
};

/**
 * Ticks and unticks at an existing gym (#197; spec #191), one at a time by
 * the core's `setExerciseAtGym`, as the app's gym page makes them. Unticking
 * is the only removal a proposal can make, and it leaves the gym's other
 * ticks and fields as they were.
 * @type {ChangeKind}
 */
const gymExercises = {
  check(change) {
    if (typeof change.id !== "string" || !change.id)
      throw new Error("A gym exercises change names the gym by its id");
    const { tick = [], untick = [] } = change;
    if (!Array.isArray(tick) || !Array.isArray(untick))
      throw new Error(
        "A gym exercises change lists the exercises to tick and to untick",
      );
    if (!tick.length && !untick.length)
      throw new Error(
        "A gym exercises change ticks or unticks at least one exercise",
      );
    for (const ref of [...tick, ...untick])
      checkExercise(ref, "Each exercise is named by its id");
  },
  dependsOn: (change) => [...gymOf(change), ...customExercises(refsIn(change))],
  writes: gymOf,
  async make(change, forge, run) {
    const id = /** @type {string} */ (change.id);
    const gym = await forge.getGym(id);
    if (!gym) throw new Error(`There's no gym ${id} in Forge`);
    const ticks = await namedExercises(exercisesIn(change, "tick"), forge, run);
    const unticks = await namedExercises(
      exercisesIn(change, "untick"),
      forge,
      run,
    );
    refuseNamedTwice([...ticks, ...unticks]);
    // Each tick named is a change, so a rerun after a partial failure, or
    // a proposal written against ticks that have since changed, is refused.
    for (const e of ticks)
      if (gym.exerciseIds.includes(e.id))
        throw new Error(`${e.name} is already ticked at ${gym.name}`);
    for (const e of unticks)
      if (!gym.exerciseIds.includes(e.id))
        throw new Error(`${e.name} isn't ticked at ${gym.name}`);
    // One write a tick, so a failure partway says which landed.
    /** @type {Exercise[]} */
    const ticked = [];
    /** @type {Exercise[]} */
    const unticked = [];
    try {
      for (const e of ticks) {
        await forge.setExerciseAtGym(id, e.id, true);
        ticked.push(e);
      }
      for (const e of unticks) {
        await forge.setExerciseAtGym(id, e.id, false);
        unticked.push(e);
      }
    } catch (error) {
      if (!ticked.length && !unticked.length) throw error;
      throw new LandedPartly(error, [
        ...listed("Ticked", ticked),
        ...listed("Unticked", unticked),
        ...listed("Didn't tick", ticks.slice(ticked.length)),
        ...listed("Didn't untick", unticks.slice(unticked.length)),
      ]);
    }
    return { gym, ticks, unticks };
  },
  async describe(
    /** @type {{ gym: Gym, ticks: Exercise[], unticks: Exercise[] }} */ {
      gym,
      ticks,
      unticks,
    },
  ) {
    return {
      heading: `Gym exercises: ${gym.name}`,
      groups: [
        ...(ticks.length
          ? [{ title: "Ticked", lines: ticks.map((e) => e.name) }]
          : []),
        ...(unticks.length
          ? [{ title: "Unticked", lines: unticks.map((e) => e.name) }]
          : []),
      ],
    };
  },
};

/**
 * A new gym (#197; spec #191): a name and the exercises available there,
 * made by the core's `createGym`, then each ticked in turn by
 * `setExerciseAtGym`, as the app's Gyms and gym pages make one.
 * @type {ChangeKind}
 */
const newGym = {
  check(change) {
    if ("id" in change)
      throw new Error("A new gym has no id: making it gives it its own");
    if (typeof change.name !== "string" || !Array.isArray(change.exercises))
      throw new Error("A new gym has a name and a list of exercises");
    for (const ref of change.exercises)
      checkExercise(ref, "Each exercise is named by its id");
  },
  dependsOn: (change) => customExercises(refsIn(change)),
  // A new gym is a new document: there's nothing to back up.
  writes: () => [],
  async make(change, forge, run) {
    const name = /** @type {string} */ (change.name);
    // Names are unique per kind (spec #191), so a rerun can't duplicate a
    // gym; the core itself allows two of a name.
    const taken = name.trim() && named(await forge.listGyms(), name);
    if (taken) throw new Error(`${taken.name} is already a gym`);
    const exercises = await namedExercises(
      exercisesIn(change, "exercises"),
      forge,
      run,
    );
    refuseNamedTwice(exercises);
    const gym = await forge.createGym(name);
    // The gym is made: a failure from here on lands the change partly.
    /** @type {Exercise[]} */
    const ticked = [];
    try {
      for (const e of exercises) {
        await forge.setExerciseAtGym(gym.id, e.id, true);
        ticked.push(e);
      }
    } catch (error) {
      throw new LandedPartly(error, [
        ticked.length
          ? `Made the gym and ticked ${names(ticked)}.`
          : "Made the gym, with nothing ticked.",
        ...listed("Didn't tick", exercises.slice(ticked.length)),
      ]);
    }
    return { gym, exercises };
  },
  async describe(
    /** @type {{ gym: Gym, exercises: Exercise[] }} */ { gym, exercises },
  ) {
    return {
      heading: `New gym: ${gym.name}`,
      groups: [
        exercises.length
          ? { title: "Ticked", lines: exercises.map((e) => e.name) }
          : { lines: ["No exercises ticked yet"] },
      ],
    };
  },
};

/** @type {Record<string, ChangeKind>} */
export const CHANGE_KINDS = {
  "new-routine": newRoutine,
  "change-routine": changeRoutine,
  "new-custom-exercise": newCustomExercise,
  "exercise-settings": exerciseSettings,
  "new-gym": newGym,
  "gym-exercises": gymExercises,
};

/** @typedef {"exercises" | "tick" | "untick"} GymList */

/** @type {GymList[]} */
const GYM_LISTS = ["exercises", "tick", "untick"];

/**
 * The gym a gym exercises change names, once `check` has passed.
 * @param {Change} change
 * @returns {DocRef[]}
 */
function gymOf(change) {
  return [{ collection: "gyms", id: /** @type {string} */ (change.id) }];
}

/**
 * The exercises a gym change names in one of its lists (a new gym's
 * exercises, or the ticks or unticks at a gym), once `check` has passed.
 * @param {Change} change
 * @param {GymList} list
 */
const exercisesIn = (change, list) =>
  /** @type {unknown[]} */ (change[list] ?? []);

/**
 * Every exercise a gym change names.
 * @param {Change} change
 */
const refsIn = (change) =>
  GYM_LISTS.flatMap((list) => exercisesIn(change, list));

/**
 * The exercises named, each found in Forge.
 * @param {unknown[]} refs
 * @param {Forge} forge
 * @param {Run} run
 */
const namedExercises = (refs, forge, run) =>
  Promise.all(refs.map((ref) => exerciseOf(ref, forge, run)));

/** @param {Exercise[]} exercises as "Barbell Row, Lat Pulldown" */
const names = (exercises) => exercises.map((e) => e.name).join(", ");

/**
 * "Ticked: Barbell Row, Lat Pulldown.", or nothing for no exercises.
 * @param {string} title
 * @param {Exercise[]} exercises
 */
const listed = (title, exercises) =>
  exercises.length ? [`${title}: ${names(exercises)}.`] : [];

/**
 * Throws when an exercise is named twice among `exercises`.
 * @param {Exercise[]} exercises
 */
function refuseNamedTwice(exercises) {
  const seen = new Set();
  for (const e of exercises) {
    if (seen.has(e.id)) throw new Error(`${e.name} is named twice`);
    seen.add(e.id);
  }
}

/**
 * Whether an exercise is cardio, whose unit is its distance's and which
 * has no load to step (#19).
 * @param {Exercise} exercise
 */
const isCardio = (exercise) =>
  TYPE_RULES[exercise.type].measure === "time-distance";

/**
 * One setting as the exercise page shows it: "kg", "2.5 kg", "2 min",
 * a quoted note or "none". A cardio exercise's unit is its distance's.
 * @param {keyof typeof SETTING_LABELS} setting
 * @param {ExerciseSettings} settings
 * @param {boolean} cardio
 */
function settingText(setting, settings, cardio) {
  if (setting === "unit")
    return cardio ? distanceUnit(settings.unit) : settings.unit;
  if (setting === "increment") return `${settings.increment} ${settings.unit}`;
  if (setting === "rest") return restText(settings.rest);
  return settings.note ? `"${settings.note}"` : "none";
}

/**
 * Throws unless `ref` names an exercise: by its id, or a custom exercise
 * made earlier in the proposal by { "custom": "<name>" }.
 * @param {unknown} ref
 * @param {string} what how the change names it, for the reason
 */
function checkExercise(ref, what) {
  const byName =
    isObject(ref) &&
    Object.keys(/** @type {object} */ (ref)).length === 1 &&
    typeof (/** @type {any} */ (ref).custom) === "string";
  if ((typeof ref !== "string" || !ref) && !byName)
    throw new Error(
      `${what}, or a custom exercise made earlier in the proposal by { "custom": "<name>" }`,
    );
}

/**
 * The exercise a change names, once `checkExercise` has passed: by its id,
 * or by { "custom": "<name>" } a custom exercise made earlier in this run
 * of the proposal, whatever its case and spacing. A name already in Forge
 * before the proposal is refused with its id, which is how to name it, so
 * a reference by name is always to an exercise the proposal makes.
 * @param {unknown} ref
 * @param {Forge} forge
 * @param {Run} run
 * @returns {Promise<Exercise>}
 */
async function exerciseOf(ref, forge, run) {
  if (typeof ref === "string") {
    const exercise = await forge.getExercise(ref);
    if (!exercise) throw new Error(`There's no exercise ${ref} in Forge`);
    return exercise;
  }
  const name = /** @type {{ custom: string }} */ (ref).custom.trim();
  const made = run.customs.get(name.toLowerCase());
  if (made) return made;
  const there = named(await forge.searchExercises({ query: name }), name);
  if (there)
    throw new Error(
      `${there.name} is already in Forge: name it by its id, ${there.id}`,
    );
  throw new Error(
    `There's no custom exercise ${name} made earlier in the proposal`,
  );
}

/**
 * A routine change's days, each slot naming its exercise by id: a slot
 * naming a custom exercise by name gets the id it was made with. A slot's
 * id that isn't an exercise is left for the core to refuse.
 * @param {Change} change
 * @param {Forge} forge
 * @param {Run} run
 */
function resolvedDays(change, forge, run) {
  return Promise.all(
    routineDays(change).map(async (day) => ({
      ...day,
      slots: await Promise.all(
        day.slots.map(async (slot) =>
          typeof slot.exerciseId === "string"
            ? slot
            : {
                ...slot,
                exerciseId: (await exerciseOf(slot.exerciseId, forge, run)).id,
              },
        ),
      ),
    })),
  );
}

/**
 * The custom exercises a change names by id, whose names the dry run
 * shows. One named by { "custom": "<name>" } is made by the proposal
 * itself, so there's nothing of it to depend on.
 * @param {unknown[]} refs
 * @returns {DocRef[]}
 */
function customExercises(refs) {
  return [...new Set(refs)]
    .filter((id) => typeof id === "string" && !LIBRARY_IDS.has(id))
    .map((id) => ({
      collection: "customExercises",
      id: /** @type {string} */ (id),
    }));
}

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
  for (const { exerciseId } of /** @type {any} */ (day).slots)
    if (typeof exerciseId !== "string")
      checkExercise(exerciseId, "Each slot names its exercise by its id");
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
  return customExercises(
    routineDays(change).flatMap((day) =>
      day.slots.map((slot) => slot.exerciseId),
    ),
  );
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
