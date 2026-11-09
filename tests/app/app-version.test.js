import { describe, expect, it } from "vitest";
import { appVersion } from "../../app/js/app-version.js";
import { versionDay } from "../../app/js/screens/screen.js";

describe("the app version (#129)", () => {
  it("is the stamp's: dev in the repo's copy", () => {
    expect(appVersion()).toEqual({ commit: "dev", date: "" });
  });

  it("dates a deploy by its day in local time, as More shows it", () => {
    expect(versionDay(new Date(2026, 10, 8, 23, 30).toISOString())).toBe(
      "8 Nov",
    );
    expect(versionDay(new Date(2026, 0, 31, 0, 5).toISOString())).toBe(
      "31 Jan",
    );
  });
});
