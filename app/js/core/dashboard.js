// The Stats board's own rules (spec #80; #82): its range, which workouts
// count, and the e1RM headline. The Forge core reads the store and applies
// them; no DOM or Firestore here.

/** @import { Workout } from "./types.js" */

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
 * The range ending with the week that holds `today`.
 * @param {RangeId} id
 * @param {string} today YYYY-MM-DD
 * @returns {Range}
 */
export function rangeFor(id, today) {
  const day = dayNumber(today);
  // The epoch's day 0 was a Thursday; Monday is 0 here.
  const monday = day - ((day + 3) % 7);
  const weeks = WEEKS[id];
  return {
    id,
    weeks,
    from: dateOf(monday - (weeks - 1) * 7),
    to: dateOf(monday + 6),
  };
}
