import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SH, git, run } from "./git-sandbox.js";

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

  /** Points this process's git at the decoy, as a hook would. */
  const hookPointsAtDecoy = () => {
    process.env.GIT_DIR = join(decoy, ".git");
    process.env.GIT_INDEX_FILE = join(decoy, ".git", "index");
  };

  it("leaves the repo a hook's GIT_DIR points at alone", () => {
    git(decoy, ["init", "-q"]);
    git(decoy, ["commit", "-q", "--allow-empty", "-m", "decoy"]);
    hookPointsAtDecoy();

    git(sandbox, ["init", "-q"]);
    git(sandbox, ["commit", "-q", "--allow-empty", "-m", "sandbox"]);

    delete process.env.GIT_DIR;
    delete process.env.GIT_INDEX_FILE;
    expect(git(decoy, ["log", "--format=%s"])).toBe("decoy");
    expect(git(decoy, ["rev-parse", "--is-bare-repository"])).toBe("false");
    expect(git(sandbox, ["log", "--format=%s"])).toBe("sandbox");
  });

  it("strips a hook's GIT_DIR from a process and keeps the env it's given", () => {
    git(decoy, ["init", "-q"]);
    hookPointsAtDecoy();

    const result = run(SH, ["-c", 'echo "${GIT_DIR-none} $FORGE_TEST"'], {
      cwd: sandbox,
      env: { FORGE_TEST: "own" },
    });
    expect(result.stdout.trim()).toBe("none own");
  });

  it("finds a POSIX sh even where it isn't on PATH, as in PowerShell", () => {
    const result = run(SH, ["-c", "echo ok"], { env: { PATH: "" } });
    expect(result.error).toBeUndefined();
    expect(result.stdout.trim()).toBe("ok");
  });
});
