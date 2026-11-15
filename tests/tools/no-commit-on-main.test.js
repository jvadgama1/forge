import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SH, gitFreeEnv } from "./git-sandbox.js";

const guard = resolve("tools/hooks/no-commit-on-main.sh");

// Branch protection stops a push to main; the guard stops the commit
// before it (#152).
describe("the guard against committing on main", () => {
  /** @type {string} */
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "guard-"));
    git(["init", "-q", "-b", "main"]);
    git(["commit", "-q", "--allow-empty", "-m", "base"]);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** @param {string[]} args */
  const git = (args) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      { cwd: dir, encoding: "utf8", env: gitFreeEnv() },
    );
  const run = () => {
    const result = spawnSync(SH, [guard], {
      cwd: dir,
      encoding: "utf8",
      env: gitFreeEnv(),
    });
    expect(result.error).toBeUndefined();
    return result;
  };

  it("refuses a commit on main and says where to commit", () => {
    const result = run();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("main is protected");
    expect(result.stderr).toContain("<n>-<slug>");
  });

  it("lets a commit on an issue branch through, silently", () => {
    git(["switch", "-q", "-c", "152-guard-main"]);
    const result = run();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("lets a commit through with no branch checked out", () => {
    git(["switch", "-q", "--detach"]);
    expect(run().status).toBe(0);
  });
});
