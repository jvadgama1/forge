// The Stats board's own rules (spec #80; #82): its range, which workouts
// count, and the e1RM headline. The Forge core reads the store and applies
// them; no DOM or Firestore here.

import { TYPE_RULES } from "./exercise-types.js";
import { MUSCLE_GROUPS, REGIONS } from "./muscle-groups.js";
import { fromKg, inKg, plusBody } from "./units.js";

/** @import { Exercise, Load, MuscleGroup, Region, Workout, WorkoutSet } from "./types.js" */

/** @typedef {"4w" | "12w" | "1y"} RangeId */

/**
 * A mark on the board that stands for several workouts (#84): a muscle
 * group's hard-sets bar, in the range it was drawn for, or a calendar day
 * (#86).
 * @typedef {{ kind: "hard-sets", muscleGroup: MuscleGroup, range: RangeId }
 *   | { kind: "day", date: string }
 *   | { kind: "tonnage", week: string }
 *   | { kind: "region", region: Region, week: string }} Mark
 */

/**
 * The stretch of time the board covers: whole Monday-to-Sunday weeks,
 * ending with the current, partial week (spec #80, Rules: Range).
 * @typedef {{ id: RangeId, weeks: number, from: string, to: string }} Range
 */

/** @type {Record<RangeId, number>} */
const WEEKS = { "4w": 4, "12w": 12, "1y": 52 };

/**
 * Whether text names a range, as a route may (#84).
 * @param {string | undefined} id
 * @returns {id is RangeId}
 */
export const isRangeId = (id) => id !== undefined && Object.hasOwn(WEEKS, id);

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
  for (const workout of workouts)
    for (const [id, n] of hardSetsIn(workout, exerciseOf))
      total.set(id, (total.get(id) ?? 0) + n);
  const trainingWeeks = trainingWeeksOf(workouts);
  return {
    trainingWeeks,
    muscleGroups: BY_REGION.map(({ id, label, region }) => {
      const perWeek = perWeekOf(total.get(id) ?? 0, trainingWeeks);
      return { id, label, region, perWeek, band: bandOf(perWeek) };
    }),
  };
}

/**
 * The workouts behind a muscle group's bar (#84; spec #80, story 52),
 * newest first, each with the hard sets it gave; those with none are left
 * out. Their values add up to `total`, which over the training weeks is
 * the bar's number.
 * @param {Workout[]} workouts the counted ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {MuscleGroup} muscleGroup
 */
export function hardSetsBehind(workouts, exerciseOf, muscleGroup) {
  const each = workouts
    .map((w) => ({
      workoutId: w.id,
      date: w.date,
      gymId: w.gymId,
      value: hardSetsIn(w, exerciseOf).get(muscleGroup) ?? 0,
    }))
    .filter((w) => w.value > 0);
  const total = each.reduce((sum, w) => sum + w.value, 0);
  const trainingWeeks = trainingWeeksOf(workouts);
  return {
    workouts: each,
    total,
    trainingWeeks,
    perWeek: perWeekOf(total, trainingWeeks),
  };
}

/**
 * The calendar card (#86; spec #80, Rules: Calendar levels): every day of
 * the range, Monday first, shaded by its hard sets across its workouts. A
 * day with a workout is level 1 at least, so a cardio-only day still shows
 * as trained; days after today are still to come.
 * @param {Workout[]} workouts the counted ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {Range} range
 * @param {string} today YYYY-MM-DD
 */
export function calendarCard(workouts, exerciseOf, range, today) {
  /** @type {Map<string, Workout[]>} */
  const byDate = new Map();
  for (const w of workouts)
    byDate.set(w.date, [...(byDate.get(w.date) ?? []), w]);
  const days = [];
  for (let day = dayNumber(range.from); day <= dayNumber(range.to); day++) {
    const date = dateOf(day);
    const dayWorkouts = byDate.get(date) ?? [];
    const hardSets = dayWorkouts.reduce(
      (n, w) => n + hardSetCount(w, exerciseOf),
      0,
    );
    days.push({
      date,
      level: dayWorkouts.length === 0 ? 0 : levelOf(hardSets),
      hardSets,
      workoutIds: dayWorkouts.map((w) => w.id),
      future: date > today,
    });
  }
  return { workouts: workouts.length, trainingDays: byDate.size, days };
}

/**
 * The workouts behind a calendar day (#86), newest first, each with its
 * hard sets.
 * @param {Workout[]} workouts the day's finished ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 */
export function dayBehind(workouts, exerciseOf) {
  const each = workouts.map((w) => ({
    workoutId: w.id,
    date: w.date,
    gymId: w.gymId,
    value: hardSetCount(w, exerciseOf),
  }));
  return { workouts: each, total: each.reduce((n, w) => n + w.value, 0) };
}

// The hard sets a day needs for each level above 1 on the calendar (spec
// #80, Rules: Calendar levels): 10 for 2, 20 for 3, 30 for 4.
export const CALENDAR_LEVELS = [10, 20, 30];

/**
 * A day with a workout's level on the heat-map ramp, 1 to 4.
 * @param {number} hardSets
 */
const levelOf = (hardSets) =>
  1 + CALENDAR_LEVELS.filter((least) => hardSets >= least).length;

/**
 * Each of a workout's exercises with its hard sets; exercises no longer in
 * the library are left out.
 * @param {Workout} workout
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @returns {[Exercise, number][]}
 */
function hardEntries(workout, exerciseOf) {
  /** @type {[Exercise, number][]} */
  const each = [];
  for (const { exerciseId, sets } of workout.entries) {
    const exercise = exerciseOf(exerciseId);
    if (exercise)
      each.push([exercise, sets.filter((s) => isHardSet(s, exercise)).length]);
  }
  return each;
}

/**
 * How many hard sets a workout has, each counted once whatever muscle
 * groups it works: the calendar's measure of a day (#86), where the
 * muscle-group weights would double-count a set.
 * @param {Workout} workout
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 */
const hardSetCount = (workout, exerciseOf) =>
  hardEntries(workout, exerciseOf).reduce((n, [, hard]) => n + hard, 0);

/**
 * One workout's hard sets by muscle group: 1 a set for each primary, 0.5
 * for each secondary.
 * @param {Workout} workout
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 */
function hardSetsIn(workout, exerciseOf) {
  /** @type {Map<MuscleGroup, number>} */
  const counts = new Map();
  /** @param {MuscleGroup} id @param {number} n */
  const add = (id, n) => counts.set(id, (counts.get(id) ?? 0) + n);
  for (const [exercise, hard] of hardEntries(workout, exerciseOf)) {
    for (const id of exercise.primary) add(id, hard);
    for (const id of exercise.secondary) add(id, hard * 0.5);
  }
  return counts;
}

/**
 * How many training weeks the workouts span (GLOSSARY: Training week).
 * @param {Workout[]} workouts
 */
const trainingWeeksOf = (workouts) =>
  new Set(workouts.map((w) => mondayOf(w.date))).size;

/**
 * A total per training week, to 0.1, so the number shown and its band
 * always agree.
 * @param {number} total
 * @param {number} trainingWeeks
 */
const perWeekOf = (total, trainingWeeks) =>
  trainingWeeks ? Math.round((total / trainingWeeks) * 10) / 10 : 0;

/**
 * Whether a date falls in the week starting on `monday`.
 * @param {string} date YYYY-MM-DD
 * @param {string} monday YYYY-MM-DD
 */
export const inWeek = (date, monday) => mondayOf(date) === monday;

/**
 * The unit tonnage is given in (spec #80, Rules: Tonnage): that of the most
 * recently logged set with a load, or lb with none.
 * @param {Workout[]} workouts
 * @returns {Load["unit"]}
 */
export function displayUnit(workouts) {
  let latest = { loggedAt: "", unit: /** @type {Load["unit"]} */ ("lb") };
  for (const w of workouts)
    for (const { sets } of w.entries)
      for (const set of sets)
        if (set.load > 0 && set.loggedAt > latest.loggedAt) latest = set;
  return latest.unit;
}

/**
 * A workout's tonnage in kg (spec #80, Rules: Tonnage): load × reps over
 * its sets that aren't warm-ups, drop sets included. A bodyweight set's
 * load is the body weight on the day plus the added load (just the added
 * load without a body weight entry); an assisted set's is the body weight
 * less the assist, never below 0, and it's left out without a body weight.
 * Timed holds and cardio have none.
 * @param {Workout} workout
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {(date: string) => Load | undefined} bodyWeightOn
 */
function tonnageKg(workout, exerciseOf, bodyWeightOn) {
  const body = bodyWeightOn(workout.date);
  let kg = 0;
  for (const { exerciseId, sets } of workout.entries) {
    const type = exerciseOf(exerciseId)?.type;
    const rules = type && TYPE_RULES[type];
    if (!rules || rules.measure !== "reps") continue;
    for (const set of sets) {
      if (set.warmUp) continue;
      const load = rules.withBody
        ? inKg(body ? plusBody(set, body) : set)
        : rules.harder === "lighter"
          ? body && Math.max(0, inKg(body) - inKg(set))
          : inKg(set);
      if (load !== undefined) kg += load * (set.reps ?? 0);
    }
  }
  return kg;
}

/**
 * Each workout's tonnage in `unit`, whole; a week's is the sum of its
 * workouts', so the list behind its bar adds up to it.
 * @param {Workout} workout
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {(date: string) => Load | undefined} bodyWeightOn
 * @param {Load["unit"]} unit
 */
const tonnageOf = (workout, exerciseOf, bodyWeightOn, unit) =>
  Math.round(fromKg(tonnageKg(workout, exerciseOf, bodyWeightOn), unit));

/**
 * The tonnage card (#87; spec #80, stories 36–41): every week of the
 * range, Monday first, with each of its workouts' tonnage.
 * @param {Workout[]} workouts the counted ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {(date: string) => Load | undefined} bodyWeightOn
 * @param {Range} range
 * @param {Load["unit"]} unit
 */
export function tonnageCard(workouts, exerciseOf, bodyWeightOn, range, unit) {
  const weeks = [];
  for (let day = dayNumber(range.from); day <= dayNumber(range.to); day += 7) {
    const start = dateOf(day);
    const each = workouts
      .filter((w) => inWeek(w.date, start))
      .map((w) => ({
        workoutId: w.id,
        date: w.date,
        tonnage: tonnageOf(w, exerciseOf, bodyWeightOn, unit),
      }));
    weeks.push({
      start,
      tonnage: each.reduce((n, w) => n + w.tonnage, 0),
      workouts: each,
    });
  }
  return { unit, weeks };
}

/**
 * The workouts behind a week's tonnage bar (#87), newest first, each with
 * its tonnage.
 * @param {Workout[]} workouts the week's finished ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {(date: string) => Load | undefined} bodyWeightOn
 * @param {Load["unit"]} unit
 */
export function tonnageBehind(workouts, exerciseOf, bodyWeightOn, unit) {
  const each = workouts.map((w) => ({
    workoutId: w.id,
    date: w.date,
    gymId: w.gymId,
    value: tonnageOf(w, exerciseOf, bodyWeightOn, unit),
  }));
  return { unit, workouts: each, total: each.reduce((n, w) => n + w.value, 0) };
}

/**
 * One workout's hard sets by region: its muscle groups' hard sets, each
 * counted toward the region it's in (spec #80, Rules: Region split).
 * @param {Workout} workout
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 */
function regionHardSets(workout, exerciseOf) {
  /** @type {Map<Region, number>} */
  const byRegion = new Map();
  for (const [id, n] of hardSetsIn(workout, exerciseOf)) {
    const { region } = MUSCLE_GROUP_BY_ID.get(id) ?? {};
    if (region) byRegion.set(region, (byRegion.get(region) ?? 0) + n);
  }
  return byRegion;
}

const MUSCLE_GROUP_BY_ID = new Map(MUSCLE_GROUPS.map((m) => [m.id, m]));

/**
 * The region split card (#88; spec #80, stories 42–44): every week of the
 * range, Monday first, with its hard sets by region in the fixed order
 * Push, Pull, Legs, Core; a week with no workouts is present and empty.
 * @param {Workout[]} workouts the counted ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {Range} range
 */
export function regionSplitCard(workouts, exerciseOf, range) {
  const weeks = [];
  for (let day = dayNumber(range.from); day <= dayNumber(range.to); day += 7) {
    const start = dateOf(day);
    const weekWorkouts = workouts.filter((w) => inWeek(w.date, start));
    const each = weekWorkouts.map((w) => ({
      id: w.id,
      byRegion: regionHardSets(w, exerciseOf),
    }));
    // Each region's hard sets, and the workouts that gave them, so its part
    // of the bar opens them (#84).
    const regions = REGIONS.map(({ id, label }) => {
      const giving = each.filter((w) => (w.byRegion.get(id) ?? 0) > 0);
      return {
        id,
        label,
        hardSets: giving.reduce((n, w) => n + (w.byRegion.get(id) ?? 0), 0),
        workoutIds: giving.map((w) => w.id),
      };
    });
    weeks.push({
      start,
      regions,
      total: regions.reduce((n, r) => n + r.hardSets, 0),
    });
  }
  return { weeks };
}

/**
 * The workouts behind a region's part of a week (#88), newest first, each
 * with its hard sets in that region; those with none are left out.
 * @param {Workout[]} workouts the week's finished ones, newest first
 * @param {(exerciseId: string) => Exercise | undefined} exerciseOf
 * @param {Region} region
 */
export function regionBehind(workouts, exerciseOf, region) {
  const each = workouts
    .map((w) => ({
      workoutId: w.id,
      date: w.date,
      gymId: w.gymId,
      value: regionHardSets(w, exerciseOf).get(region) ?? 0,
    }))
    .filter((w) => w.value > 0);
  return { workouts: each, total: each.reduce((n, w) => n + w.value, 0) };
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
