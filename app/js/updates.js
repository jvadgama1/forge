// Offers a new app version (#129). The service worker (sw.js) downloads
// each version whole and waits; this says when to switch to it. Opening the
// app switches to a version already waiting before anything is drawn; one
// that arrives while the app is in use waits for the Update button, so a
// screen never reloads under the user's thumb.

/**
 * What a check for a new version found: one waiting, none, or no answer
 * (no signal, a failed download, or a browser without service workers).
 * @typedef {"ready" | "up-to-date" | "unavailable"} CheckResult
 */

/**
 * @typedef {object} Updates
 * @property {() => Promise<boolean>} open Starts watching for new versions
 *   as the app opens; true when it's switching to one already waiting, and
 *   reloading, so nothing should be drawn.
 * @property {() => Promise<CheckResult>} check Asks the site for a new version.
 * @property {() => Promise<void>} update Switches to the new version and
 *   reloads: the Update button.
 * @property {boolean} ready A new version is waiting.
 * @property {(listener: () => void) => void} onReady Called once a new
 *   version is waiting, or at once if one already is.
 */

/**
 * @param {object} options
 * @param {ServiceWorkerContainer | undefined} options.container The
 *   browser's service workers, if it has them.
 * @param {Pick<Document, "visibilityState" | "addEventListener">} options.page
 * @param {() => void} options.reload
 * @param {number} [options.wait] How long a version is given to take over, in ms.
 * @returns {Updates}
 */
export function createUpdates({ container, page, reload, wait = 3000 }) {
  let ready = false;
  let switching = false;
  /** @type {Set<() => void>} */
  const listeners = new Set();
  /** @type {Promise<ServiceWorkerRegistration | undefined>} */
  let registered = Promise.resolve(undefined);

  function offer() {
    if (ready) return;
    ready = true;
    for (const listener of listeners) listener();
  }

  /**
   * Offers a downloading version once it's waiting. Only a page already
   * running a version has one to switch from: the very first install just
   * takes over.
   * @param {ServiceWorker} worker
   */
  function watch(worker) {
    const installed = () => {
      if (worker.state === "installed" && container?.controller) offer();
    };
    worker.addEventListener("statechange", installed);
    installed();
  }

  /**
   * Asks a waiting version to take over; true once it has.
   * @param {ServiceWorker} worker
   * @returns {Promise<boolean>}
   */
  function switchTo(worker) {
    if (!container) return Promise.resolve(false);
    const serviceWorkers = container;
    switching = true;
    return new Promise((resolve) => {
      const done = () => resolve(true);
      serviceWorkers.addEventListener("controllerchange", done, { once: true });
      worker.postMessage("switch");
      setTimeout(() => {
        serviceWorkers.removeEventListener("controllerchange", done);
        switching = false;
        resolve(false);
      }, wait);
    });
  }

  /**
   * Settles once a download has finished or failed.
   * @param {ServiceWorker} worker
   * @returns {Promise<void>}
   */
  const downloaded = (worker) =>
    new Promise((resolve) => {
      const settled = () => {
        if (worker.state === "installing") return;
        worker.removeEventListener("statechange", settled);
        resolve();
      };
      worker.addEventListener("statechange", settled);
      settled();
    });

  /** @returns {Promise<CheckResult>} */
  async function check() {
    const registration = await registered;
    if (!registration) return "unavailable";
    try {
      await registration.update();
    } catch {
      return "unavailable";
    }
    const installing = registration.installing;
    if (installing) await downloaded(installing);
    if (ready) return "ready";
    return installing?.state === "redundant" ? "unavailable" : "up-to-date";
  }

  /** @param {ServiceWorkerRegistration} registration */
  function watchRegistration(registration) {
    registration.addEventListener("updatefound", () => {
      if (registration.installing) watch(registration.installing);
    });
    if (registration.installing) watch(registration.installing);
    if (registration.waiting) watch(registration.waiting);
    return registration;
  }

  async function open() {
    if (!container) return false;
    const existing = await container.getRegistration().catch(() => undefined);
    if (existing?.waiting && container.controller) {
      if (await switchTo(existing.waiting)) {
        reload();
        return true;
      }
    }
    // Another window switched: this one still runs the old version.
    const running = !!container.controller;
    container.addEventListener("controllerchange", () => {
      if (running && !switching) offer();
    });
    // "none": the browser compares sw.js and the stamp straight from the
    // site, never an HTTP-cached copy.
    registered = container
      .register("./sw.js", { updateViaCache: "none" })
      .then(watchRegistration)
      .catch(() => undefined);
    page.addEventListener("visibilitychange", () => {
      if (page.visibilityState === "visible") check();
    });
    check();
    return false;
  }

  async function update() {
    const registration = await registered;
    if (registration?.waiting) await switchTo(registration.waiting);
    reload();
  }

  return {
    open,
    check,
    update,
    get ready() {
      return ready;
    },
    onReady: (listener) => {
      listeners.add(listener);
      if (ready) listener();
    },
  };
}
