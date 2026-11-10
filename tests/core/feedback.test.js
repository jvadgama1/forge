import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** The core on 25 Oct 2026 at 08:00 UTC, as deploy 0a1b2c3, with a movable clock. */
function setup() {
  let clock = new Date("2026-10-25T08:00:00.000Z");
  const f = createForge({
    store: createMemoryStore(),
    library,
    now: () => clock,
    appVersion: { commit: "0a1b2c3", date: "2026-10-24T12:00:00.000Z" },
  });
  return {
    f,
    /** @param {number} minutes */
    later: (minutes) => {
      clock = new Date(clock.getTime() + minutes * 60_000);
    },
  };
}

describe("feedback (#124)", () => {
  it("is sent with its text, the time, and the app version", async () => {
    const { f } = setup();
    const sent = await f.sendFeedback("The rest timer is too quiet");
    expect(await f.listFeedback()).toEqual([
      {
        id: sent.id,
        text: "The rest timer is too quiet",
        sentAt: "2026-10-25T08:00:00.000Z",
        appVersion: { commit: "0a1b2c3", date: "2026-10-24T12:00:00.000Z" },
      },
    ]);
  });

  it("is sent with the workout in progress, if there is one", async () => {
    const { f } = setup();
    const workout = await f.startWorkout("gym-1");
    const sent = await f.sendFeedback("Undo is hard to reach");
    expect(sent.workoutId).toBe(workout.id);
    expect((await f.listFeedback())[0].workoutId).toBe(workout.id);
  });

  it("isn't tied to a workout once it has finished", async () => {
    const { f } = setup();
    const workout = await f.startWorkout("gym-1");
    await f.finishWorkout(workout.id);
    const sent = await f.sendFeedback("Finish took two taps");
    expect("workoutId" in sent).toBe(false);
  });

  it("is sent trimmed, and refused with nothing in it", async () => {
    const { f } = setup();
    await expect(f.sendFeedback("   \n ")).rejects.toThrow(
      "Write some feedback first",
    );
    expect(await f.listFeedback()).toEqual([]);
    const sent = await f.sendFeedback("  Two lines\nof feedback \n");
    expect(sent.text).toBe("Two lines\nof feedback");
  });

  it("is listed newest first", async () => {
    const { f, later } = setup();
    await f.sendFeedback("First");
    later(90);
    await f.sendFeedback("Second");
    later(1);
    await f.sendFeedback("Third");
    expect((await f.listFeedback()).map((item) => item.text)).toEqual([
      "Third",
      "Second",
      "First",
    ]);
  });

  it("records the issue an item was filed as", async () => {
    const { f, later } = setup();
    const kept = await f.sendFeedback("Kept");
    const filed = await f.sendFeedback("Filed");
    later(5);
    await f.markFeedbackFiled(filed.id, 131);
    const items = await f.listFeedback();
    expect(items.find((item) => item.id === filed.id)?.filed).toBe(131);
    expect(items.find((item) => item.id === kept.id)).toEqual(kept);
  });

  it("refuses to mark an item filed that doesn't exist, or with no issue number", async () => {
    const { f } = setup();
    const sent = await f.sendFeedback("Something");
    await expect(f.markFeedbackFiled("nope", 12)).rejects.toThrow(
      "Feedback not found",
    );
    await expect(f.markFeedbackFiled(sent.id, 0)).rejects.toThrow(
      "An issue number is a whole number from 1",
    );
    await expect(f.markFeedbackFiled(sent.id, 1.5)).rejects.toThrow(
      "An issue number is a whole number from 1",
    );
  });

  it("is sent as version dev when the core is given none", async () => {
    const f = createForge({
      store: createMemoryStore(),
      library,
      now: () => new Date("2026-10-25T08:00:00.000Z"),
    });
    const sent = await f.sendFeedback("Something");
    expect(sent.appVersion).toEqual({ commit: "dev", date: "" });
  });
});
