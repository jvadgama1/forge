// Times opening the Stats tab on a phone-speed CPU (#131): `npm run
// timing:stats` taps Stats from the Log tab, with 60 made-up past workouts
// in the shots' in-memory store and stubbed sign-in (ADR-0005), the CPU
// slowed 4×, and reports the median of several runs, each in a fresh
// browser. Times run from the tap to the frame drawn after it:
//   first content  the first of the board's cards is on the screen
//   whole board    every card has drawn its content
// `-- --profile` also samples the JavaScript and says where the time went:
// the core's sums, the cards and charts, the body figures, or the browser
// itself (style, layout, paint, garbage collection).
// Options: --runs <n> (default 7), --cpu <rate> (default 4), --profile.
import { parseArgs } from "node:util";
import { chromium } from "playwright-core";
import { ORIGIN, serveApp, serveFonts } from "../shots/serve.js";
import { sixtyWorkouts } from "./sixty-workouts.js";

/** @import { Page } from "playwright-core" */

const { values } = parseArgs({
  options: {
    runs: { type: "string", default: "7" },
    cpu: { type: "string", default: "4" },
    profile: { type: "boolean", default: false },
  },
});
const runs = Number(values.runs);
const cpu = Number(values.cpu);
if (!(runs >= 1 && cpu >= 1)) {
  console.error(
    "Usage: npm run timing:stats -- [--runs <n>] [--cpu <rate>] [--profile]",
  );
  process.exit(1);
}

// The target agreed in triage for #131: first content within 200 ms at 4×.
const TARGET_MS = 200;

// "Now" inside the app: a Sunday evening, just after the last workout.
const NOW = "2026-10-25T20:00:00Z";

const SEED = sixtyWorkouts(NOW.slice(0, 10));

// Where a profile sample's script belongs, by the file it ran in. Anything
// with no file is the browser's own work.
/** @type {[string, RegExp][]} */
const PARTS = [
  ["core sums (core/, store/)", /\/js\/(core|store)\//],
  ["body figures", /\/(body-figures|body-map-card)\.js$/],
  ["cards and charts (screens/, dom.js)", /\/js\/(screens\/|dom\.js)/],
  ["other app code", new RegExp(`^${ORIGIN}/`)],
];

/**
 * @typedef {object} Times ms from the tap
 * @property {number} added the first card put in the page: the app's code
 * @property {number} first the frame showing it drawn: first content
 * @property {number} whole the frame showing every card drawn
 */

/**
 * Taps Stats and resolves with the times. The board is marked aria-busy
 * while cards are still to come. The tap is the link's click, from inside
 * the page, so the profile holds only the app's work.
 *
 * A frame is drawn when its rendering ends, as the browser's long animation
 * frame entries tell it: the first whose rendering began after the change.
 * A frame too quick to have one (under 50 ms) is taken as drawn once laid
 * out at the next animation frame.
 * @param {Page} page
 * @returns {Promise<Times>}
 */
const tapStats = (page) =>
  page.evaluate(
    () =>
      new Promise((resolve) => {
        const doc = globalThis.document;
        /** @type {() => number} */
        const now = Reflect.get(globalThis, "forgeRealNow");
        /** @type {{ renderStart: number, end: number }[]} */
        const frames = [];
        const long = new globalThis.PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            frames.push({
              renderStart: Reflect.get(entry, "renderStart"),
              end: entry.startTime + entry.duration,
            });
        });
        long.observe({ type: "long-animation-frame" });
        // The next frame laid out: its style and layout forced here, at its
        // start, in case it is too quick to be a long animation frame.
        const laidOut = () =>
          /** @type {Promise<number>} */ (
            new Promise((done) =>
              globalThis.requestAnimationFrame(() => {
                void doc.body.offsetHeight;
                done(now());
              }),
            )
          );
        /** @param {number} change @param {number} fallback */
        const drawn = (change, fallback) =>
          frames.find((f) => f.renderStart >= change)?.end ?? fallback;
        /** @type {number | undefined} */
        let added;
        /** @type {Promise<number> | undefined} */
        let firstLaidOut;
        const seen = new globalThis.MutationObserver(async () => {
          const cards = doc.querySelectorAll(".board-card");
          if (!cards.length) return;
          added ??= now();
          firstLaidOut ??= laidOut();
          if (cards.length < 7 || doc.querySelector(".board[aria-busy]"))
            return;
          seen.disconnect();
          const filled = now();
          const [shown, whole] = await Promise.all([firstLaidOut, laidOut()]);
          // A frame's entry comes once it's over: wait two more.
          await laidOut();
          await laidOut();
          long.disconnect();
          resolve({
            added: added - tap,
            first: drawn(added, shown) - tap,
            whole: drawn(filled, whole) - tap,
          });
        });
        seen.observe(doc.body, {
          childList: true,
          subtree: true,
          attributes: true,
        });
        const link = /** @type {HTMLElement} */ (
          doc.querySelector('.tabs a[data-tab="stats"]')
        );
        const tap = now();
        link.click();
      }),
  );

/**
 * @typedef {{ callFrame: { url: string, functionName: string }, id: number }} ProfileNode
 * @typedef {{ nodes: ProfileNode[], samples: number[], timeDeltas: number[] }} Profile
 */

/**
 * Self time in ms by part of the app, from a CPU profile.
 * @param {Profile} profile
 */
function split(profile) {
  const byId = new Map(profile.nodes.map((n) => [n.id, n]));
  /** @type {Map<string, number>} */
  const ms = new Map();
  profile.samples.forEach((id, i) => {
    const { url, functionName } = byId.get(id)?.callFrame ?? {
      url: "",
      functionName: "",
    };
    // (idle) is waiting, not work.
    if (functionName === "(idle)") return;
    const part =
      PARTS.find(([, test]) => test.test(url))?.[0] ??
      (url
        ? "other scripts"
        : functionName === "(program)"
          ? "browser: style, layout, paint, and the profiler itself"
          : functionName.startsWith("(")
            ? `browser ${functionName}`
            : "other page scripts");
    // The delta before a sample is the time it stands for.
    const delta = (profile.timeDeltas[i + 1] ?? 0) / 1000;
    ms.set(part, (ms.get(part) ?? 0) + delta);
  });
  return ms;
}

/** @param {number[]} xs */
const median = (xs) => {
  const sorted = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
};

const browser = await chromium.launch({ channel: "msedge" });
const errors = new Set();
/** @type {Times[]} */
const times = [];
/** @type {Map<string, number[]>} */
const parts = new Map();
try {
  for (let run = 0; run < runs; run++) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      serviceWorkers: "block",
    });
    await serveApp(context, { seed: SEED });
    // The real clock, kept before the fake "now" below replaces it.
    await context.addInitScript(() => {
      const now = performance.now.bind(performance);
      Object.assign(globalThis, { forgeRealNow: now });
    });
    await serveFonts(context, { onMissing: (problem) => errors.add(problem) });
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.add(String(error)));
    await page.clock.setFixedTime(new Date(NOW));
    await page.goto(`${ORIGIN}/?as=owner#/log`);
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Stats", exact: true }).waitFor();
    // The Log tab finished drawing, every font in, as the service worker's
    // cache has them on the phone, and nothing else under way, so only the
    // tap's own work is timed.
    await page.evaluate(() =>
      Promise.all([...globalThis.document.fonts].map((font) => font.load())),
    );
    await page.evaluate(
      () =>
        new Promise((idle) =>
          globalThis.requestIdleCallback(idle, { timeout: 2000 }),
        ),
    );
    const cdp = await context.newCDPSession(page);
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: cpu });
    if (values.profile) {
      await cdp.send("Profiler.enable");
      await cdp.send("Profiler.setSamplingInterval", { interval: 100 });
      await cdp.send("Profiler.start");
    }
    times.push(await tapStats(page));
    if (values.profile) {
      const { profile } = await cdp.send("Profiler.stop");
      for (const [part, ms] of split(/** @type {Profile} */ (profile)))
        parts.set(part, [...(parts.get(part) ?? []), ms]);
    }
    await context.close();
  }
} finally {
  await browser.close();
}

const ms = (/** @type {number} */ n) => `${Math.round(n)} ms`;
/** @param {(t: Times) => number} of */
const middle = (of) => ms(median(times.map(of)));
console.log(
  `Stats tab, ${SEED.workouts.length} past workouts, CPU ${cpu}× slower, median of ${runs}:`,
);
console.log(
  `  first content  ${middle((t) => t.first)}  (target ${TARGET_MS} ms at 4×)`,
);
console.log(
  `    the app's code until the first card   ${middle((t) => t.added)}`,
);
console.log(
  `    the browser drawing it                ${middle((t) => t.first - t.added)}`,
);
console.log(`  whole board    ${middle((t) => t.whole)}`);
console.log(
  `  each run (first / whole): ${times.map((t) => `${Math.round(t.first)}/${Math.round(t.whole)}`).join(", ")}`,
);
if (values.profile) {
  console.log("Where the time went (CPU profile self time, median per run):");
  const rows = [...parts.entries()]
    .map(([part, each]) => /** @type {const} */ ([part, median(each)]))
    .sort(([, a], [, b]) => b - a);
  for (const [part, each] of rows)
    console.log(`  ${ms(each).padStart(7)}  ${part}`);
}
if (errors.size) {
  console.error(`\nPage errors:\n${[...errors].join("\n")}`);
  process.exitCode = 1;
}
