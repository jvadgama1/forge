// How each exercise type's sets read and are entered (#19), so the logging
// screen, history and the past-workout editor show a set the same way. The
// rules (what's measured, what's optional) come from the core's TYPE_RULES.
import { TYPE_RULES } from "../core/exercise-types.js";
import { pad2 } from "./screen.js";

/** @import { ExerciseType, Load, Measure, SetInput } from "../core/types.js" */

/**
 * Seconds as a clock: 45 → "0:45", 1200 → "20:00".
 * @param {number} seconds
 */
export const clock = (seconds) =>
  `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;

/**
 * A set's load as its type reads it: "135 lb", "BW + 25 lb" (or "BW" with
 * nothing added), "40 lb assist".
 * @param {Load} load
 * @param {ExerciseType} type
 */
export function loadText({ load, unit }, type) {
  if (type === "bodyweight-reps") return load ? `BW + ${load} ${unit}` : "BW";
  if (type === "assisted") return `${load} ${unit} assist`;
  return `${load} ${unit}`;
}

/**
 * A set's measure in full: "135 lb × 8", "BW + 25 lb × 8", "40 lb assist ×
 * 8", "0:45" or "70 lb × 0:45", "20:00" or "20:00 · 2.5 mi". A set logged
 * before its type had a measure of its own reads as weight × reps.
 * @param {Measure} set
 * @param {ExerciseType} type
 */
export function setText(set, type) {
  if (set.seconds === undefined) return `${loadText(set, type)} × ${set.reps}`;
  const time = clock(set.seconds);
  if (type === "cardio")
    return set.distance === undefined
      ? time
      : `${time} · ${set.distance} ${set.distanceUnit}`;
  return set.load ? `${set.load} ${set.unit} × ${time}` : time;
}

/**
 * A set's measure in short, for the last-workout line: "135×8", "BW×12",
 * "BW+25×8", "−40×8" (assist takes weight off), "0:45", "70×0:45"; cardio
 * reads in full.
 * @param {Measure} set
 * @param {ExerciseType} type
 */
export function shortText(set, type) {
  if (set.seconds === undefined) {
    const load =
      type === "bodyweight-reps"
        ? set.load
          ? `BW+${set.load}`
          : "BW"
        : type === "assisted"
          ? `−${set.load}`
          : `${set.load}`;
    return `${load}×${set.reps}`;
  }
  if (type === "cardio") return setText(set, type);
  const time = clock(set.seconds);
  return set.load ? `${set.load}×${time}` : time;
}

/**
 * One number a set is entered with.
 * @typedef {object} Field
 * @property {string} label Under or beside the number: "lb", "Reps".
 * @property {string} name Its accessible name: "Load in lb".
 * @property {string} what What its steppers change, as in "Increase load".
 * @property {"decimal" | "numeric"} mode The keyboard to show.
 * @property {number} step What − and + move it by.
 * @property {number} min The least − goes to.
 * @property {boolean} optional Blank leaves it out, as 0 or none.
 * @property {(set: Omit<Measure, "unit">) => string} show The field's value
 *   for a set to start from.
 * @property {(value: number) => SetInput} read The set's fields from the
 *   number typed.
 */

/**
 * The numbers a set of the type is entered with (#19).
 * @param {ExerciseType} type
 * @param {Load["unit"]} unit
 * @param {number} increment The load's step.
 * @returns {Field[]}
 */
export function fieldsFor(type, unit, increment) {
  const optionalLoad = TYPE_RULES[type].load !== "needed";
  /**
   * @param {string} label
   * @param {string} name
   * @param {string} what
   * @returns {Field}
   */
  const load = (label, name, what) => ({
    label,
    name,
    what,
    mode: "decimal",
    step: increment,
    min: 0,
    optional: optionalLoad,
    show: (set) => String(set.load),
    read: (value) => ({ load: value }),
  });
  /** @type {Field} */
  const reps = {
    label: "Reps",
    name: "Reps",
    what: "reps",
    mode: "numeric",
    step: 1,
    min: 1,
    optional: false,
    show: (set) => (set.reps === undefined ? "" : String(set.reps)),
    read: (value) => ({ reps: value }),
  };
  switch (type) {
    case "bodyweight-reps":
      return [
        load(`Added ${unit}`, `Added load in ${unit}`, "added load"),
        reps,
      ];
    case "assisted":
      return [load(`Assist ${unit}`, `Assist in ${unit}`, "assist"), reps];
    case "timed":
      return [
        load(unit, `Load in ${unit}`, "load"),
        {
          label: "Seconds",
          name: "Seconds",
          what: "seconds",
          mode: "numeric",
          step: 5,
          min: 1,
          optional: false,
          show: (set) => (set.seconds === undefined ? "" : String(set.seconds)),
          read: (value) => ({ seconds: value }),
        },
      ];
    case "cardio":
      return [
        {
          label: "Minutes",
          name: "Minutes",
          what: "minutes",
          mode: "decimal",
          step: 1,
          min: 0,
          optional: false,
          show: (set) =>
            set.seconds === undefined
              ? ""
              : String(Math.round((set.seconds / 60) * 100) / 100),
          read: (value) => ({ seconds: Math.round(value * 60) }),
        },
        {
          // The core takes a distance as miles until #21.
          label: "mi",
          name: "Distance in mi",
          what: "distance",
          mode: "decimal",
          step: 0.1,
          min: 0,
          optional: true,
          show: (set) =>
            set.distance === undefined ? "" : String(set.distance),
          read: (value) => ({ distance: value }),
        },
      ];
    default:
      return [load(unit, `Load in ${unit}`, "load"), reps];
  }
}

/**
 * The set the fields hold: blank optional fields are left out, and a
 * blank required one reads as no number, which the core refuses with a
 * message.
 * @param {Field[]} fields
 * @param {number[]} values as typed, NaN when blank
 * @returns {SetInput}
 */
export function readFields(fields, values) {
  return Object.assign(
    {},
    ...fields.map((field, i) =>
      field.optional && Number.isNaN(values[i]) ? {} : field.read(values[i]),
    ),
  );
}
