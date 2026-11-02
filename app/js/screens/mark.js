// The workouts behind a mark on the Stats board (#84; spec #80, stories
// 51–54): a muscle group's hard-sets bar or a calendar day (#86) opens the
// workouts behind it, each with its share, and each opens the workout. The
// route names the mark (and a bar's range), so a reload shows the same
// list. Each kind of mark is described once, in KINDS.
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
  tonnageText,
} from "./screen.js";
import { pastWorkoutView } from "./past-workout.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { Forge } from "../core/forge.js" */
/** @import { Mark } from "../core/dashboard.js" */
/** @typedef {Awaited<ReturnType<Forge["workoutsBehind"]>>} Behind */

/**
 * Hard sets with their noun: "1 hard set", "4.5 hard sets".
 * @param {number} n
 */
const hardSets = (n) => `${setCount(n)} ${n === 1 ? "hard set" : "hard sets"}`;

/**
 * How one kind of mark is written in a route, named, and introduced.
 * @template {Mark} M
 * @typedef {object} Kind
 * @property {(mark: M) => string} id the route segment after "kind:"
 * @property {(parts: string[]) => M | undefined} parse
 * @property {(mark: M) => string} name the list's title
 * @property {(behind: Behind, name: string, rows: number) => [string, string]} intro
 *   the label and summary above the rows
 * @property {(value: number, name: string, behind: Behind) => string} share
 *   a row's number
 */

/** @type {{ "hard-sets": Kind<Extract<Mark, { kind: "hard-sets" }>>, day: Kind<Extract<Mark, { kind: "day" }>>, tonnage: Kind<Extract<Mark, { kind: "tonnage" }>> }} */
const KINDS = {
  "hard-sets": {
    id: (mark) => `${mark.muscleGroup}:${mark.range}`,
    parse: ([group, range]) => {
      const known = MUSCLE_GROUPS.find((m) => m.id === group);
      return known && isRangeId(range)
        ? { kind: "hard-sets", muscleGroup: known.id, range }
        : undefined;
    },
    name: (mark) => muscleGroup(mark.muscleGroup).label,
    intro: (behind, name, rows) => {
      if (behind.kind !== "hard-sets") return ["", ""];
      const weeks = rangeWords(behind.range.weeks);
      return [
        `Hard sets · last ${weeks}`,
        rows
          ? `${hardSets(behind.total)} over ${countOf(behind.trainingWeeks, "training week")}: ${setCount(behind.perWeek)} a week.`
          : `No ${name} hard sets in the last ${weeks}.`,
      ];
    },
    share: (value, name) => `${name} · ${hardSets(value)}`,
  },
  day: {
    id: (mark) => mark.date,
    parse: ([date]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(date ?? "")
        ? { kind: "day", date }
        : undefined,
    name: (mark) => monthDay(mark.date),
    intro: (behind, _name, rows) => [
      "Workouts that day",
      rows
        ? `${countOf(rows, "workout")}, ${hardSets(behind.total)}.`
        : "No finished workouts that day.",
    ],
    share: (value) => hardSets(value),
  },
  tonnage: {
    id: (mark) => mark.week,
    parse: ([week]) =>
      /^\d{4}-\d{2}-\d{2}$/.test(week ?? "")
        ? { kind: "tonnage", week }
        : undefined,
    name: (mark) => `Week of ${monthDay(mark.week)}`,
    intro: (behind, _name, rows) => [
      "Tonnage",
      behind.kind === "tonnage" && rows
        ? `${countOf(rows, "workout")}, ${tonnageText(behind.total, behind.unit)}.`
        : "No finished workouts that week.",
    ],
    share: (value, _name, behind) =>
      behind.kind === "tonnage" ? tonnageText(value, behind.unit) : "",
  },
};

/**
 * The description of a mark's kind.
 * @param {Mark} mark
 * @returns {Kind<Mark>}
 */
const kindOf = (mark) => /** @type {Kind<Mark>} */ (KINDS[mark.kind]);

/**
 * A mark as a route segment: "hard-sets:chest:12w", "day:2026-10-20". ":"
 * and "~" are safe in a hash, so links match the routes as typed and the
 * open one is marked beside the list.
 * @param {Mark} mark
 */
export const markId = (mark) => `${mark.kind}:${kindOf(mark).id(mark)}`;

/**
 * The mark a route segment names, if it names one.
 * @param {string | undefined} id
 * @returns {Mark | undefined}
 */
export function parseMark(id) {
  const [kind, ...parts] = (id ?? "").split(":");
  return Object.hasOwn(KINDS, kind)
    ? KINDS[/** @type {keyof typeof KINDS} */ (kind)].parse(parts)
    : undefined;
}

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
      ? {
          href: `#/stats/${markId(parsed)}`,
          label: kindOf(parsed).name(parsed),
        }
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
  const kind = kindOf(mark);
  const name = kind.name(mark);
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
            [gymNames.get(w.gymId), kind.share(w.value, name, behind)]
              .filter(Boolean)
              .join(" · "),
          ),
        ),
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    );
    const [label, summary] = kind.intro(behind, name, rows.length);
    root.replaceChildren(
      h("p", { class: "label" }, label),
      h("p", { class: "lede" }, summary),
      h("nav", { class: "menu", "aria-label": `${name} workouts` }, ...rows),
    );
  }
}
