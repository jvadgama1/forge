// Serves app/ to a browser context at a made-up origin, with sign-in and
// Firestore stubbed (stubs/), so nothing personal reaches the page
// (ADR-0005), and its fonts from a copy (fonts/). The shots (#33) and the Stats timing (#131) both run on it.
import { readFile } from "node:fs/promises";
import { basename, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @import { BrowserContext } from "playwright-core" */

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));
const stubDir = fileURLToPath(new URL("stubs/", import.meta.url));
const fontDir = fileURLToPath(new URL("fonts/", import.meta.url));

const fontCss = await readFile(join(fontDir, "fonts.css"), "utf8");
// The font URL the copy was fetched for: the app asking for another one
// (a family or weight added) means the copy is stale.
const fontUrl = fontCss.match(/^\/\* Fetched for (\S+) \*\//)?.[1];

// A made-up origin, answered from app/ below. https, because the app needs a
// secure context (crypto.randomUUID makes every new id).
export const ORIGIN = "https://forge.test";

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

/**
 * Answers ORIGIN from app/, with the stubs in place of the real sign-in and
 * store, and starts every page with `seed` as the store's documents.
 * @param {BrowserContext} context
 * @param {object} options
 * @param {Record<string, object[]>} options.seed the store's starting
 *   documents, by collection
 * @param {string} [options.stamp] version.js as a deploy writes it, in
 *   place of the repo's "dev" (#129)
 */
export async function serveApp(context, { seed, stamp }) {
  await context.route(`${ORIGIN}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (stamp && path === "/version.js")
      return route.fulfill({ body: stamp, contentType: "text/javascript" });
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
  // Read by the store stub as its starting documents.
  await context.addInitScript((seed) => {
    Object.assign(globalThis, { forgeShotSeed: seed });
  }, seed);
  // Service workers stand in for the browser's, blocked here (#129).
  await context.addInitScript({ path: join(stubDir, "service-worker.js") });
}

/**
 * Answers the app's web fonts from the copy in fonts/, so text never
 * depends on what the live font service sends (#37).
 * @param {BrowserContext} context
 * @param {object} options
 * @param {(problem: string) => void} options.onMissing told when the app
 *   asks for a font the copy lacks: see fonts/README.md
 * @param {"swap" | "block"} [options.display] how text waits for its font:
 *   the app's `swap` paints a fallback first; `block` draws text once, in
 *   its web font
 */
export async function serveFonts(context, { onMissing, display = "swap" }) {
  const css = fontCss.replaceAll(
    "font-display: swap",
    `font-display: ${display}`,
  );
  await context.route("https://fonts.googleapis.com/**", (route) => {
    if (route.request().url() !== fontUrl)
      onMissing(`font URL not in tools/shots/fonts: ${route.request().url()}`);
    return route.fulfill({ body: css, contentType: "text/css" });
  });
  await context.route("https://fonts.gstatic.com/**", async (route) => {
    const file = basename(new URL(route.request().url()).pathname);
    try {
      await route.fulfill({
        body: await readFile(join(fontDir, file)),
        contentType: "font/woff2",
      });
    } catch {
      onMissing(`font file not in tools/shots/fonts: ${file}`);
      await route.fulfill({ status: 404 });
    }
  });
}
