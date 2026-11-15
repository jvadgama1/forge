// A saved coaching session as a Markdown file in the private folder's
// insights/ (#174; spec #170, stories 62-63): what the Coach page shows, in
// the page's order and words, for reading in a text editor.

/** @import { CoachingSession } from "../../app/js/core/types.js" */

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** Each level's heading, in the order the Coach page shows them. */
const LEVELS = /** @type {const} */ ([
  ["training", "Training"],
  ["strategy", "Strategy"],
]);

/**
 * How a follow-up's result was found, as the Coach page says it, so the
 * user's own account never reads as a measured one (spec #170, story 52).
 */
const CHECKED_BY = {
  data: "Checked against logged data",
  you: "From your own account",
};

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, "0");

/**
 * The day a coaching session was saved, in local time: "Nov 14, 2026".
 * @param {string} savedAt ISO 8601
 */
export function savedDay(savedAt) {
  const time = new Date(savedAt);
  return `${MONTHS[time.getMonth()]} ${time.getDate()}, ${time.getFullYear()}`;
}

/**
 * When a coaching session was saved, in local time: "Nov 14, 2026 · 3:00 pm".
 * @param {string} savedAt ISO 8601
 */
export function savedWhen(savedAt) {
  const time = new Date(savedAt);
  const hour = time.getHours() % 12 || 12;
  const half = time.getHours() < 12 ? "am" : "pm";
  return `${savedDay(savedAt)} · ${hour}:${pad2(time.getMinutes())} ${half}`;
}

/**
 * Each coaching session's file name, by its local date and time
 * ("2026-11-14-1500.md"). Two saved in the same minute are told apart by
 * a number, the later one "-2", so every coaching session keeps its own
 * file and the names don't change as more are saved.
 * @param {CoachingSession[]} sessions
 * @returns {Map<string, string>} file name by coaching session id
 */
export function fileNames(sessions) {
  /** @type {Map<string, string>} */
  const names = new Map();
  /** @type {Map<string, number>} */
  const taken = new Map();
  const oldestFirst = [...sessions].sort((a, b) =>
    a.savedAt < b.savedAt ? -1 : a.savedAt > b.savedAt ? 1 : 0,
  );
  for (const { id, savedAt } of oldestFirst) {
    const time = new Date(savedAt);
    const stem = `${time.getFullYear()}-${pad2(time.getMonth() + 1)}-${pad2(time.getDate())}-${pad2(time.getHours())}${pad2(time.getMinutes())}`;
    const count = (taken.get(stem) ?? 0) + 1;
    taken.set(stem, count);
    names.set(id, count === 1 ? `${stem}.md` : `${stem}-${count}.md`);
  }
  return names;
}

/**
 * One coaching session as Markdown: its date and verdict, the follow-ups
 * of earlier commitments with how each was checked, any corrections, its
 * commitments, then its insights under Training and Strategy.
 * @param {CoachingSession} session
 * @param {CoachingSession[]} sessions every coaching session, to date what
 *   a correction corrects
 */
export function insightMarkdown(session, sessions) {
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
    return earlier && savedDay(earlier.savedAt);
  };
  /** @type {string[][]} */
  const blocks = [[`# Coaching session · ${savedWhen(savedAt)}`], [verdict]];
  if (followUps.length)
    blocks.push(
      ["## Follow-ups"],
      ...followUps.flatMap(({ commitment, result, checkedBy }) => [
        [`### ${commitment}`],
        [result],
        [`_${CHECKED_BY[checkedBy]}_`],
      ]),
    );
  if (corrections.length)
    blocks.push(
      ["## Corrections"],
      ...corrections.map(({ sessionId, text }) => {
        const day = dayOf(sessionId);
        return [day ? `Corrects ${day}: ${text}` : text];
      }),
    );
  blocks.push(
    ["## Commitments"],
    commitments.length
      ? commitments.map(({ text }) => `- ${text}`)
      : ["None agreed this time."],
  );
  for (const [level, name] of LEVELS) {
    const insights = session.insights.filter((i) => i.level === level);
    if (insights.length)
      blocks.push(
        [`## ${name}`],
        ...insights.flatMap(({ title, body }) => [[`### ${title}`], [body]]),
      );
  }
  return blocks.map((lines) => lines.join("\n")).join("\n\n") + "\n";
}
