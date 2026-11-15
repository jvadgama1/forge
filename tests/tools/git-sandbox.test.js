import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SH, gitFreeEnv } from "./git-sandbox.js";

// Inside a hook, git exports GIT_DIR, GIT_INDEX_FILE and others to the
// tests the hook runs. A test's git must ignore them (#163).
describe("running git in a throwaway repo", () => {
  /** @type {string} */
  let decoy;
  /** @type {string} */
  let sandbox;
  beforeEach(() => {
    decoy = mkdtempSync(join(tmpdir(), "decoy-"));
    sandbox = mkdtempSync(join(tmpdir(), "sandbox-"));
  });
  afterEach(() => {
    delete process.env.GIT_DIR;
    delete process.env.GIT_INDEX_FILE;
    rmSync(decoy, { recursive: true, force: true });
    rmSync(sandbox, { recursive: true, force: true });
  });

  /** @param {string} cwd @param {string[]} args */
  const git = (cwd, args) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      { cwd, encoding: "utf8", env: gitFreeEnv() },
    ).trim();

  it("leaves the repo a hook's GIT_DIR points at alone", () => {
    git(decoy, ["init", "-q"]);
    git(decoy, ["commit", "-q", "--allow-empty", "-m", "decoy"]);
    process.env.GIT_DIR = join(decoy, ".git");
    process.env.GIT_INDEX_FILE = join(decoy, ".git", "index");

    git(sandbox, ["init", "-q"]);
    git(sandbox, ["commit", "-q", "--allow-empty", "-m", "sandbox"]);

    delete process.env.GIT_DIR;
    delete process.env.GIT_INDEX_FILE;
    expect(git(decoy, ["log", "--format=%s"])).toBe("decoy");
    expect(git(decoy, ["rev-parse", "--is-bare-repository"])).toBe("false");
    expect(git(sandbox, ["log", "--format=%s"])).toBe("sandbox");
  });

  it("finds a POSIX sh even where it isn't on PATH, as in PowerShell", () => {
    const result = spawnSync(SH, ["-c", "echo ok"], {
      encoding: "utf8",
      env: { ...gitFreeEnv(), PATH: "" },
    });
    expect(result.error).toBeUndefined();
    expect(result.stdout.trim()).toBe("ok");
  });
});
