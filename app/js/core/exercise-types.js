// How each exercise type is measured and judged (spec #3, Rules; #19), in
// one table so the core's rules and the screens' fields agree.

/** @import { ExerciseType } from "./types.js" */

/**
 * @typedef {object} TypeRules
 * @property {"reps" | "seconds" | "time-distance"} measure What a set counts.
 * @property {"needed" | "optional" | "none"} load Whether a set has a load:
 *   bodyweight's is added and assisted's is the assist, so 0 is a real value;
 *   cardio has none.
 * @property {boolean} effort Whether a set takes RIR and a drop-set flag: a
 *   timed hold and cardio have no reps to hold in reserve or drop.
 * @property {"heavier" | "lighter" | undefined} harder Which way double
 *   progression moves the load; none for timed holds and cardio, which get
 *   no suggested weight. Less assist is harder.
 * @property {boolean} records Whether the type has records.
 * @property {boolean} e1rm Whether it has an e1RM; not for assisted.
 * @property {boolean} withBody Whether its load counts the body weight on
 *   the workout's date, for e1RM and the heaviest record.
 */

/** @type {Record<ExerciseType, TypeRules>} */
export const TYPE_RULES = {
  "weight-reps": {
    measure: "reps",
    load: "needed",
    effort: true,
    harder: "heavier",
    records: true,
    e1rm: true,
    withBody: false,
  },
  "bodyweight-reps": {
    measure: "reps",
    load: "optional",
    effort: true,
    harder: "heavier",
    records: true,
    e1rm: true,
    withBody: true,
  },
  assisted: {
    measure: "reps",
    load: "optional",
    effort: true,
    harder: "lighter",
    records: true,
    e1rm: false,
    withBody: false,
  },
  timed: {
    measure: "seconds",
    load: "optional",
    effort: false,
    harder: undefined,
    records: false,
    e1rm: false,
    withBody: false,
  },
  cardio: {
    measure: "time-distance",
    load: "none",
    effort: false,
    harder: undefined,
    records: false,
    e1rm: false,
    withBody: false,
  },
};
