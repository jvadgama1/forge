import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// The CI step (#153) reads the PR from GitHub's event file and the commits
// from git. Here both ends of the commit range are HEAD, so no commits.
const head = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();

describe("the PR text check in CI (#153)", () => {
  /** @type {string} */
  let dir;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "pr-text-"));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  /** @param {{ title: string, body: string | null }} pr */
  const run = (pr) => {
    const event = join(dir, "event.json");
    writeFileSync(
      event,
      JSON.stringify({
        pull_request: { ...pr, base: { sha: head }, head: { sha: head } },
      }),
    );
    return spawnSync(process.execPath, ["tools/pr-text/run.js"], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_EVENT_PATH: event },
    });
  };

  it("passes a PR with no conflict, and one with no body", () => {
    expect(run({ title: "fix: x", body: "Closes #5" }).status).toBe(0);
    expect(run({ title: "fix: x", body: null }).status).toBe(0);
  });

  it("fails a conflict and says where it is", () => {
    const result = run({ title: "fix: x", body: "Part of #5\nfixes #5" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("body");
    expect(result.stderr).toContain("#5");
  });

  it("reads hostile PR text as data: nothing in it runs", () => {
    const pwned = join(dir, "pwned").replaceAll("\\", "/");
    const hostile = `$(touch ${pwned}) \`touch ${pwned}\` "; touch ${pwned}; " closes #9`;
    const result = run({ title: hostile, body: `Part of #9\n${hostile}` });
    expect(result.status).toBe(1);
    expect(existsSync(pwned)).toBe(false);
  });
});
