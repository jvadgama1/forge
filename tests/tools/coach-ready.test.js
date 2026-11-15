import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getReady } from "../../tools/coach/deployed-checkout.js";
import { git } from "./git-sandbox.js";

// The /coach skill runs the coach command from a detached checkout of
// origin/main beside the repo, so only reviewed code reads or saves
// coaching (#175; spec #170, story 7; ADR-0008). Getting it ready must
// leave the maintainer's own folder and branches as they were.
describe("getting the deployed checkout ready", () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let origin;
  /** @type {string} */
  let repo;
  /** @type {string} */
  let checkout;
  /** @type {string[]} */
  let installs;
  /** @type {string[]} */
  let printed;

  /**
   * Commits files to origin's main, as a merged pull request would.
   * @param {Record<string, string>} files
   * @param {string} message
   */
  const merge = (files, message) => {
    for (const [name, text] of Object.entries(files))
      writeFileSync(join(origin, name), text);
    git(origin, ["-c", "core.autocrlf=false", "add", "."]);
    git(origin, ["commit", "-q", "-m", message]);
    return git(origin, ["rev-parse", "HEAD"]);
  };

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "coach-ready-"));
    origin = join(dir, "origin");
    repo = join(dir, "Exercise");
    checkout = join(dir, "Exercise-deployed");
    mkdirSync(origin);
    git(origin, ["init", "-q", "-b", "main"]);
    merge(
      {
        ".gitignore": "node_modules/\n",
        "package-lock.json": "lock 1",
        "app.js": "v1",
      },
      "first",
    );
    git(dir, ["clone", "-q", origin, repo]);
    // The maintainer, mid-way through a branch with uncommitted work.
    git(repo, ["switch", "-q", "-c", "12-half-done"]);
    writeFileSync(join(repo, "app.js"), "half done");
    installs = [];
    printed = [];
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** @param {{ failInstall?: boolean }} [options] */
  const ready = ({ failInstall = false } = {}) =>
    getReady({
      repo,
      checkout,
      git,
      npmCi: async (cwd) => {
        installs.push(cwd);
        if (failInstall) throw new Error("npm ci failed");
      },
      print: (text) => printed.push(text),
    });

  /** What the maintainer would see of their own folder. */
  const maintainersFolder = () => ({
    head: git(repo, ["symbolic-ref", "HEAD"]),
    branches: git(repo, [
      "for-each-ref",
      "--format=%(refname) %(objectname)",
      "refs/heads",
    ]),
    status: git(repo, ["status", "--porcelain"]),
  });

  it("makes a detached checkout of origin/main and installs there", async () => {
    const before = maintainersFolder();
    const main = git(origin, ["rev-parse", "HEAD"]);

    expect(await ready()).toBe(0);

    expect(git(checkout, ["rev-parse", "HEAD"])).toBe(main);
    expect(git(checkout, ["rev-parse", "--abbrev-ref", "HEAD"])).toBe("HEAD");
    expect(installs).toEqual([checkout]);
    expect(maintainersFolder()).toEqual(before);
    expect(printed.join("\n")).toContain(main.slice(0, 7));
  });

  it("moves to a newer origin/main without installing when the lockfile is the same", async () => {
    await ready();
    const main = merge({ "app.js": "v2" }, "second");
    const before = maintainersFolder();

    expect(await ready()).toBe(0);

    expect(git(checkout, ["rev-parse", "HEAD"])).toBe(main);
    expect(installs).toEqual([checkout]);
    expect(maintainersFolder()).toEqual(before);
  });

  it("installs again when the lockfile changed", async () => {
    await ready();
    merge({ "package-lock.json": "lock 2" }, "bump a dependency");

    expect(await ready()).toBe(0);

    expect(installs).toEqual([checkout, checkout]);
  });

  it("installs again after an install that failed", async () => {
    await expect(ready({ failInstall: true })).rejects.toThrow("npm ci failed");

    expect(await ready()).toBe(0);

    expect(installs).toEqual([checkout, checkout]);
  });

  it("leaves a checkout with changes where it is", async () => {
    await ready();
    const first = git(checkout, ["rev-parse", "HEAD"]);
    writeFileSync(join(checkout, "app.js"), "edited");
    merge({ "app.js": "v2" }, "second");

    expect(await ready()).toBe(1);

    expect(git(checkout, ["rev-parse", "HEAD"])).toBe(first);
    expect(printed.join("\n")).toContain("has changes");
  });

  it("refuses a folder in its place that isn't a checkout of this repo", async () => {
    mkdirSync(checkout);
    git(checkout, ["init", "-q", "-b", "main"]);
    git(checkout, ["commit", "-q", "--allow-empty", "-m", "other"]);

    expect(await ready()).toBe(1);

    expect(installs).toEqual([]);
    expect(printed.join("\n")).toContain("isn't a checkout of");
  });
});
