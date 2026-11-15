import { describe, expect, it } from "vitest";
import { createForge } from "../../app/js/core/forge.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { library } from "./library-fixture.js";

/** The core on 14 Nov 2026 at 20:00 UTC, with a movable clock. */
function setup() {
  let clock = new Date("2026-11-14T20:00:00.000Z");
  const f = createForge({
    store: createMemoryStore(),
    library,
    now: () => clock,
  });
  return {
    f,
    /** @param {number} hours */
    later: (hours) => {
      clock = new Date(clock.getTime() + hours * 3_600_000);
    },
  };
}

/** A made-up coaching session entry, as the coach drafts it. */
const draft = (id = "cs-1") => ({
  id,
  verdict: "Your legs are on holiday. Stay hard.",
  insights: [
    {
      title: "Squat stalled",
      body: "Three weeks at 225 lb for 6: add a back-off set.",
      level: /** @type {const} */ ("training"),
    },
    {
      title: "Sleep",
      body: "Under 7 hours on training nights blunts recovery.",
      level: /** @type {const} */ ("strategy"),
    },
  ],
  commitments: [{ text: "Squat twice a week" }],
  followUps: [
    {
      sessionId: "cs-0",
      commitment: "Log every set",
      result: "Done: 14 of 14 workouts logged",
      checkedBy: /** @type {const} */ ("data"),
    },
  ],
  corrections: [{ sessionId: "cs-0", text: "The row wasn't a gap" }],
});

describe("coaching sessions (#172)", () => {
  it("are saved with the time and listed newest first", async () => {
    const { f, later } = setup();
    await f.saveCoachingSession(draft("cs-1"));
    later(48);
    await f.saveCoachingSession({ ...draft("cs-2"), verdict: "Better." });
    later(1);
    await f.saveCoachingSession({ ...draft("cs-3"), verdict: "Best." });
    const sessions = await f.listCoachingSessions();
    expect(sessions.map((s) => [s.id, s.savedAt])).toEqual([
      ["cs-3", "2026-11-16T21:00:00.000Z"],
      ["cs-2", "2026-11-16T20:00:00.000Z"],
      ["cs-1", "2026-11-14T20:00:00.000Z"],
    ]);
    expect(sessions[2]).toEqual({
      ...draft("cs-1"),
      savedAt: "2026-11-14T20:00:00.000Z",
    });
  });

  it("are only added: one whose id exists is refused, and the stored one is unchanged", async () => {
    const { f, later } = setup();
    const saved = await f.saveCoachingSession(draft("cs-1"));
    later(2);
    await expect(
      f.saveCoachingSession({ ...draft("cs-1"), verdict: "Rewritten" }),
    ).rejects.toThrow("This coaching session is already saved");
    expect(await f.listCoachingSessions()).toEqual([saved]);
  });

  it("are saved with no commitments, follow-ups or corrections, in the stored shape", async () => {
    const { f } = setup();
    await f.saveCoachingSession(
      /** @type {any} */ ({
        id: "cs-1",
        verdict: "  First look. Stay hard.  ",
        insights: [{ title: " Volume ", body: "Low.\n", level: "training" }],
        corrections: [],
        mood: "made-up field the shape doesn't have",
      }),
    );
    expect(await f.listCoachingSessions()).toEqual([
      {
        id: "cs-1",
        savedAt: "2026-11-14T20:00:00.000Z",
        verdict: "First look. Stay hard.",
        insights: [{ title: "Volume", body: "Low.", level: "training" }],
        commitments: [],
        followUps: [],
      },
    ]);
  });

  const insight = draft().insights[0];
  const followUp = draft().followUps[0];
  it.each([
    ["no id", { id: "" }, "A coaching session needs an id"],
    ["no verdict", { verdict: "  " }, "A coaching session needs a verdict"],
    ["no insights", { insights: [] }, "A coaching session has 1 to 6 insights"],
    [
      "7 insights",
      { insights: Array.from({ length: 7 }, () => insight) },
      "A coaching session has 1 to 6 insights",
    ],
    [
      "an insight with no title",
      { insights: [{ ...insight, title: "" }] },
      "An insight needs a title and a body",
    ],
    [
      "an insight with no body",
      { insights: [{ ...insight, body: undefined }] },
      "An insight needs a title and a body",
    ],
    [
      "an insight at no level",
      { insights: [{ ...insight, level: undefined }] },
      "An insight is at the training or the strategy level",
    ],
    [
      "an insight at another level",
      { insights: [{ ...insight, level: "nutrition" }] },
      "An insight is at the training or the strategy level",
    ],
    [
      "a commitment with no text",
      { commitments: [{ text: " " }] },
      "A commitment needs its text",
    ],
    [
      "a follow-up checked by no one",
      { followUps: [{ ...followUp, checkedBy: undefined }] },
      "A follow-up was checked against data or by you",
    ],
    [
      "a follow-up checked another way",
      { followUps: [{ ...followUp, checkedBy: "coach" }] },
      "A follow-up was checked against data or by you",
    ],
    [
      "a follow-up with no result",
      { followUps: [{ ...followUp, result: "" }] },
      "A follow-up needs its session, commitment and result",
    ],
    [
      "a follow-up with no session",
      { followUps: [{ ...followUp, sessionId: undefined }] },
      "A follow-up needs its session, commitment and result",
    ],
    [
      "a correction with no text",
      { corrections: [{ sessionId: "cs-0", text: "" }] },
      "A correction needs its session and text",
    ],
  ])("refuse %s, storing nothing", async (_, change, message) => {
    const { f } = setup();
    await expect(
      f.saveCoachingSession(/** @type {any} */ ({ ...draft(), ...change })),
    ).rejects.toThrow(message);
    expect(await f.listCoachingSessions()).toEqual([]);
  });
});
