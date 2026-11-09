// Runs the real app/sw.js in a made-up service worker scope (#129): a site
// that can be redeployed or cut off, the Cache Storage the worker fills, and
// its install, activate, fetch and message events, as a browser fires them.
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { stampSource } from "../../tools/stamp-version.js";

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));
const SCOPE = "https://forge.test/";

/** @param {string} dir @returns {string[]} */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name))
      : [relative(appDir, join(dir, entry.name)).split(sep).join("/")],
  );
}

/** The SHELL list as written in the service worker. */
export function shellList() {
  const source = readFileSync(join(appDir, "sw.js"), "utf8");
  const block = source.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!block) throw new Error("SHELL list not found in sw.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

export const appFiles = () => filesUnder(appDir);

/** @param {string} url */
const withoutSearch = (url) => url.split("?")[0];

/**
 * The deployed site and the network to it. `deploy(commit)` serves the
 * app's files as that commit: its stamp, and a main.js that says which
 * commit it is, so a response shows which version answered it.
 */
export function createSite() {
  /** @type {Map<string, string>} url → body */
  let files = new Map();
  let online = true;
  /** @type {Set<string>} */
  const failing = new Set();
  /** @type {string[]} */
  const requested = [];

  const site = {
    /** @param {string} commit */
    deploy(commit) {
      files = new Map();
      for (const file of appFiles())
        files.set(`${SCOPE}${file}`, readFileSync(join(appDir, file), "utf8"));
      files.set(`${SCOPE}`, files.get(`${SCOPE}index.html`) ?? "");
      files.set(
        `${SCOPE}version.js`,
        stampSource(commit, "2026-11-08T21:04:00.000Z"),
      );
      files.set(`${SCOPE}js/main.js`, `// main.js as of ${commit}`);
      return site;
    },
    /** Answers nothing: no signal. */
    offline() {
      online = false;
      return site;
    },
    /** @param {string} path a file the next downloads fail on */
    fail(path) {
      failing.add(`${SCOPE}${path}`);
      return site;
    },
    /** Every URL fetched from the network so far. */
    requested,
    /** @param {string} url @returns {string | undefined} a deployed file */
    file: (url) => files.get(url),
    /**
     * The worker's fetch(). Other origins (the Firebase SDK, fonts) answer
     * with a stand-in body.
     * @param {RequestInfo | URL} input
     */
    async fetch(input) {
      const url = input instanceof Request ? input.url : String(input);
      requested.push(url);
      if (!online) throw new TypeError("Failed to fetch");
      if (failing.has(url)) return new Response("", { status: 500 });
      if (!url.startsWith(SCOPE))
        return new Response(`// ${url}`, { status: 200 });
      const body = files.get(withoutSearch(url));
      return body === undefined
        ? new Response("", { status: 404 })
        : new Response(body, { status: 200 });
    },
  };
  return site;
}

/** One cache: requests by URL, as the browser's Cache does. */
class FakeCache {
  /** @param {(input: RequestInfo | URL) => Promise<Response>} fetch */
  constructor(fetch) {
    this.fetch = fetch;
    /** @type {Map<string, Response>} */
    this.entries = new Map();
  }

  /** @param {RequestInfo | URL} request @param {{ ignoreSearch?: boolean }} [options] */
  async match(request, options = {}) {
    const url = request instanceof Request ? request.url : String(request);
    for (const [key, response] of this.entries)
      if (
        key === url ||
        (options.ignoreSearch && withoutSearch(key) === withoutSearch(url))
      )
        return response.clone();
    return undefined;
  }

  /** @param {RequestInfo | URL} request @param {Response} response */
  async put(request, response) {
    const url = request instanceof Request ? request.url : String(request);
    this.entries.set(url, response.clone());
  }

  /**
   * All or nothing, as the browser does it: one failed download stores none.
   * @param {(RequestInfo | URL)[]} requests
   */
  async addAll(requests) {
    const responses = await Promise.all(
      requests.map(async (request) => {
        const response = await this.fetch(request);
        if (!response.ok) throw new TypeError(`${response.status}`);
        return /** @type {const} */ ([request, response]);
      }),
    );
    for (const [request, response] of responses)
      await this.put(request, response);
  }

  /** The URLs stored. */
  urls() {
    return [...this.entries.keys()];
  }
}

/**
 * The browser's Cache Storage, shared by every worker of one site.
 * @param {(input: RequestInfo | URL) => Promise<Response>} fetch
 */
export function createCacheStorage(fetch) {
  /** @type {Map<string, FakeCache>} */
  const caches = new Map();
  return {
    /** @param {string} name */
    async open(name) {
      if (!caches.has(name)) caches.set(name, new FakeCache(fetch));
      return /** @type {FakeCache} */ (caches.get(name));
    },
    /** @param {string} name */
    async has(name) {
      return caches.has(name);
    },
    /** @param {string} name */
    async delete(name) {
      return caches.delete(name);
    },
    async keys() {
      return [...caches.keys()];
    },
  };
}

/**
 * Starts the site's current sw.js, as the browser does when it finds a new
 * version: the script runs, then the test fires its events.
 * @param {ReturnType<typeof createSite>} site
 * @param {ReturnType<typeof createCacheStorage>} caches
 */
export function startWorker(site, caches) {
  /** @type {Record<string, ((event: any) => void)[]>} */
  const listeners = {};
  const worker = { skippedWaiting: false };
  const scope = vm.createContext({
    URL,
    Request: class extends Request {
      /** @param {RequestInfo | URL} input @param {RequestInit} [init] */
      constructor(input, init) {
        super(typeof input === "string" ? new URL(input, SCOPE) : input, init);
      }
    },
    Response,
    Promise,
    console,
    caches,
    fetch: (/** @type {RequestInfo | URL} */ input) =>
      site.fetch(typeof input === "string" ? new URL(input, SCOPE) : input),
    location: new URL(`${SCOPE}sw.js`),
    clients: {
      claim: async () => {},
    },
    skipWaiting: async () => {
      worker.skippedWaiting = true;
    },
    /** @param {string} type @param {(event: any) => void} listener */
    addEventListener(type, listener) {
      (listeners[type] ??= []).push(listener);
    },
  });
  scope.self = scope;
  scope.globalThis = scope;
  // Imported scripts come off the network as the browser fetches them, so
  // a worker always runs with its own deploy's stamp.
  scope.importScripts = (/** @type {string[]} */ ...paths) => {
    for (const path of paths) {
      const body = site.file(new URL(path, `${SCOPE}sw.js`).href);
      if (body === undefined) throw new Error(`importScripts: no ${path}`);
      vm.runInContext(body, scope);
    }
  };
  vm.runInContext(readFileSync(join(appDir, "sw.js"), "utf8"), scope);

  /**
   * Fires an extendable event and waits for what it extended itself with.
   * @param {string} type
   * @param {object} [fields]
   */
  async function fire(type, fields = {}) {
    /** @type {Promise<unknown>[]} */
    const extensions = [];
    /** @type {Promise<Response> | undefined} */
    let response;
    const event = {
      ...fields,
      waitUntil: (/** @type {Promise<unknown>} */ p) => extensions.push(p),
      respondWith: (/** @type {Promise<Response> | Response} */ r) => {
        response = Promise.resolve(r);
      },
    };
    for (const listener of listeners[type] ?? []) listener(event);
    await Promise.all(extensions);
    return response;
  }

  return Object.assign(worker, {
    install: () => fire("install"),
    activate: () => fire("activate"),
    /** @param {unknown} data */
    message: (data) => fire("message", { data }),
    /**
     * A request from the app, answered as the worker answers it, or by the
     * network when the worker leaves it alone.
     * @param {string} path relative to the app, or an absolute URL
     * @param {RequestInit} [init]
     */
    async request(path, init) {
      const request = new Request(new URL(path, SCOPE), init);
      return (await fire("fetch", { request })) ?? site.fetch(request);
    },
  });
}
