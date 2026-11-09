import { describe, expect, it } from "vitest";
import { createUpdates } from "../../app/js/updates.js";

/**
 * A browser's service workers for one site, as js/updates.js sees them
 * (#129): a version running, and new ones arriving as the browser downloads
 * them.
 */
class FakeWorker extends EventTarget {
  /** @param {string} state @param {FakeBrowser} browser */
  constructor(state, browser) {
    super();
    this.state = state;
    this.browser = browser;
    /** @type {unknown[]} */
    this.messages = [];
  }

  /** @param {unknown} message */
  postMessage(message) {
    this.messages.push(message);
    if (message === "switch" && this.browser.switches)
      this.browser.activate(this);
  }

  /** @param {string} state */
  become(state) {
    this.state = state;
    this.dispatchEvent(new Event("statechange"));
  }
}

class FakeBrowser {
  /** @param {{ running?: boolean }} [options] */
  constructor({ running = true } = {}) {
    this.container = Object.assign(new EventTarget(), {
      /** @type {FakeWorker | null} */
      controller: null,
      getRegistration: async () =>
        this.registered ? this.registration : undefined,
      /** @param {string} url @param {RegistrationOptions} options */
      register: async (url, options) => {
        this.registrations.push({ url, options });
        this.registered = true;
        return this.registration;
      },
    });
    this.registration = Object.assign(new EventTarget(), {
      /** @type {FakeWorker | null} */
      installing: null,
      /** @type {FakeWorker | null} */
      waiting: null,
      /** @type {FakeWorker | null} */
      active: null,
      update: async () => {
        this.checks++;
        if (this.offline) throw new TypeError("Failed to fetch");
        if (this.deployed) this.download();
      },
    });
    /** @type {{ url: string, options: RegistrationOptions }[]} */
    this.registrations = [];
    this.registered = running;
    this.checks = 0;
    this.offline = false;
    /** A new version is on the site, for the next check to find. */
    this.deployed = false;
    /** The download the next check starts fails. */
    this.failing = false;
    /** Whether a worker asked to switch takes over. */
    this.switches = true;
    /** The service worker claims the page on its first install. */
    this.claims = true;
    if (running) {
      const active = new FakeWorker("activated", this);
      this.registration.active = active;
      this.container.controller = active;
    }
  }

  /** The browser finds a new version and downloads it. */
  download() {
    this.deployed = false;
    const worker = new FakeWorker("installing", this);
    this.registration.installing = worker;
    this.registration.dispatchEvent(new Event("updatefound"));
    // The download finishes after the check has answered.
    setTimeout(() => {
      this.registration.installing = null;
      if (this.failing) return worker.become("redundant");
      if (this.registration.active) this.registration.waiting = worker;
      worker.become("installed");
      if (!this.registration.active) this.activate(worker);
    });
  }

  /** @param {FakeWorker} worker */
  activate(worker) {
    this.registration.waiting = null;
    this.registration.active = worker;
    worker.become("activated");
    const first = !this.container.controller;
    this.container.controller = worker;
    if (!first || this.claims)
      this.container.dispatchEvent(new Event("controllerchange"));
  }

  /** A version already downloaded and waiting, as after the app was last closed. */
  waiting() {
    const worker = new FakeWorker("installed", this);
    this.registration.waiting = worker;
    return worker;
  }
}

/** The page: shown or in the background. */
function fakePage() {
  const page = Object.assign(new EventTarget(), {
    /** @type {DocumentVisibilityState} */
    visibilityState: "visible",
    /** @param {DocumentVisibilityState} state */
    show(state) {
      page.visibilityState = state;
      page.dispatchEvent(new Event("visibilitychange"));
    },
  });
  return page;
}

/** @param {FakeBrowser} browser */
function start(browser) {
  const page = fakePage();
  const reloads = { count: 0 };
  const updates = createUpdates({
    container: /** @type {ServiceWorkerContainer} */ (
      /** @type {unknown} */ (browser.container)
    ),
    page,
    reload: () => reloads.count++,
    wait: 20,
  });
  return { updates, page, reloads };
}

/** Lets the downloads and checks in flight finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("app updates (#129)", () => {
  it("switches to a version already waiting before the first screen is drawn, without asking", async () => {
    const browser = new FakeBrowser();
    const next = browser.waiting();
    const { updates, reloads } = start(browser);

    expect(await updates.open()).toBe(true);
    expect(next.messages).toEqual(["switch"]);
    expect(reloads.count).toBe(1);
  });

  it("draws the app at once when nothing is waiting, and checks for a new version", async () => {
    const browser = new FakeBrowser();
    const { updates, reloads } = start(browser);

    expect(await updates.open()).toBe(false);
    await settle();
    expect(reloads.count).toBe(0);
    expect(browser.registrations).toEqual([
      { url: "./sw.js", options: { updateViaCache: "none" } },
    ]);
    expect(browser.checks).toBe(1);
  });

  it("offers the update when a new version finishes downloading in use, and never reloads by itself", async () => {
    const browser = new FakeBrowser();
    const { updates, reloads } = start(browser);
    let offered = 0;
    updates.onReady(() => offered++);
    await updates.open();
    expect(updates.ready).toBe(false);

    browser.deployed = true;
    await updates.check();
    await settle();

    expect(updates.ready).toBe(true);
    expect(offered).toBe(1);
    expect(reloads.count).toBe(0);
    expect(browser.registration.waiting?.messages).toEqual([]);
  });

  it("switches and reloads only on Update", async () => {
    const browser = new FakeBrowser();
    const { updates, reloads } = start(browser);
    await updates.open();
    browser.deployed = true;
    await updates.check();
    const next = /** @type {FakeWorker} */ (browser.registration.waiting);

    await updates.update();

    expect(next.messages).toEqual(["switch"]);
    expect(reloads.count).toBe(1);
  });

  it("checks again whenever the app returns to the foreground", async () => {
    const browser = new FakeBrowser();
    const { updates, page } = start(browser);
    await updates.open();
    await settle();

    page.show("hidden");
    page.show("visible");
    await settle();

    expect(browser.checks).toBe(2);
  });

  it("doesn't offer the very first install as a new version", async () => {
    const browser = new FakeBrowser({ running: false });
    browser.deployed = true;
    const { updates } = start(browser);

    await updates.open();
    await settle();

    expect(updates.ready).toBe(false);
  });

  it("offers the update in a window still on the old version once another switches", async () => {
    const browser = new FakeBrowser();
    const { updates, reloads } = start(browser);
    await updates.open();

    browser.activate(new FakeWorker("installed", browser));
    expect(updates.ready).toBe(true);
    expect(reloads.count).toBe(0);

    await updates.update();
    expect(reloads.count).toBe(1);
  });

  it("opens on the version it has if the waiting one won't take over", async () => {
    const browser = new FakeBrowser();
    browser.switches = false;
    browser.waiting();
    const { updates, reloads } = start(browser);

    expect(await updates.open()).toBe(false);
    await settle();
    expect(reloads.count).toBe(0);
    expect(updates.ready).toBe(true);
  });

  describe("checking on request", () => {
    it("reports up to date when the site has nothing newer", async () => {
      const browser = new FakeBrowser();
      const { updates } = start(browser);
      await updates.open();
      expect(await updates.check()).toBe("up-to-date");
    });

    it("reports ready once a newer version has downloaded", async () => {
      const browser = new FakeBrowser();
      const { updates } = start(browser);
      await updates.open();
      browser.deployed = true;
      expect(await updates.check()).toBe("ready");
    });

    it("can't tell with no signal, or when the download fails", async () => {
      const browser = new FakeBrowser();
      const { updates } = start(browser);
      await updates.open();
      browser.offline = true;
      expect(await updates.check()).toBe("unavailable");

      browser.offline = false;
      browser.deployed = true;
      browser.failing = true;
      expect(await updates.check()).toBe("unavailable");
      expect(updates.ready).toBe(false);
    });

    it("can't tell in a browser without service workers", async () => {
      const updates = createUpdates({
        container: undefined,
        page: fakePage(),
        reload: () => {},
      });
      expect(await updates.open()).toBe(false);
      expect(await updates.check()).toBe("unavailable");
    });
  });
});
