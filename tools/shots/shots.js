// Photographs every screen at phone size (#33): `npm run shots -- <label>`
// saves one 390 × 844 PNG per entry in list.js to .shots/<label>/. Drives the
// installed Microsoft Edge, so nothing downloads a browser. Sign-in and
// Firestore are stubbed: no personal data reaches a shot (ADR-0005).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";
import { SHOTS } from "./list.js";
import { LABEL, runDir } from "./run-dir.js";

/** @import { Page } from "playwright-core" */
/** @import { Shot } from "./list.js" */

const label = process.argv[2] ?? "";
if (!LABEL.test(label)) {
  console.error("Usage: npm run shots -- <label>  (letters, digits, - or _)");
  process.exit(1);
}

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));
const stubDir = fileURLToPath(new URL("stubs/", import.meta.url));
const fontDir = fileURLToPath(new URL("fonts/", import.meta.url));
const outDir = runDir(label);

// The app's fonts use `font-display: swap`, which paints a fallback first;
// `block` draws text once, in its web font.
const fontCss = (await readFile(join(fontDir, "fonts.css"), "utf8")).replaceAll(
  "font-display: swap",
  "font-display: block",
);
// The font URL the copy was fetched for: the app asking for another one
// (a family or weight added) means the copy is stale.
const fontUrl = fontCss.match(/^\/\* Fetched for (\S+) \*\//)?.[1];

// A made-up origin, answered from app/ below. https, because the app needs a
// secure context (crypto.randomUUID makes every new id).
const ORIGIN = "https://forge.test";

/** @type {Record<string, string>} served path → stub file */
const STUBS = {
  "/js/firebase-sdk.js": "firebase-sdk.js",
  "/js/store/firestore-store.js": "firestore-store.js",
};

/** @type {Record<string, string>} */
const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webmanifest": "application/manifest+json",
};

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
  await page.evaluate("document.fonts.ready");
  await page.waitForTimeout(200);
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

// Glyph edges came out a few grey levels apart between runs of unchanged
// code. Over ten-run batches, only all of these together cut that to about
// one render in a hundred (see stableRender): no GPU, no LCD antialiasing
// (phones don't use it), no subpixel glyph positioning, no hinting, and text
// drawn once (see fontCss).
const browser = await chromium.launch({
  channel: "msedge",
  args: [
    "--disable-gpu",
    "--disable-lcd-text",
    "--disable-font-subpixel-positioning",
    "--font-render-hinting=none",
  ],
});

/** A phone-sized context serving app/, with the stubs, at ORIGIN; no service worker. */
async function phoneContext() {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    serviceWorkers: "block",
  });
  await context.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = STUBS[path]
      ? join(stubDir, STUBS[path])
      : join(appDir, path === "/" ? "index.html" : path);
    try {
      await route.fulfill({
        body: await readFile(file),
        contentType: CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
      });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
  // The fonts come from a copy in fonts/, so text never depends on what the
  // live font service sends (#37).
  await context.route("https://fonts.googleapis.com/**", (route) => {
    if (route.request().url() !== fontUrl)
      errors.add(`font URL not in tools/shots/fonts: ${route.request().url()}`);
    return route.fulfill({ body: fontCss, contentType: "text/css" });
  });
  await context.route("https://fonts.gstatic.com/**", async (route) => {
    const file = basename(new URL(route.request().url()).pathname);
    try {
      await route.fulfill({
        body: await readFile(join(fontDir, file)),
        contentType: "font/woff2",
      });
    } catch {
      // The app asked for a font the copy lacks: see fonts/README.md.
      errors.add(`font file not in tools/shots/fonts: ${file}`);
      await route.fulfill({ status: 404 });
    }
  });
  return context;
}

const errors = new Set();

/**
 * One render of a shot, in a fresh context so it starts from a clean browser.
 * @param {Shot} shot
 */
async function render(shot) {
  const context = await phoneContext();
  try {
    // Read by the store stub as its starting documents.
    await context.addInitScript((seed) => {
      Object.assign(globalThis, { forgeShotSeed: seed });
    }, shot.seed ?? {});
    const page = await context.newPage();
    // A fixed "now", so the workout timer reads the same every run.
    await page.clock.setFixedTime(new Date(SHOT_TIME));
    page.on("pageerror", (error) => errors.add(`${shot.name}: ${error}`));
    await page.goto(`${ORIGIN}/?as=${shot.as}#${shot.route ?? "/log"}`);
    await settle(page);
    if (shot.steps) {
      await shot.steps(page);
      await settle(page);
    }
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
