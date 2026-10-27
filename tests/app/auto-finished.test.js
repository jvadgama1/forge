import { describe, expect, it } from "vitest";
import { autoFinishedLine } from "../../app/js/screens/auto-finished.js";

/**
 * A workout dated `date`, finished at 19:42 that day, seen at `now`.
 * @param {string} date YYYY-MM-DD
 * @param {Date} now
 * @param {{ exercises?: number, sets?: number }} [counts]
 */
const line = (date, now, { exercises = 5, sets = 18 } = {}) =>
  autoFinishedLine({
    date,
    finishedAt: new Date(`${date}T19:42:00`),
    exercises,
    sets,
    now,
  });

// Tuesday 27 Oct 2026, 09:00 local.
const tuesday = new Date(2026, 9, 27, 9, 0);

describe("the line for an auto-finished workout (#45)", () => {
  it("names a workout from today", () => {
    expect(line("2026-10-27", new Date(2026, 9, 27, 23, 0))).toBe(
      "Today's workout was finished at 7:42 pm. 5 exercises, 18 sets.",
    );
  });

  it("names yesterday's", () => {
    expect(line("2026-10-26", tuesday)).toBe(
      "Yesterday's workout was finished at 7:42 pm. 5 exercises, 18 sets.",
    );
  });

  it("names the weekday within the past week", () => {
    expect(line("2026-10-25", tuesday)).toMatch(/^Sunday's workout /);
    expect(line("2026-10-21", tuesday)).toMatch(/^Wednesday's workout /);
  });

  it("gives the date beyond that", () => {
    expect(line("2026-10-20", tuesday)).toBe(
      "Your 20 Oct workout was finished at 7:42 pm. 5 exercises, 18 sets.",
    );
  });

  it("says morning times and singulars plainly", () => {
    expect(
      autoFinishedLine({
        date: "2026-10-26",
        finishedAt: new Date(2026, 9, 26, 0, 5),
        exercises: 1,
        sets: 1,
        now: tuesday,
      }),
    ).toBe("Yesterday's workout was finished at 12:05 am. 1 exercise, 1 set.");
  });
});
