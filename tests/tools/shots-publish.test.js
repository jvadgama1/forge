import { describe, expect, it } from "vitest";
import { publishPlan, repoOf } from "../../tools/shots/publish-plan.js";

describe("publishing shots to a pull request (#109)", () => {
  it("puts each shot under pr/<n>/, named for its run, with an image tag for the body", () => {
    expect(
      publishPlan({
        repo: "jvadgama1/forge",
        pr: "113",
        label: "after",
        shots: ["workout", "superset-360"],
      }),
    ).toEqual({
      files: [
        { shot: "workout", path: "pr/113/after-workout.png" },
        { shot: "superset-360", path: "pr/113/after-superset-360.png" },
      ],
      message: "chore: screenshots for PR #113",
      tags: [
        '<img src="https://raw.githubusercontent.com/jvadgama1/forge/screenshots/pr/113/after-workout.png" width="200" alt="after: workout">',
        '<img src="https://raw.githubusercontent.com/jvadgama1/forge/screenshots/pr/113/after-superset-360.png" width="200" alt="after: superset-360">',
      ],
    });
  });

  it("takes a shot named with its .png", () => {
    expect(
      publishPlan({
        repo: "jvadgama1/forge",
        pr: "7",
        label: "before",
        shots: ["home.png"],
      }).files,
    ).toEqual([{ shot: "home", path: "pr/7/before-home.png" }]);
  });

  it.each([
    [{ pr: "0" }, "pull request number"],
    [{ pr: "#113" }, "pull request number"],
    [{ label: "../main" }, "label"],
    [{ shots: [] }, "at least one shot"],
    [{ shots: ["../../secrets"] }, "shot name"],
  ])("refuses %o", (bad, complaint) => {
    const args = {
      repo: "jvadgama1/forge",
      pr: "113",
      label: "after",
      shots: ["workout"],
      ...bad,
    };
    expect(() => publishPlan(args)).toThrow(complaint);
  });
});

describe("the GitHub repository a remote points at", () => {
  it.each([
    "https://github.com/jvadgama1/forge.git",
    "https://github.com/jvadgama1/forge",
    "git@github.com:jvadgama1/forge.git",
  ])("reads %s", (url) => {
    expect(repoOf(url)).toBe("jvadgama1/forge");
  });

  it("refuses a remote that isn't on GitHub", () => {
    expect(() => repoOf("https://gitlab.com/someone/forge.git")).toThrow(
      "GitHub",
    );
  });
});
