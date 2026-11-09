import { describe, expect, it } from "vitest";
import {
  createCacheStorage,
  createSite,
  shellList,
  startWorker,
} from "./worker-scope.js";

/** A site deployed at `commit`, and the browser's caches for it. */
function deployed(/** @type {string} */ commit) {
  const site = createSite().deploy(commit);
  const caches = createCacheStorage((input) => site.fetch(input));
  return { site, caches };
}

/**
 * A version that has installed and taken over, as on a phone that has
 * opened the app once.
 * @param {ReturnType<typeof deployed>} browser
 */
async function running({ site, caches }) {
  const worker = startWorker(site, caches);
  await worker.install();
  await worker.activate();
  return worker;
}

/** @param {Response} response */
const text = (response) => response.text();

describe("the service worker (#129)", () => {
  it("installs a version whole: every SHELL file in a cache named after its commit", async () => {
    const browser = deployed("aaaaaaa");
    await startWorker(browser.site, browser.caches).install();

    const cache = await browser.caches.open("forge-aaaaaaa");
    expect(cache.urls().sort()).toEqual(
      shellList()
        .map((entry) => new URL(entry, "https://forge.test/").href)
        .sort(),
    );
  });

  it("answers from the active version's cache alone, even once a new version is deployed", async () => {
    const browser = deployed("aaaaaaa");
    const worker = await running(browser);
    browser.site.deploy("bbbbbbb");
    const before = browser.site.requested.length;

    expect(await text(await worker.request("js/main.js"))).toBe(
      "// main.js as of aaaaaaa",
    );
    expect(await text(await worker.request("version.js?v=2"))).toContain(
      '"aaaaaaa"',
    );
    expect(browser.site.requested.slice(before)).toEqual([]);
  });

  it("never lets a version that failed to download take over: the running one keeps serving", async () => {
    const browser = deployed("aaaaaaa");
    const old = await running(browser);
    browser.site.deploy("bbbbbbb").fail("js/screens/log.js");

    const next = startWorker(browser.site, browser.caches);
    await expect(next.install()).rejects.toThrow();

    // A failed install is thrown away by the browser, never activated.
    expect(next.skippedWaiting).toBe(false);
    expect(await text(await old.request("js/main.js"))).toBe(
      "// main.js as of aaaaaaa",
    );
    const partial = await browser.caches.open("forge-bbbbbbb");
    expect(partial.urls()).toEqual([]);
  });

  it("waits once installed, taking over only when the app says to switch", async () => {
    const browser = deployed("aaaaaaa");
    await running(browser);
    browser.site.deploy("bbbbbbb");
    const next = startWorker(browser.site, browser.caches);

    await next.install();
    expect(next.skippedWaiting).toBe(false);
    await next.message("switch");
    expect(next.skippedWaiting).toBe(true);
  });

  it("takes over at once from the service worker before #129, whose pages can't offer the update", async () => {
    const browser = deployed("aaaaaaa");
    await browser.caches.open("forge-shell-v1");
    const first = startWorker(browser.site, browser.caches);

    await first.install();
    expect(first.skippedWaiting).toBe(true);
  });

  it("deletes older versions' caches once a new version is active", async () => {
    const browser = deployed("aaaaaaa");
    await running(browser);
    // What the service worker before #129 kept.
    await browser.caches.open("forge-shell-v1");
    browser.site.deploy("bbbbbbb");
    const next = startWorker(browser.site, browser.caches);
    await next.install();
    expect((await browser.caches.keys()).sort()).toEqual([
      "forge-aaaaaaa",
      "forge-bbbbbbb",
      "forge-shell-v1",
    ]);

    await next.activate();
    expect(await browser.caches.keys()).toEqual(["forge-bbbbbbb"]);
    expect(await text(await next.request("js/main.js"))).toBe(
      "// main.js as of bbbbbbb",
    );
  });

  it("opens with no signal: every SHELL file comes from the version it has", async () => {
    const browser = deployed("aaaaaaa");
    const worker = await running(browser);
    browser.site.offline();

    for (const entry of shellList()) {
      const response = await worker.request(entry);
      expect(response.status, entry).toBe(200);
    }
    // The app opening: its page, and the address it's installed at.
    expect((await worker.request("./?as=owner")).status).toBe(200);
    expect(await text(await worker.request("js/main.js"))).toBe(
      "// main.js as of aaaaaaa",
    );
  });

  it("keeps a font once fetched, for next time with no signal", async () => {
    const browser = deployed("aaaaaaa");
    const worker = await running(browser);
    const font = "https://fonts.gstatic.com/s/jetbrainsmono/v1/a.woff2";
    await worker.request(font);
    browser.site.offline();
    expect((await worker.request(font)).status).toBe(200);
  });

  it("leaves Firestore and sign-in traffic to the network", async () => {
    const browser = deployed("aaaaaaa");
    const worker = await running(browser);
    browser.site.offline();
    await expect(
      worker.request("https://firestore.googleapis.com/v1/projects/x"),
    ).rejects.toThrow();
  });
});
