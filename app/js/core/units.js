// Loads in either unit, compared in kg, so a unit change doesn't fake a
// record (spec #3) or a jump in tonnage (#87).

/** @import { Load } from "./types.js" */

const KG_PER_LB = 0.45359237;

/** @param {Load} load */
export const inKg = ({ load, unit }) =>
  unit === "kg" ? load : load * KG_PER_LB;

/**
 * @param {number} kg
 * @param {Load["unit"]} unit
 */
export const fromKg = (kg, unit) => (unit === "kg" ? kg : kg / KG_PER_LB);
