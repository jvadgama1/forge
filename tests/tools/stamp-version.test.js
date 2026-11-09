import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";
import { stampSource } from "../../tools/stamp-version.js";

const placeholder = readFileSync(
  new URL("../../app/version.js", import.meta.url),
  "utf8",
);

/** What a stamp sets when run as a script, as the service worker runs it. */
function run(/** @type {string} */ source) {
  const scope = vm.createContext({});
  vm.runInContext(source, scope);
  return scope.forgeAppVersion;
}

describe("the app version stamp (#129)", () => {
  it("is a placeholder reading dev in the repo, so local runs, tests and shots work unchanged", () => {
    expect(run(placeholder)).toEqual({ commit: "dev", date: "" });
  });

  it("is written by the deploy in the same form as the repo's placeholder", () => {
    expect(stampSource("dev", "")).toBe(placeholder);
  });

  it("names the deploy's commit, short, and its date", () => {
    expect(
      run(
        stampSource(
          "02c4ce5a1b2c3d4e5f60718293a4b5c6d7e8f901",
          "2026-11-08T21:04:00.000Z",
        ),
      ),
    ).toEqual({ commit: "02c4ce5", date: "2026-11-08T21:04:00.000Z" });
  });

  it("refuses anything but a commit, so a stamp is never broken script", () => {
    expect(() =>
      stampSource('"; alert(1); "', "2026-11-08T21:04:00.000Z"),
    ).toThrow();
  });
});
