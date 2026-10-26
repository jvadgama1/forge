// Every shot `npm run shots` takes. A new screen is one entry: a file name,
// who is signed in, and the route.

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
 * @property {(page: Page) => Promise<void>} [steps] Interactions to run before the shot.
 */

/** @type {Shot[]} */
export const SHOTS = [
  { name: "checking", as: "checking" },
  { name: "sign-in", as: "signed-out" },
  { name: "not-owner", as: "not-owner" },
  { name: "log", as: "owner", route: "/log" },
  { name: "exercises", as: "owner", route: "/library" },
  { name: "stats", as: "owner", route: "/stats" },
  { name: "coach", as: "owner", route: "/coach" },
  { name: "more", as: "owner", route: "/more" },
  {
    // Filtering by a muscle group and searching (#27).
    name: "exercises-filtered",
    as: "owner",
    route: "/library",
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
      await page.getByRole("link", { name: "Exercise library" }).click();
      await page.getByRole("link", { name: "Stats", exact: true }).click();
    },
  },
];
