// Loads in either unit, compared in kg, so a unit change doesn't fake a
// record (spec #3) or a jump in tonnage (#87).

/** @import { Load, WorkoutSet } from "./types.js" */

const KG_PER_LB = 0.45359237;

/** @param {Load} load */
export const inKg = ({ load, unit }) =>
  unit === "kg" ? load : load * KG_PER_LB;

/**
 * @param {number} kg
 * @param {Load["unit"]} unit
 */
export const fromKg = (kg, unit) => (unit === "kg" ? kg : kg / KG_PER_LB);

/**
 * A bodyweight set's load (#19): the body weight plus the added load, in
 * the set's unit, to 0.1 across units. Records and tonnage (#87) both
 * count it.
 * @param {Pick<WorkoutSet, "load" | "unit">} set
 * @param {Load} body
 * @returns {Load}
 */
export function plusBody(set, body) {
  if (body.unit === set.unit)
    return { load: body.load + set.load, unit: set.unit };
  const total = fromKg(inKg(body) + inKg(set), set.unit);
  return { load: Math.round(total * 10) / 10, unit: set.unit };
}
