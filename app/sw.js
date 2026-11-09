// Service worker: runs one whole app version at a time, and keeps it
// running with no signal (#129).
//
// The deploy stamps version.js with its commit (ADR-0002), so every deploy
// changes what the browser compares and it installs the new version: the
// whole SHELL, in a cache named after the commit, or nothing. It then waits
// until the app asks it to take over (the Update button, or on opening the
// app: js/updates.js); older versions' caches go once it has. Requests are
// answered from the active version's cache alone, never a mix of versions.
// Firestore and sign-in traffic is never cached here; Firestore keeps its
// own offline cache (ADR-0007).
importScripts("version.js");

const CACHE = `forge-${self.forgeAppVersion.commit}`;
// Fonts load from URLs only the font service's stylesheet names, so they're
// kept as they're first used, across versions.
const FONTS = "forge-fonts";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "version.js",
  "css/slab.css",
  "js/main.js",
  "js/auth.js",
  "js/save-error.js",
  "js/updates.js",
  "js/update-bar.js",
  "js/app-version.js",
  "js/dom.js",
  "js/screens/screen.js",
  "js/screens/sign-in.js",
  "js/screens/not-owner.js",
  "js/screens/log.js",
  "js/screens/auto-finished.js",
  "js/screens/workout.js",
  "js/screens/measure.js",
  "js/screens/rest-timer.js",
  "js/screens/history.js",
  "js/screens/e1rm-chart.js",
  "js/screens/chart.js",
  "js/screens/stats.js",
  "js/screens/hard-sets-card.js",
  "js/screens/body-figures.js",
  "js/screens/body-map-card.js",
  "js/screens/mark.js",
  "js/screens/calendar-card.js",
  "js/screens/tonnage-card.js",
  "js/screens/region-split-card.js",
  "js/screens/record-timeline-card.js",
  "js/screens/workout-list.js",
  "js/screens/workout-done.js",
  "js/screens/add-exercise.js",
  "js/screens/exercises.js",
  "js/screens/exercise.js",
  "js/screens/exercise-list.js",
  "js/screens/gyms.js",
  "js/screens/gym.js",
  "js/screens/routines.js",
  "js/screens/routine.js",
  "js/screens/body-weight.js",
  "js/screens/workouts.js",
  "js/screens/past-workout.js",
  "js/screens/more.js",
  "js/screens/placeholder.js",
  "js/firebase-config.js",
  "js/firebase-sdk.js",
  "js/store/firestore-store.js",
  "js/core/forge.js",
  "js/core/dashboard.js",
  "js/core/units.js",
  "js/core/exercise-types.js",
  "js/store/memory-store.js",
  "js/core/muscle-groups.js",
  "js/core/seed-library.js",
  "js/core/types.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
  // The pinned Firebase SDK (js/firebase-sdk.js), part of every version.
  "https://www.gstatic.com/firebasejs/13.0.0/firebase-app.js",
  "https://www.gstatic.com/firebasejs/13.0.0/firebase-auth.js",
  "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js",
];

self.addEventListener("install", (event) => {
  // "reload": straight from the site, so the HTTP cache can't hand back an
  // older deploy's copy of a file. addAll stores all or none.
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) =>
        cache.addAll(SHELL.map((url) => new Request(url, { cache: "reload" }))),
      ),
  );
});

// The app's go-ahead to take over from the version running (#129).
self.addEventListener("message", (event) => {
  if (event.data === "switch") self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE && key !== FONTS)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.hostname === "fonts.googleapis.com" ||
    url.hostname === "fonts.gstatic.com"
  )
    event.respondWith(fromFonts(request));
  else if (url.origin === self.location.origin || SHELL.includes(request.url))
    event.respondWith(fromVersion(request));
});

/**
 * The active version's copy; the network only for what no version has.
 * @param {Request} request
 */
async function fromVersion(request) {
  const cache = await caches.open(CACHE);
  return (await cache.match(request, { ignoreSearch: true })) ?? fetch(request);
}

/**
 * A font as first fetched, kept for next time.
 * @param {Request} request
 */
async function fromFonts(request) {
  const cache = await caches.open(FONTS);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
