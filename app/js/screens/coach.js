import { h } from "../dom.js";
import { listDate, localDay, screen } from "./screen.js";

/** @import { CoachingSession, Insight } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/** Each level's heading, in the order the page shows them (spec #170, story 66). */
const LEVELS = /** @type {const} */ ([
  ["training", "Training"],
  ["strategy", "Strategy"],
]);

/**
 * How a follow-up's result was found, in words, so the user's own account
 * never reads as a measured one (spec #170, story 52).
 */
const CHECKED_BY = {
  data: "Checked against logged data",
  you: "From your own account",
};

/**
 * The day a coaching session was saved, as a list shows it: "Nov 14", with
 * the year when it isn't this year's.
 * @param {string} savedAt ISO 8601
 * @param {string} today YYYY-MM-DD
 */
const savedDay = (savedAt, today) => listDate(localDay(savedAt), today);

/**
 * The Coach page (#172): the latest coaching session in full, or, before
 * the first, how to start one. Read-only: only the coach adds coaching
 * sessions (spec #170, story 71).
 * @param {Pick<ScreenContext, "forge">} context
 */
export function coachView({ forge }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const sessions = await forge.listCoachingSessions();
    const [latest] = sessions;
    root.replaceChildren(
      screen(
        "Coach",
        latest
          ? coachingSessionView(latest, sessions, forge.today())
          : h(
              "p",
              { class: "lede" },
              "No coaching sessions yet. Run ",
              h("code", {}, "/coach"),
              " in Claude Code on the laptop: once you save your first coaching session, it shows here.",
            ),
      ),
    );
  }
}

/**
 * One coaching session in full: its date and verdict, the follow-ups of
 * earlier commitments, any corrections, its commitments, then its insights
 * under Training and Strategy (#172).
 * @param {CoachingSession} session
 * @param {CoachingSession[]} sessions every coaching session, to date what
 *   a correction corrects
 * @param {string} today YYYY-MM-DD
 */
function coachingSessionView(session, sessions, today) {
  const {
    savedAt,
    verdict,
    followUps,
    corrections = [],
    commitments,
  } = session;
  /** @param {string} id */
  const dayOf = (id) => {
    const earlier = sessions.find((s) => s.id === id);
    return earlier && savedDay(earlier.savedAt, today);
  };
  return h(
    "article",
    { class: "coaching-session" },
    h(
      "p",
      { class: "label" },
      `Coaching session · ${savedDay(savedAt, today)}`,
    ),
    h("p", { class: "verdict" }, verdict),
    followUps.length > 0 &&
      section(
        "Follow-ups",
        h(
          "ul",
          { class: "list" },
          ...followUps.map(({ commitment, result, checkedBy }) =>
            h(
              "li",
              {},
              h("p", { class: "follow-up-commitment" }, commitment),
              h("p", { class: "coach-text" }, result),
              h("p", { class: "label checked-by" }, CHECKED_BY[checkedBy]),
            ),
          ),
        ),
      ),
    corrections.length > 0 &&
      section(
        "Corrections",
        h(
          "ul",
          { class: "list" },
          ...corrections.map(({ sessionId, text }) => {
            const day = dayOf(sessionId);
            return h(
              "li",
              {},
              day ? h("p", { class: "label" }, `Corrects ${day}`) : false,
              h("p", { class: "coach-text" }, text),
            );
          }),
        ),
      ),
    section(
      "Commitments",
      commitments.length
        ? h(
            "ul",
            { class: "commitments" },
            ...commitments.map(({ text }) => h("li", {}, text)),
          )
        : h("p", { class: "lede" }, "None agreed this time."),
    ),
    ...LEVELS.map(([level, name]) => {
      const insights = session.insights.filter((i) => i.level === level);
      return (
        insights.length > 0 &&
        h(
          "section",
          { "data-level": level },
          h("h2", { class: "label section level" }, name),
          ...insights.map(insightView),
        )
      );
    }),
  );
}

/**
 * A part of a coaching session under its heading.
 * @param {string} name
 * @param {Node} content
 */
function section(name, content) {
  return h("section", {}, h("h2", { class: "label section" }, name), content);
}

/** @param {Insight} insight */
function insightView({ title, body }) {
  return h(
    "div",
    { class: "insight" },
    h("h3", { class: "insight-title" }, title),
    h("p", { class: "coach-text" }, body),
  );
}
