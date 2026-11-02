// The workouts behind a mark on the Stats board (#84; spec #80, stories
// 51–54): a muscle group's hard-sets bar or a calendar day (#86) opens the
// workouts behind it, each with its share, and each opens the workout. The
// route names the mark (and a bar's range), so a reload shows the same
// list.
import { h } from "../dom.js";
import { isRangeId } from "../core/dashboard.js";
import { MUSCLE_GROUPS, muscleGroup } from "../core/muscle-groups.js";
import {
  countOf,
  listDate,
  monthDay,
  rangeWords,
  screen,
  setCount,
} from "./screen.js";
import { pastWorkoutView } from "./past-workout.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { Mark } from "../core/dashboard.js" */

/**
 * A mark as a route segment: "hard-sets:chest:12w", "day:2026-10-20". Its
 * parts are slugs, and ":" and "~" are safe in a hash, so links match the
 * routes as typed and the open one is marked beside the list.
 * @param {Mark} mark
 */
export const markId = (mark) =>
  mark.kind === "day"
    ? `day:${mark.date}`
    : `hard-sets:${mark.muscleGroup}:${mark.range}`;

/**
 * The mark a route segment names, if it names one.
 * @param {string | undefined} id
 * @returns {Mark | undefined}
 */
export function parseMark(id) {
  const [kind, a, b] = (id ?? "").split(":");
  if (kind === "day" && /^\d{4}-\d{2}-\d{2}$/.test(a ?? ""))
    return { kind, date: a };
  const known = MUSCLE_GROUPS.find((m) => m.id === a);
  if (kind === "hard-sets" && known && isRangeId(b))
    return { kind, muscleGroup: known.id, range: b };
  return undefined;
}

/**
 * What a mark is called: its muscle group, or its day ("Oct 20").
 * @param {Mark} mark
 */
const markName = (mark) =>
  mark.kind === "day"
    ? monthDay(mark.date)
    : muscleGroup(mark.muscleGroup).label;

// A workout opened from the list keeps the mark in its route, so on a wide
// screen the list stays beside it: "/stats/workout/<mark>~<workout id>".
const JOIN = "~";

/**
 * @param {Mark} mark
 * @param {string} workoutId
 */
const workoutHref = (mark, workoutId) =>
  `#/stats/workout/${markId(mark)}${JOIN}${encodeURIComponent(workoutId)}`;

/**
 * A workout-from-a-mark route id split into its two parts.
 * @param {string | undefined} id
 */
export function splitMarkWorkout(id) {
  const at = (id ?? "").indexOf(JOIN);
  return at < 0
    ? { mark: undefined, workoutId: undefined }
    : { mark: id?.slice(0, at), workoutId: id?.slice(at + 1) };
}

/**
 * A workout opened from the list (#84): its back link and a delete return
 * to the list, not to Workouts (story 54).
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function markWorkoutView(context) {
  const { mark, workoutId } = splitMarkWorkout(context.id);
  const parsed = parseMark(mark);
  return pastWorkoutView(
    { ...context, id: workoutId },
    parsed
      ? { href: `#/stats/${markId(parsed)}`, label: markName(parsed) }
      : { href: "#/stats", label: "Stats" },
  );
}

/**
 * The list beside a workout opened from it, on a wide screen.
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export const markBesideView = (context) =>
  markView({ ...context, id: splitMarkWorkout(context.id).mark });

/**
 * A workout opened from a mark that is one workout (#84; stories 51, 60):
 * an e1RM point or a day with one workout. Back to the board.
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export const pointWorkoutView = (context) =>
  pastWorkoutView(context, { href: "#/stats", label: "Stats" });

/**
 * Hard sets with their noun: "1 hard set", "4.5 hard sets".
 * @param {number} n
 */
const hardSets = (n) => `${setCount(n)} ${n === 1 ? "hard set" : "hard sets"}`;

/**
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function markView({ forge, id }) {
  const mark = parseMark(id);
  const root = h("div");
  const back = h("a", { class: "chip back", href: "#/stats" }, "← Stats");
  if (!mark)
    return screen(
      "Nothing here",
      back,
      h(
        "p",
        { class: "lede" },
        "This link doesn't match anything on the Stats board.",
      ),
    );
  const name = markName(mark);
  show(mark);
  return screen(name, back, root);

  /** @param {Mark} mark */
  async function show(mark) {
    const [behind, gyms] = await Promise.all([
      forge.workoutsBehind(mark),
      forge.listGyms(),
    ]);
    const today = forge.today();
    const gymNames = new Map(gyms.map((g) => [g.id, g.name]));
    const rows = behind.workouts.map((w) =>
      h(
        "a",
        { class: "workout-link", href: workoutHref(mark, w.workoutId) },
        h(
          "span",
          { class: "workout-link-main" },
          h(
            "span",
            { class: "name" },
            `${listDate(w.date, today)} · ${w.title}`,
          ),
          h(
            "span",
            { class: "label" },
            [
              gymNames.get(w.gymId),
              behind.kind === "day"
                ? hardSets(w.value)
                : `${name} · ${hardSets(w.value)}`,
            ]
              .filter(Boolean)
              .join(" · "),
          ),
        ),
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    );
    root.replaceChildren(
      ...intro(),
      h("nav", { class: "menu", "aria-label": `${name} workouts` }, ...rows),
    );

    /** The label and summary above the rows. */
    function intro() {
      if (behind.kind === "day")
        return [
          h("p", { class: "label" }, "Workouts that day"),
          h(
            "p",
            { class: "lede" },
            rows.length
              ? `${countOf(rows.length, "workout")}, ${hardSets(behind.total)}.`
              : "No finished workouts that day.",
          ),
        ];
      const weeks = rangeWords(behind.range.weeks);
      return [
        h("p", { class: "label" }, `Hard sets · last ${weeks}`),
        h(
          "p",
          { class: "lede" },
          rows.length
            ? `${hardSets(behind.total)} over ${countOf(behind.trainingWeeks, "training week")}: ${setCount(behind.perWeek)} a week.`
            : `No ${name} hard sets in the last ${weeks}.`,
        ),
      ];
    }
  }
}
