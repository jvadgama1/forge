// Serves app/ to a browser context at a made-up origin, with sign-in and
// Firestore stubbed (stubs/), so nothing personal reaches the page
// (ADR-0005). The shots (#33) and the Stats timing (#131) both run on it.
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @import { BrowserContext } from "playwright-core" */

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));
const stubDir = fileURLToPath(new URL("stubs/", import.meta.url));

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
