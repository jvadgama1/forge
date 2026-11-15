import { describe, expect, it } from "vitest";
import { lastCoached } from "../../app/js/screens/coach.js";

// The line under the Coach heading (#176; spec #170, story 67): how long
// since the latest coaching session, by local calendar day, so you can tell
// when it's time for another without a scheduled review.
describe("last coached", () => {
  // Noon UTC is the same calendar day in every time zone the test may run in.
  it("says today for a coaching session saved today", () => {
    expect(lastCoached("2026-11-15T12:00:00.000Z", "2026-11-15")).toBe(
      "Last coached today",
    );
  });

  it("says yesterday for one saved the day before", () => {
    expect(lastCoached("2026-11-14T12:00:00.000Z", "2026-11-15")).toBe(
      "Last coached yesterday",
    );
  });

  it("counts the days since an older one", () => {
    expect(lastCoached("2026-11-13T12:00:00.000Z", "2026-11-15")).toBe(
      "Last coached 2 days ago",
    );
    expect(lastCoached("2026-10-24T12:00:00.000Z", "2026-11-15")).toBe(
      "Last coached 22 days ago",
    );
  });

  it("counts calendar days across a month and a year", () => {
    expect(lastCoached("2025-12-30T12:00:00.000Z", "2026-01-02")).toBe(
      "Last coached 3 days ago",
    );
  });

  it("says today for one dated after today, as a clock set behind may", () => {
    expect(lastCoached("2026-11-16T12:00:00.000Z", "2026-11-15")).toBe(
      "Last coached today",
    );
  });
});
