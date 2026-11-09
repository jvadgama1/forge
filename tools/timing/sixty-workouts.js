// Sixty made-up past workouts for timing the Stats tab (#131), nothing
// personal (ADR-0005): twenty weeks of push, pull and legs on Monday,
// Wednesday and Friday, loads creeping up, with warm-ups, bodyweight sets
// and planks, and a body weight entry each month.

/** @import { Workout, WorkoutSet } from "../../app/js/core/types.js" */

const DAY = 86_400_000;

/** @param {number} day days from the epoch */
const dateOf = (day) => new Date(day * DAY).toISOString().slice(0, 10);

/**
 * Each day's exercises: an id and its sets as [load, reps, seconds?], the
 * load growing by `step` a week.
 * @type {Array<Array<[string, number, number, Array<[number, number, number?]>]>>}
 */
const DAYS = [
  [
    [
      "barbell-bench-press",
      135,
      2.5,
      [
        [-90, 10],
        [0, 8],
        [0, 8],
        [0, 7],
      ],
    ],
    [
      "incline-db-press",
      45,
      1,
      [
        [0, 10],
        [0, 10],
        [0, 9],
      ],
    ],
    [
      "dip",
      0,
      1,
      [
        [0, 10],
        [0, 9],
        [0, 8],
      ],
    ],
    [
      "triceps-pushdown",
      50,
      1,
      [
        [0, 12],
        [0, 12],
        [0, 11],
      ],
    ],
    [
      "db-lateral-raise",
      15,
      0.25,
      [
        [0, 15],
        [0, 15],
        [0, 14],
        [0, 12],
      ],
    ],
  ],
  [
    [
      "lat-pulldown",
      110,
      2,
      [
        [0, 10],
        [0, 10],
        [0, 9],
        [0, 8],
      ],
    ],
    [
      "pull-up",
      0,
      0.5,
      [
        [0, 8],
        [0, 7],
        [0, 6],
      ],
    ],
    [
      "seated-cable-row",
      100,
      2,
      [
        [0, 10],
        [0, 10],
        [0, 9],
      ],
    ],
    [
      "face-pull",
      35,
      0.5,
      [
        [0, 15],
        [0, 15],
        [0, 15],
      ],
    ],
    [
      "db-curl",
      25,
      0.5,
      [
        [0, 12],
        [0, 11],
        [0, 10],
      ],
    ],
  ],
  [
    [
      "barbell-back-squat",
      185,
      5,
      [
        [-100, 8],
        [0, 6],
        [0, 6],
        [0, 5],
      ],
    ],
    [
      "romanian-deadlift",
      135,
      2.5,
      [
        [0, 10],
        [0, 10],
        [0, 8],
      ],
    ],
    [
      "leg-press",
      270,
      5,
      [
        [0, 12],
        [0, 12],
        [0, 10],
      ],
    ],
    [
      "seated-leg-curl",
      80,
      1,
      [
        [0, 12],
        [0, 12],
        [0, 11],
      ],
    ],
    [
      "plank",
      0,
      0,
      [
        [0, 0, 60],
        [0, 0, 60],
        [0, 0, 45],
      ],
    ],
  ],
];

/**
 * Sixty finished workouts, the last on the Friday before `today`, newest
 * last, with the body weights and settings the board reads.
 * @param {string} today YYYY-MM-DD, a Sunday
 */
export function sixtyWorkouts(today) {
  const sunday = Date.parse(`${today}T00:00:00Z`) / DAY;
  const firstMonday = sunday - 6 - 19 * 7;
  /** @type {Workout[]} */
  const workouts = [];
  for (let week = 0; week < 20; week++)
    DAYS.forEach((exercises, i) => {
      const date = dateOf(firstMonday + week * 7 + i * 2);
      /** @param {number} minute */
      const at = (minute) =>
        new Date(Date.parse(`${date}T18:00:00Z`) + minute * 60_000)
          .toISOString()
          .replace(/\.\d+Z$/, ".000Z");
      let minute = 0;
      workouts.push({
        id: `w-${date}`,
        date,
        startedAt: at(0),
        finishedAt: at(70),
        gymId: "gym-work",
        entries: exercises.map(([exerciseId, base, step, sets]) => ({
          exerciseId,
          sets: sets.map(([less, reps, seconds], n) => {
            /** @type {WorkoutSet} */
            const set = {
              load: Math.max(0, base + step * week + less),
              unit: "lb",
              ...(seconds === undefined ? { reps } : { seconds }),
              loggedAt: at(++minute * 3),
            };
            if (less < 0 && n === 0) set.warmUp = true;
            return set;
          }),
        })),
      });
    });
  return {
    gyms: [{ id: "gym-work", name: "Work", exerciseIds: [] }],
    settings: [{ id: "user", lastGymId: "gym-work" }],
    bodyWeights: [0, 1, 2, 3, 4].map((month) => {
      const date = dateOf(firstMonday + month * 28);
      return {
        id: `bw-${date}`,
        date,
        load: 180 + month * 0.8,
        unit: "lb",
        loggedAt: `${date}T07:30:00.000Z`,
      };
    }),
    workouts,
  };
}
