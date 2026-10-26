// Photographs every screen at phone size (#33): `npm run shots -- <label>`
// saves one 390 × 844 PNG per entry in list.js to .shots/<label>/. Drives the
// installed Microsoft Edge, so nothing downloads a browser. Sign-in and
// Firestore are stubbed: no personal data reaches a shot (ADR-0005).
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
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
const outDir = runDir(label);

// A made-up origin, answered from app/ below.
const ORIGIN = "http://forge.test";

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
// drawn once (see phoneContext).
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
  // The app's fonts use `font-display: swap`, which paints a fallback first;
  // `block` draws text once, in its web font.
  await context.route("https://fonts.googleapis.com/**", async (route) => {
    const response = await route.fetch();
    const css = (await response.text()).replaceAll(
      "font-display: swap",
      "font-display: block",
    );
    await route.fulfill({ response, body: css });
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
    const page = await context.newPage();
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
