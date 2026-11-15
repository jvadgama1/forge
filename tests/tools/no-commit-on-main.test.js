import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SH, git, run } from "./git-sandbox.js";

const guard = resolve("tools/hooks/no-commit-on-main.sh");

// Branch protection stops a push to main; the guard stops the commit
// before it (#152).
describe("the guard against committing on main", () => {
  /** @type {string} */
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "guard-"));
    git(dir, ["init", "-q", "-b", "main"]);
    git(dir, ["commit", "-q", "--allow-empty", "-m", "base"]);
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const runGuard = () => {
    const result = run(SH, [guard], { cwd: dir });
    expect(result.error).toBeUndefined();
    return result;
  };

  it("refuses a commit on main and says where to commit", () => {
    const result = runGuard();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("main is protected");
    expect(result.stderr).toContain("<n>-<slug>");
  });

  it("lets a commit on an issue branch through, silently", () => {
    git(dir, ["switch", "-q", "-c", "152-guard-main"]);
    const result = runGuard();
    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
  });

  it("lets a commit through with no branch checked out", () => {
    git(dir, ["switch", "-q", "--detach"]);
    expect(runGuard().status).toBe(0);
  });
});
