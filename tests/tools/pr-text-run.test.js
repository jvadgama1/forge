import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { gitFreeEnv } from "./git-sandbox.js";

const script = resolve("tools/pr-text/pr-text.js");

describe("the PR text check in CI (#153)", () => {
  /** @type {string} */
  let dir;
  /** @type {string} */
  let pwned;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pr-text-"));
    pwned = join(dir, "pwned").replaceAll("\\", "/");
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** @param {string[]} args */
  const git = (args) =>
    execFileSync(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
      { cwd: dir, encoding: "utf8", env: gitFreeEnv() },
    ).trim();

  /**
   * A throwaway repo with one base commit, then the PR's commits.
   * @param {string[]} messages
   */
  const repo = (messages) => {
    git(["init", "-q"]);
    git(["commit", "-q", "--allow-empty", "-m", "base"]);
    const base = git(["rev-parse", "HEAD"]);
    for (const message of messages)
      git(["commit", "-q", "--allow-empty", "-m", message]);
    return { base, head: git(["rev-parse", "HEAD"]) };
  };

  /**
   * Runs the check as CI does, in the throwaway repo.
   * @param {{ title: string, body: string | null }} pr
   * @param {string[]} [messages] the PR's commit messages
   */
  const run = (pr, messages = []) => {
    const { base, head } = repo(messages);
    const event = join(dir, "event.json");
    writeFileSync(
      event,
      JSON.stringify({
        pull_request: { ...pr, base: { sha: base }, head: { sha: head } },
      }),
    );
    return spawnSync(process.execPath, [script], {
      cwd: dir,
      encoding: "utf8",
      env: { ...gitFreeEnv(), GITHUB_EVENT_PATH: event },
    });
  };

  it("passes a PR with no conflict, and one with no body", () => {
    expect(run({ title: "fix: x", body: "Closes #5" }).status).toBe(0);
    rmSync(join(dir, ".git"), { recursive: true, force: true });
    expect(run({ title: "fix: x", body: null }).status).toBe(0);
  });

  it("fails a conflict in a commit message and says which commit", () => {
    const result = run({ title: "fix: x", body: "Part of #5" }, [
      "feat: one",
      "feat: two\n\nFixes #5",
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/^commit [0-9a-f]{7}: "fixes #5"/);
  });

  it("reads hostile PR text and commit messages as data: nothing in them runs", () => {
    const hostile = `$(touch ${pwned}) \`touch ${pwned}\` "; touch ${pwned}; exit 0; " closes #9`;
    const result = run({ title: hostile, body: `Part of #9\n${hostile}` }, [
      hostile,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("title");
    expect(result.stderr).toContain("body");
    expect(result.stderr).toMatch(/commit [0-9a-f]{7}/);
    expect(existsSync(pwned)).toBe(false);
  });
});
