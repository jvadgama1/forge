// Photographs every screen (#33): `npm run shots -- <label>` saves one PNG
// per entry in list.js to .shots/<label>/, on a 390 × 844 phone unless the
// entry gives another viewport (#23). A screen that scrolls sideways fails
// the run. Drives the
// installed Microsoft Edge, so nothing downloads a browser. Sign-in and
// Firestore are stubbed: no personal data reaches a shot (ADR-0005).
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { chromium } from "playwright-core";
import { stampSource } from "../stamp-version.js";
import { PHONE, SHOTS } from "./list.js";
import { LABEL, runDir } from "./run-dir.js";
import { ORIGIN, serveApp, serveFonts } from "./serve.js";

/** @import { Page } from "playwright-core" */
/** @import { Shot } from "./list.js" */

const label = process.argv[2] ?? "";
if (!LABEL.test(label)) {
  console.error("Usage: npm run shots -- <label>  (letters, digits, - or _)");
  process.exit(1);
}

const outDir = runDir(label);

const ATTEMPTS = 5;

// "Now" inside every shot: 32 min 14 s into the seeded workout (list.js).
const SHOT_TIME = "2026-10-25T18:32:14Z";

/**
 * Waits for the page to finish: requests (fonts included) and web fonts.
 * After interaction steps the page is already network-idle, so the short
 * wait lets an async re-render, such as a search reading the store, land.
 * @param {Page} page
 */
async function settle(page) {
  await page.waitForLoadState("networkidle");
  // A screen still filling in, as the Stats board does after its first
  // card (#131), marks itself busy.
  await page.waitForFunction(
    () => !globalThis.document.querySelector("[aria-busy]"),
  );
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(200);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// Glyph edges came out a few grey levels apart between runs of unchanged
// code. Over ten-run batches, only all of these together cut that to about
// one render in a hundred (see stableRender): no GPU, no LCD antialiasing
// (phones don't use it), no subpixel glyph positioning, no hinting, and text
// drawn once (serveFonts with display "block").
const browser = await chromium.launch({
  channel: "msedge",
  args: [
    "--disable-gpu",
    "--disable-lcd-text",
    "--disable-font-subpixel-positioning",
    "--font-render-hinting=none",
  ],
});

// The stamp a shot with `stamp` is served, as a deploy writes it (#129).
const STAMP = stampSource("0a1b2c3", "2026-11-08T12:00:00.000Z");

/**
 * A context serving app/, with the stubs, at ORIGIN; no service worker.
 * @param {Shot} shot
 */
async function newContext(shot) {
  const context = await browser.newContext({
    viewport: shot.viewport ?? PHONE,
    serviceWorkers: "block",
  });
  await serveApp(context, {
    seed: shot.seed ?? {},
    ...(shot.stamp && { stamp: STAMP }),
  });
  // Text drawn once, in its web font (see the browser flags above).
  await serveFonts(context, {
    display: "block",
    onMissing: (problem) => errors.add(problem),
  });
  return context;
}

const errors = new Set();

/**
 * One render of a shot, in a fresh context so it starts from a clean browser.
 * @param {Shot} shot
 */
async function render(shot) {
  const context = await newContext(shot);
  try {
    const page = await context.newPage();
    // A fixed "now", so the workout timer reads the same every run.
    await page.clock.setFixedTime(new Date(SHOT_TIME));
    page.on("pageerror", (error) => errors.add(`${shot.name}: ${error}`));
    const update = shot.update ? `&update=${shot.update}` : "";
    await page.goto(
      `${ORIGIN}/?as=${shot.as}${update}#${shot.route ?? "/log"}`,
    );
    await settle(page);
    if (shot.steps) {
      await shot.steps(page);
      await settle(page);
    }
    // Fails the shot unless exactly one element matches: a screenshot of
    // the wrong part of a screen would pass for the right one (#110). The
    // page has settled, so a selector that matches nothing fails in 5 s,
    // not Playwright's 30.
    if (shot.scrollTo)
      await page
        .locator(shot.scrollTo)
        .evaluate((el) => el.scrollIntoView({ block: "center" }), undefined, {
          timeout: 5000,
        });
    // No screen may scroll sideways at any width (#23).
    const wider = await page.evaluate(
      () =>
        globalThis.document.documentElement.scrollWidth - globalThis.innerWidth,
    );
    if (wider > 0)
      errors.add(`${shot.name}: ${wider} px wider than the screen`);
    return await page.screenshot();
  } finally {
    await context.close();
  }
}

/**
 * A shot is kept once two renders agree byte for byte, so a single stray
 * render (about one in a hundred) can't reach the comparison.
 * @param {Shot} shot
 */
async function stableRender(shot) {
  const renders = /** @type {Buffer[]} */ ([]);
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const png = await render(shot);
    if (renders.some((earlier) => earlier.equals(png))) return png;
    renders.push(png);
  }
  throw new Error(`${shot.name}: no two of ${ATTEMPTS} renders agreed`);
}

try {
  for (const shot of SHOTS) {
    await writeFile(join(outDir, `${shot.name}.png`), await stableRender(shot));
    console.log(`${shot.name}.png`);
  }
} finally {
  await browser.close();
}

// A script error means a shot may show a broken screen: fail loudly.
if (errors.size) {
  console.error(`\nPage errors:\n${[...errors].join("\n")}`);
  process.exitCode = 1;
}
