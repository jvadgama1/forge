// The Stats board's own rules (spec #80; #82): its range, which workouts
// count, and the e1RM headline. The Forge core reads the store and applies
// them; no DOM or Firestore here.

import { TYPE_RULES } from "./exercise-types.js";
import { MUSCLE_GROUPS, REGIONS } from "./muscle-groups.js";

/** @import { Exercise, MuscleGroup, Workout, WorkoutSet } from "./types.js" */

/** @typedef {"4w" | "12w" | "1y"} RangeId */

/**
 * The stretch of time the board covers: whole Monday-to-Sunday weeks,
 * ending with the current, partial week (spec #80, Rules: Range).
 * @typedef {{ id: RangeId, weeks: number, from: string, to: string }} Range
 */

/** @type {Record<RangeId, number>} */
const WEEKS = { "4w": 4, "12w": 12, "1y": 52 };

/** @type {RangeId} */
export const DEFAULT_RANGE = "12w";

const DAY = 86_400_000;

/**
 * A date's day count from the epoch, so date sums skip time zones and
 * daylight saving.
 * @param {string} date YYYY-MM-DD
 */
const dayNumber = (date) => Date.parse(`${date}T00:00:00Z`) / DAY;

/** @param {number} day */
const dateOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/**
 * Whether a workout counts on the board (spec #80, Rules: Counted
 * workouts): finished, and dated in the range, back-dated or not.
 * @param {Range} range
 * @returns {(workout: Workout) => boolean}
 */
export const countsIn = (range) => (workout) =>
  Boolean(workout.finishedAt) &&
  workout.date >= range.from &&
  workout.date <= range.to;

/**
 * The e1RM card's headline (spec #80, Rules: e1RM trend): the latest point
 * as the hero, and the change since the range's first point over the whole
 * weeks between them; no change with one point.
 * @param {{ date: string, value: number }[]} points oldest first
 * @returns {{ latest?: number, change?: { value: number, weeks: number } }}
 */
export function e1rmHeadline(points) {
  const first = points[0];
  const last = points.at(-1);
  if (!first || !last) return {};
  return {
    latest: last.value,
    ...(points.length > 1 && {
      change: {
        value: last.value - first.value,
        weeks: Math.floor((dayNumber(last.date) - dayNumber(first.date)) / 7),
      },
    }),
  };
}

/**
 * The Monday of a date's week.
 * @param {string} date YYYY-MM-DD
 */
function mondayOf(date) {
  const day = dayNumber(date);
  // The epoch's day 0 was a Thursday; Monday is 0 here.
  return dateOf(day - ((day + 3) % 7));
}

// The weekly hard-set target band (DESIGN.md § Dashboard; spec #80).
export const TARGET = { min: 10, max: 20 };

// The muscle groups by region, then in GLOSSARY.md's order within each.
const BY_REGION = REGIONS.flatMap((region) =>
  MUSCLE_GROUPS.filter((m) => m.region === region.id),
);

/**
 * Where a week's hard sets sit against the target band.
 * @param {number} perWeek
 * @returns {"under" | "in" | "over"}
 */
const bandOf = (perWeek) =>
  perWeek < TARGET.min ? "under" : perWeek > TARGET.max ? "over" : "in";

/**
 * Whether a set is a hard set (GLOSSARY: Hard set; the maintainer's
 * decision on #80): not a warm-up, not logged at RIR 4+ (4 means "4 or
 * more"; no RIR still counts), and not cardio. Drop sets count.
 * @param {WorkoutSet} set
 * @param {Exercise} exercise
 */
const isHardSet = (set, exercise) =>
  !set.warmUp &&
  (set.rir ?? 0) < 4 &&
  TYPE_RULES[exercise.type].kind !== "cardio";

/**
 * Hard sets per week for every muscle group (spec #80, Rules: Hard sets,
 * Hard sets per week): each set counts 1 for each primary muscle group and
 * 0.5 for each secondary, totalled over the counted workouts and divided by
 * the training weeks (GLOSSARY: Training week), so a break doesn't lower
 * it.
 * @param {Workout[]} workouts the counted ones
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 */
export function hardSetsCard(workouts, exerciseOf) {
  /** @type {Map<MuscleGroup, number>} */
  const total = new Map();
  /** @param {MuscleGroup} id @param {number} n */
  const add = (id, n) => total.set(id, (total.get(id) ?? 0) + n);
  for (const workout of workouts)
    for (const { exerciseId, sets } of workout.entries) {
      const exercise = exerciseOf(exerciseId);
      if (!exercise) continue;
      const hard = sets.filter((set) => isHardSet(set, exercise)).length;
      for (const id of exercise.primary) add(id, hard);
      for (const id of exercise.secondary) add(id, hard * 0.5);
    }
  const trainingWeeks = new Set(workouts.map((w) => mondayOf(w.date))).size;
  return {
    trainingWeeks,
    muscleGroups: BY_REGION.map(({ id, label, region }) => {
      // To 0.1, so the number shown and its band always agree.
      const perWeek = trainingWeeks
        ? Math.round(((total.get(id) ?? 0) / trainingWeeks) * 10) / 10
        : 0;
      return { id, label, region, perWeek, band: bandOf(perWeek) };
    }),
  };
}

/**
 * The range ending with the week that holds `today`.
 * @param {RangeId} id
 * @param {string} today YYYY-MM-DD
 * @returns {Range}
 */
export function rangeFor(id, today) {
  const monday = dayNumber(mondayOf(today));
  const weeks = WEEKS[id];
  return {
    id,
    weeks,
    from: dateOf(monday - (weeks - 1) * 7),
    to: dateOf(monday + 6),
  };
}
