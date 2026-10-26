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

/** @type {Shot[]} */
export const SHOTS = [
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
    route: "/log",
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
