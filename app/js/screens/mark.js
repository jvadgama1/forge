// The workouts behind a mark on the Stats board (#84; spec #80, stories
// 51–54): a muscle group's hard-sets bar opens the workouts that gave it,
// each with its share, and each opens the workout. The route names the
// mark and its range, so a reload shows the same list.
import { h } from "../dom.js";
import { isRangeId } from "../core/dashboard.js";
import { MUSCLE_GROUPS } from "../core/muscle-groups.js";
import { listDate, screen, setCount } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { Mark } from "../core/dashboard.js" */

/**
 * A mark as a route segment: "hard-sets:chest:12w". Its parts are slugs,
 * and ":" and "~" are safe in a hash, so links match the routes as typed
 * and the open one is marked beside the list.
 * @param {Mark} mark
 */
export const markId = ({ kind, muscleGroup, range }) =>
  `${kind}:${muscleGroup}:${range}`;

/**
 * The mark a route segment names, if it names one.
 * @param {string | undefined} id
 * @returns {Mark | undefined}
 */
export function parseMark(id) {
  const [kind, muscleGroup, range] = (id ?? "").split(":");
  const group = MUSCLE_GROUPS.find((m) => m.id === muscleGroup);
  if (kind !== "hard-sets" || !group || !isRangeId(range)) return undefined;
  return { kind, muscleGroup: group.id, range };
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
      h("p", { class: "lede" }, "This link doesn't name a mark on the board."),
    );
  const group = MUSCLE_GROUPS.find((m) => m.id === mark.muscleGroup);
  const name = group?.label ?? mark.muscleGroup;
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
    const weeks =
      behind.range.weeks === 52 ? "year" : `${behind.range.weeks} weeks`;
    const rows = await Promise.all(
      behind.workouts.map(async (w) => {
        const workout = await forge.getWorkout(w.workoutId);
        const title = workout ? await forge.workoutTitle(workout) : "";
        return h(
          "a",
          { class: "workout-link", href: workoutHref(mark, w.workoutId) },
          h(
            "span",
            { class: "workout-link-main" },
            h(
              "span",
              { class: "name" },
              [listDate(w.date, today), title].filter(Boolean).join(" · "),
            ),
            h(
              "span",
              { class: "label" },
              [
                gymNames.get(w.gymId),
                `${name} · ${setCount(w.value)} hard set${w.value === 1 ? "" : "s"}`,
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
          h("span", { "aria-hidden": "true" }, "→"),
        );
      }),
    );
    root.replaceChildren(
      h("p", { class: "label" }, `Hard sets · last ${weeks}`),
      rows.length
        ? h(
            "p",
            { class: "lede" },
            `${setCount(behind.total)} hard sets over ${behind.trainingWeeks} training week${behind.trainingWeeks === 1 ? "" : "s"}: ${setCount(behind.perWeek)} a week.`,
          )
        : h(
            "p",
            { class: "lede" },
            `No ${name} hard sets in the last ${weeks}.`,
          ),
      h("nav", { class: "menu", "aria-label": `${name} workouts` }, ...rows),
    );
  }
}
