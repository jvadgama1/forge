// Service worker: keeps the app shell available with no signal.
// Same-origin files, Google Fonts and the pinned Firebase SDK are served from
// cache while a fresh copy is fetched in the background, so a deploy shows up
// on the next launch. Firestore and sign-in traffic is never cached here;
// Firestore keeps its own offline cache.

const CACHE = "forge-shell-v1";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/slab.css",
  "js/main.js",
  "js/dom.js",
  "js/firebase-config.js",
  "js/firebase-sdk.js",
  "js/store/firestore-store.js",
  "js/core/forge.js",
  "js/store/memory-store.js",
  "js/core/muscle-groups.js",
  "js/core/seed-library.js",
  "js/core/types.js",
  "icons/icon.svg",
  "icons/icon-192.png",
  "icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const cacheable =
    event.request.method === "GET" &&
    (url.origin === self.location.origin ||
      url.hostname.endsWith("fonts.googleapis.com") ||
      url.hostname.endsWith("fonts.gstatic.com") ||
      (url.hostname === "www.gstatic.com" &&
        url.pathname.startsWith("/firebasejs/")));
  if (!cacheable) return;

  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(event.request, { ignoreSearch: true });
      const fresh = fetch(event.request)
        .then((response) => {
          if (response.ok) cache.put(event.request, response.clone());
          return response;
        })
        .catch(() => cached);
      return cached ?? fresh;
    }),
  );
});
