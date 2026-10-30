// Every shot `npm run shots` takes. A new screen is one entry: a file name,
// who is signed in, the route, and any made-up data to start with (ADR-0005).

/** @import { Page } from "playwright-core" */

/**
 * Who the stubbed sign-in reports (tools/shots/stubs/firebase-sdk.js).
 * @typedef {"checking" | "signed-out" | "not-owner" | "owner"} SignIn
 */

/**
 * @typedef {object} Shot
 * @property {string} name The image's file name, without `.png`.
 * @property {SignIn} as
 * @property {string} [route] The hash route, for the owner's screens.
 * @property {Record<string, object[]>} [seed] Documents the in-memory store starts with, by collection.
 * @property {(page: Page) => Promise<void>} [steps] Interactions to run before the shot.
 */

/** Three made-up gyms, Work last used. */
const GYMS = {
  gyms: [
    {
      id: "gym-apartment",
      name: "Apartment",
      exerciseIds: ["push-up", "db-curl", "goblet-squat", "plank"],
    },
    {
      id: "gym-home",
      name: "Home",
      exerciseIds: ["db-bench-press", "db-shoulder-press", "db-curl", "plank"],
    },
    {
      id: "gym-work",
      name: "Work",
      exerciseIds: [
        "barbell-bench-press",
        "incline-db-press",
        "cable-fly",
        "lat-pulldown",
        "seated-cable-row",
        "leg-press",
        "leg-extension",
        "triceps-pushdown",
      ],
    },
  ],
  settings: [{ id: "user", lastGymId: "gym-work" }],
};

/**
 * Starts a freestyle workout at Work, adds Barbell Bench Press, logs 135 × 8,
 * then steps reps up and logs 135 × 9 at RIR 2: the real screens end to end.
 * @param {Page} page
 */
async function logTwoSets(page) {
  await page.getByRole("button", { name: "Start freestyle" }).click();
  await page.getByRole("link", { name: "Add exercise" }).click();
  await page.getByRole("button", { name: /Barbell Bench Press/ }).click();
  await page.getByRole("textbox", { name: "Load in lb" }).fill("135");
  await page.getByRole("textbox", { name: "Reps" }).fill("8");
  await page.getByRole("button", { name: /Log set 01/ }).click();
  await page.getByRole("button", { name: /Log set 02/ }).waitFor();
  await page.getByRole("button", { name: "Increase reps" }).click();
  await page.getByRole("button", { name: "2", exact: true }).click();
  await page.getByRole("button", { name: /Log set 02/ }).click();
  await page.getByRole("button", { name: /Log set 03/ }).waitFor();
}

/**
 * Logs set 03 of the seeded workout, which starts a 90 s rest (#12), then
 * moves the fixed clock on by `seconds` and waits for the bar to show it.
 * @param {number} seconds
 * @returns {(page: Page) => Promise<void>}
 */
const logThenRest = (seconds) => async (page) => {
  await page.getByRole("button", { name: /Log set 03/ }).click();
  await page.getByRole("button", { name: /Log set 04/ }).waitFor();
  const now = await page.evaluate(() => Date.now());
  await page.clock.setFixedTime(new Date(now + seconds * 1000));
  const left = Math.max(0, 90 - seconds);
  await page
    .getByText(
      `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`,
      { exact: true },
    )
    .waitFor();
};

/**
 * A finished made-up workout of bench press sets, for history (#13).
 * @param {string} date YYYY-MM-DD
 * @param {Array<[load: number, reps: number, rir?: number]>} sets
 */
const benchDay = (date, sets) => ({
  id: `w-${date}`,
  date,
  startedAt: `${date}T18:00:00.000Z`,
  finishedAt: `${date}T19:00:00.000Z`,
  gymId: "gym-work",
  entries: [
    {
      exerciseId: "barbell-bench-press",
      sets: sets.map(([load, reps, rir]) => ({
        load,
        unit: "lb",
        reps,
        ...(rir === undefined ? {} : { rir }),
        loggedAt: `${date}T18:10:00.000Z`,
      })),
    },
  ],
});

/** A made-up workout in progress at Work: two bench sets logged, then two to go, after four earlier bench workouts. */
const WORKOUT = {
  gyms: GYMS.gyms,
  settings: [{ id: "user", lastGymId: "gym-work", workoutInProgress: "w-now" }],
  workouts: [
    benchDay("2026-09-23", [
      [125, 10],
      [125, 9],
      [125, 8],
    ]),
    benchDay("2026-09-30", [
      [130, 10],
      [130, 9],
      [130, 8],
    ]),
    benchDay("2026-10-07", [
      [130, 12],
      [130, 11],
      [130, 10],
    ]),
    benchDay("2026-10-14", [
      [135, 10],
      [135, 9],
      [135, 8, 1],
    ]),
    {
      id: "w-now",
      date: "2026-10-25",
      startedAt: "2026-10-25T18:00:00.000Z",
      gymId: "gym-work",
      entries: [
        {
          exerciseId: "barbell-bench-press",
          sets: [
            {
              load: 95,
              unit: "lb",
              reps: 10,
              warmUp: true,
              loggedAt: "2026-10-25T18:04:00.000Z",
            },
            {
              load: 135,
              unit: "lb",
              reps: 8,
              rir: 2,
              loggedAt: "2026-10-25T18:08:00.000Z",
            },
          ],
        },
        { exerciseId: "lat-pulldown", sets: [] },
        { exerciseId: "leg-press", skipped: true, sets: [] },
      ],
    },
  ],
};

/** A workout just started, nothing added yet. */
const WORKOUT_EMPTY = {
  gyms: GYMS.gyms,
  settings: [{ id: "user", lastGymId: "gym-work", workoutInProgress: "w-new" }],
  workouts: [
    {
      id: "w-new",
      date: "2026-10-25",
      startedAt: "2026-10-25T18:30:00.000Z",
      gymId: "gym-work",
      entries: [],
    },
  ],
};

/** A finished workout, with a note. */
const WORKOUT_DONE = {
  gyms: GYMS.gyms,
  settings: [{ id: "user", lastGymId: "gym-work" }],
  workouts: [
    {
      id: "w-done",
      date: "2026-10-25",
      startedAt: "2026-10-25T18:00:00.000Z",
      finishedAt: "2026-10-25T18:47:00.000Z",
      gymId: "gym-work",
      note: "Slept 5 hrs",
      entries: [
        {
          exerciseId: "barbell-bench-press",
          sets: [
            {
              load: 135,
              unit: "lb",
              reps: 8,
              loggedAt: "2026-10-25T18:08:00.000Z",
            },
            {
              load: 135,
              unit: "lb",
              reps: 7,
              loggedAt: "2026-10-25T18:12:00.000Z",
            },
          ],
        },
        {
          exerciseId: "lat-pulldown",
          sets: [
            {
              load: 120,
              unit: "lb",
              reps: 10,
              loggedAt: "2026-10-25T18:20:00.000Z",
            },
          ],
        },
      ],
    },
  ],
};

/** A local time on Friday 23 Oct 2026. */
const local = (/** @type {number} */ hour, /** @type {number} */ minute) =>
  new Date(2026, 9, 23, hour, minute).toISOString();
/**
 * A workout left in progress since Friday evening (#45): opening the Log tab
 * finishes it at its last set, 7:42 pm local time.
 */
const ABANDONED = {
  gyms: GYMS.gyms,
  settings: [{ id: "user", lastGymId: "gym-work", workoutInProgress: "w-fri" }],
  workouts: [
    {
      id: "w-fri",
      date: "2026-10-23",
      startedAt: local(19, 0),
      gymId: "gym-work",
      entries: [
        {
          exerciseId: "barbell-bench-press",
          sets: [
            { load: 135, unit: "lb", reps: 8, loggedAt: local(19, 10) },
            { load: 135, unit: "lb", reps: 7, loggedAt: local(19, 20) },
          ],
        },
        {
          exerciseId: "lat-pulldown",
          sets: [{ load: 120, unit: "lb", reps: 10, loggedAt: local(19, 42) }],
        },
        { exerciseId: "leg-press", sets: [] },
      ],
    },
  ],
};

/** A made-up three-day routine (#14), saved once. */
const PPL = {
  id: "r-ppl",
  name: "PPL Hypertrophy",
  versions: [
    {
      number: 1,
      savedAt: "2026-10-01T18:00:00.000Z",
      days: [
        {
          id: "d-push",
          name: "Push A",
          slots: [
            {
              exerciseId: "barbell-bench-press",
              sets: 3,
              repMin: 6,
              repMax: 10,
              rir: 2,
            },
            { exerciseId: "incline-db-press", sets: 3, repMin: 8, repMax: 12 },
            { exerciseId: "triceps-pushdown", sets: 3, repMin: 10, repMax: 15 },
          ],
        },
        {
          id: "d-pull",
          name: "Pull A",
          slots: [
            {
              exerciseId: "lat-pulldown",
              sets: 4,
              repMin: 8,
              repMax: 12,
              rir: 1,
            },
            { exerciseId: "seated-cable-row", sets: 3, repMin: 8, repMax: 12 },
          ],
        },
        {
          id: "d-legs",
          name: "Legs A",
          slots: [
            { exerciseId: "leg-press", sets: 4, repMin: 10, repMax: 15 },
            { exerciseId: "leg-extension", sets: 3, repMin: 12, repMax: 15 },
          ],
        },
      ],
    },
  ],
};

/** Push A done on Oct 23, so Pull A is next. */
const ROUTINE = {
  gyms: GYMS.gyms,
  settings: [{ id: "user", lastGymId: "gym-work" }],
  routines: [PPL],
  workouts: [
    {
      ...benchDay("2026-10-23", [[135, 8]]),
      routine: { routineId: "r-ppl", version: 1, dayId: "d-push" },
    },
  ],
};

/** Pull A in progress, with an exercise added on the day. */
const ROUTINE_WORKOUT = {
  ...ROUTINE,
  settings: [
    { id: "user", lastGymId: "gym-work", workoutInProgress: "w-pull" },
  ],
  workouts: [
    ...ROUTINE.workouts,
    {
      id: "w-pull",
      date: "2026-10-25",
      startedAt: "2026-10-25T18:00:00.000Z",
      gymId: "gym-work",
      routine: { routineId: "r-ppl", version: 1, dayId: "d-pull" },
      entries: [
        {
          exerciseId: "lat-pulldown",
          sets: [
            {
              load: 120,
              unit: "lb",
              reps: 10,
              rir: 2,
              loggedAt: "2026-10-25T18:05:00.000Z",
            },
          ],
        },
        { exerciseId: "seated-cable-row", sets: [] },
        { exerciseId: "cable-fly", sets: [] },
      ],
    },
  ],
};

/**
 * Push A just started, after a bench press workout on `date` that hit the
 * top of its 6–10 rep range: Oct 20 suggests going up, Oct 1 a comeback
 * (#15).
 * @param {string} date YYYY-MM-DD
 */
const pushAfter = (date) => ({
  ...ROUTINE,
  settings: [
    { id: "user", lastGymId: "gym-work", workoutInProgress: "w-push" },
  ],
  workouts: [
    {
      ...benchDay(date, [
        [135, 10],
        [135, 10],
        [135, 10, 1],
      ]),
      routine: { routineId: "r-ppl", version: 1, dayId: "d-push" },
    },
    {
      id: "w-push",
      date: "2026-10-25",
      startedAt: "2026-10-25T18:00:00.000Z",
      gymId: "gym-work",
      routine: { routineId: "r-ppl", version: 1, dayId: "d-push" },
      entries: [
        { exerciseId: "barbell-bench-press", sets: [] },
        { exerciseId: "incline-db-press", sets: [] },
        { exerciseId: "triceps-pushdown", sets: [] },
      ],
    },
  ],
});

/** Made-up body weight entries (#18). */
const WEIGHTS = {
  ...GYMS,
  bodyWeights: [
    ["2026-10-25", 181.6],
    ["2026-10-21", 182.4],
    ["2026-10-18", 182.1],
    ["2026-10-14", 183.0],
  ].map(([date, load]) => ({
    id: `bw-${date}`,
    date,
    load,
    unit: "lb",
    loggedAt: `${date}T07:30:00.000Z`,
  })),
};

/** @type {Shot[]} */
export const SHOTS = [
  { name: "workouts", as: "owner", route: "/workouts", seed: WORKOUT },
  {
    name: "past-workout",
    as: "owner",
    route: "/workouts/w-2026-10-14",
    seed: WORKOUT,
  },
  {
    name: "past-workout-edit",
    as: "owner",
    route: "/workouts/w-2026-10-14",
    seed: WORKOUT,
    steps: async (page) => {
      await page
        .getByRole("button", { name: "Correct Barbell Bench Press set 2" })
        .click();
      await page.getByRole("button", { name: "Delete set" }).waitFor();
    },
  },
  {
    name: "log-earlier-date",
    as: "owner",
    route: "/log",
    seed: GYMS,
    steps: async (page) => {
      await page.getByRole("button", { name: "Earlier date" }).click();
      await page.getByLabel("Workout date").waitFor();
    },
  },
  { name: "body-weight-empty", as: "owner", route: "/body-weight", seed: GYMS },
  { name: "body-weight", as: "owner", route: "/body-weight", seed: WEIGHTS },
  {
    name: "body-weight-edit",
    as: "owner",
    route: "/body-weight",
    seed: WEIGHTS,
    steps: async (page) => {
      await page.getByRole("button", { name: "Edit" }).nth(1).click();
      await page.getByRole("button", { name: "Cancel" }).waitFor();
    },
  },
  { name: "routines", as: "owner", route: "/routines", seed: ROUTINE },
  { name: "routine", as: "owner", route: "/routines/r-ppl", seed: ROUTINE },
  {
    name: "routine-pick",
    as: "owner",
    route: "/routines/r-ppl",
    seed: ROUTINE,
    steps: async (page) => {
      await page
        .getByRole("button", { name: /Add exercise to Pull A/ })
        .click();
      await page.getByRole("heading", { name: "Add to Pull A" }).waitFor();
    },
  },
  { name: "log-routines", as: "owner", route: "/log", seed: ROUTINE },
  {
    name: "routine-workout",
    as: "owner",
    route: "/log",
    seed: ROUTINE_WORKOUT,
  },
  {
    name: "suggested-up",
    as: "owner",
    route: "/log",
    seed: pushAfter("2026-10-20"),
  },
  {
    name: "suggested-comeback",
    as: "owner",
    route: "/log",
    seed: pushAfter("2026-10-01"),
  },
  {
    name: "routine-finish",
    as: "owner",
    route: "/log/exercises",
    seed: ROUTINE_WORKOUT,
  },
  { name: "checking", as: "checking" },
  { name: "sign-in", as: "signed-out" },
  { name: "not-owner", as: "not-owner" },
  { name: "log", as: "owner", route: "/log" },
  { name: "exercises", as: "owner", route: "/exercises" },
  { name: "stats", as: "owner", route: "/stats" },
  { name: "coach", as: "owner", route: "/coach" },
  { name: "more", as: "owner", route: "/more" },
  {
    // Filtering by a muscle group and searching (#27).
    name: "exercises-filtered",
    as: "owner",
    route: "/exercises",
    steps: async (page) => {
      await page.getByRole("button", { name: "Chest", exact: true }).click();
      await page
        .getByRole("searchbox", { name: "Search exercises" })
        .fill("press");
    },
  },
  {
    // Re-rendering on navigation, tab highlight included (#27).
    name: "navigated",
    as: "owner",
    route: "/more",
    steps: async (page) => {
      await page.getByRole("link", { name: "Exercises", exact: true }).click();
      await page.getByRole("link", { name: "Stats", exact: true }).click();
    },
  },
  { name: "gyms-empty", as: "owner", route: "/gyms" },
  { name: "gyms", as: "owner", route: "/gyms", seed: GYMS },
  { name: "gym", as: "owner", route: "/gyms/gym-work", seed: GYMS },
  {
    name: "gym-delete-armed",
    as: "owner",
    route: "/gyms/gym-work",
    seed: GYMS,
    steps: async (page) => {
      await page.getByRole("button", { name: "Delete gym" }).click();
    },
  },
  {
    name: "gym-searched",
    as: "owner",
    route: "/gyms/gym-work",
    seed: GYMS,
    steps: async (page) => {
      await page
        .getByRole("searchbox", { name: "Search exercises" })
        .fill("press");
    },
  },
  { name: "picker", as: "owner", route: "/exercises", seed: GYMS },
  { name: "log-start", as: "owner", route: "/log", seed: GYMS },
  { name: "log-auto-finished", as: "owner", route: "/log", seed: ABANDONED },
  {
    // Mentioned once: back on the Log tab, the line is gone (#45).
    name: "log-auto-finished-gone",
    as: "owner",
    route: "/log",
    seed: ABANDONED,
    async steps(page) {
      await page.getByText(/was finished at/).waitFor();
      await page.getByRole("link", { name: "More", exact: true }).click();
      await page.getByRole("link", { name: "Log", exact: true }).click();
      await page.getByRole("button", { name: /Start freestyle/ }).waitFor();
    },
  },
  { name: "workout", as: "owner", route: "/log", seed: WORKOUT },
  {
    name: "workout-choices",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: async (page) => {
      await page.getByRole("button", { name: "1", exact: true }).click();
      await page.getByRole("button", { name: "Drop set" }).click();
    },
  },
  {
    name: "workout-undo-armed",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: async (page) => {
      await page.getByRole("button", { name: "Undo last set" }).click();
    },
  },
  {
    name: "workout-undone",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: async (page) => {
      await page.getByRole("button", { name: "Undo last set" }).click();
      await page.getByRole("button", { name: /Tap again to undo/ }).click();
      await page.getByRole("button", { name: /Log set 02/ }).waitFor();
    },
  },
  {
    name: "history",
    as: "owner",
    route: "/log/history/barbell-bench-press",
    seed: WORKOUT,
  },
  {
    name: "history-tapped",
    as: "owner",
    route: "/log/history/barbell-bench-press",
    seed: WORKOUT,
    steps: async (page) => {
      await page.locator(".chart").focus();
      await page.keyboard.press("ArrowLeft");
      await page.locator(".chart-tip", { hasText: "Oct 14" }).waitFor();
    },
  },
  {
    name: "history-workouts",
    as: "owner",
    route: "/log/history/barbell-bench-press",
    seed: WORKOUT,
    steps: async (page) => {
      await page
        .getByRole("heading", { name: "Workouts" })
        .scrollIntoViewIfNeeded();
      await page.evaluate(() => globalThis.scrollBy(0, 400));
    },
  },
  {
    name: "record",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: async (page) => {
      await page.getByRole("textbox", { name: "Load in lb" }).fill("140");
      await page.getByRole("button", { name: /Log set 03/ }).click();
      await page.getByText(/New record/).waitFor();
    },
  },
  {
    name: "rest",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: logThenRest(0),
  },
  {
    name: "rest-paused",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: async (page) => {
      await logThenRest(24)(page);
      await page.getByRole("button", { name: "Pause" }).click();
      await page.getByText("Paused", { exact: true }).waitFor();
    },
  },
  {
    name: "rest-over",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: logThenRest(91),
  },
  {
    name: "rest-skipped",
    as: "owner",
    route: "/log",
    seed: WORKOUT,
    steps: async (page) => {
      await logThenRest(24)(page);
      await page.getByRole("button", { name: "Skip" }).click();
      await page.getByRole("timer").waitFor({ state: "hidden" });
    },
  },
  {
    name: "workout-next",
    as: "owner",
    route: "/log/ex/lat-pulldown",
    seed: WORKOUT,
  },
  { name: "workout-empty", as: "owner", route: "/log", seed: WORKOUT_EMPTY },
  {
    name: "workout-list",
    as: "owner",
    route: "/log/exercises",
    seed: WORKOUT,
  },
  { name: "workout-add", as: "owner", route: "/log/add", seed: WORKOUT },
  {
    name: "workout-done",
    as: "owner",
    route: "/log/done/w-done",
    seed: WORKOUT_DONE,
  },
  { name: "workout-discarded", as: "owner", route: "/log/done", seed: GYMS },
  {
    // The whole flow through the real screens (#11).
    name: "flow-logged",
    as: "owner",
    route: "/log",
    seed: GYMS,
    steps: logTwoSets,
  },
  {
    name: "flow-finished",
    as: "owner",
    route: "/log",
    seed: GYMS,
    steps: async (page) => {
      await logTwoSets(page);
      await page
        .getByRole("link", { name: /this workout's exercises/ })
        .click();
      await page.getByRole("button", { name: "Finish workout" }).click();
      await page.getByRole("heading", { name: "Workout done" }).waitFor();
    },
  },
  {
    name: "picker-empty-gym",
    as: "owner",
    route: "/exercises",
    seed: {
      gyms: [{ id: "gym-new", name: "Hotel", exerciseIds: [] }],
      settings: [{ id: "user", lastGymId: "gym-new" }],
    },
  },
  {
    name: "picker-show-all",
    as: "owner",
    route: "/exercises",
    seed: GYMS,
    steps: async (page) => {
      await page.getByRole("button", { name: "Show all" }).click();
    },
  },
];
