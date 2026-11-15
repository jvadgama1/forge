import { h } from "../dom.js";
import { listDate, localDay, screen } from "./screen.js";

/** @import { CoachingSession, Insight } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * Each level's heading, in the order the page shows them (spec #170, story
 * 66). The insight files in the coach notes use them too (#174).
 */
export const LEVELS = /** @type {const} */ ([
  ["training", "Training"],
  ["strategy", "Strategy"],
]);

/**
 * How a follow-up's result was found, in words, so the user's own account
 * never reads as a measured one (spec #170, story 52).
 */
export const CHECKED_BY = {
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
 * The line under the Coach heading (#176; spec #170, story 67): how long
 * since the latest coaching session, in calendar days where the user is,
 * so they can tell when it's time for another. One dated after today, as
 * a clock set behind may give, reads as today.
 * @param {string} savedAt the latest coaching session's, ISO 8601
 * @param {string} today YYYY-MM-DD
 */
export function lastCoached(savedAt, today) {
  const days = daysBetween(localDay(savedAt), today);
  if (days <= 0) return "Last coached today";
  if (days === 1) return "Last coached yesterday";
  return `Last coached ${days} days ago`;
}

/**
 * Calendar days from one date to another, both YYYY-MM-DD.
 * @param {string} from
 * @param {string} to
 */
function daysBetween(from, to) {
  const utc = (/** @type {string} */ date) => {
    const [year, month, day] = date.split("-").map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

/**
 * The Coach page (#172, #176): the latest coaching session in full, or one
 * opened from the list of earlier ones below it (beside it on a wide
 * screen), under how long since the latest; before the first, how to
 * start one. Read-only: only the coach adds coaching sessions (spec #170,
 * story 71).
 * @param {Pick<ScreenContext, "forge" | "id">} context `id` is the earlier
 *   coaching session opened, if any
 */
export function coachView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const sessions = await forge.listCoachingSessions();
    const [latest, ...earlier] = sessions;
    if (!latest) {
      root.replaceChildren(
        screen(
          "Coach",
          h(
            "p",
            { class: "lede" },
            "No coaching sessions yet. Run ",
            h("code", {}, "/coach"),
            " in Claude Code on the laptop: once you save your first coaching session, it shows here.",
          ),
        ),
      );
      return;
    }
    const today = forge.today();
    const openId = id === latest.id ? undefined : id;
    const open =
      openId === undefined ? latest : sessions.find((s) => s.id === openId);
    root.replaceChildren(
      screen(
        "Coach",
        h("p", { class: "last-coached" }, lastCoached(latest.savedAt, today)),
        h(
          "div",
          { class: "coach-page" },
          h(
            "div",
            { class: "coach-open" },
            openId !== undefined &&
              h("a", { class: "chip back", href: "#/coach" }, "← Latest"),
            open
              ? coachingSessionView(open, sessions, today)
              : h(
                  "p",
                  { class: "lede" },
                  "That coaching session isn't here. Pick one from the list.",
                ),
          ),
          earlierView(earlier, openId, today),
        ),
      ),
    );
  }
}

/**
 * The earlier coaching sessions, newest first, by date and verdict, each
 * opening in full (#176; spec #170, stories 68–69). The one open is marked
 * by more than colour, as a list beside its item is (#23).
 * @param {CoachingSession[]} earlier
 * @param {string | undefined} openId
 * @param {string} today YYYY-MM-DD
 */
function earlierView(earlier, openId, today) {
  const name = "Earlier coaching sessions";
  return h(
    "section",
    { class: "coach-earlier" },
    h("h2", { class: "label section" }, name),
    earlier.length
      ? h(
          "nav",
          { class: "menu", "aria-label": name },
          ...earlier.map(({ id, savedAt, verdict }) =>
            h(
              "a",
              {
                class: "workout-link coaching-link",
                href: `#/coach/${encodeURIComponent(id)}`,
                "aria-current": id === openId && "page",
              },
              h(
                "span",
                { class: "workout-link-main" },
                h("span", { class: "label" }, savedDay(savedAt, today)),
                h("span", { class: "name" }, verdict),
              ),
              h("span", { "aria-hidden": "true" }, "→"),
            ),
          ),
        )
      : h("p", { class: "lede" }, "None yet."),
  );
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
