// An exercise's history (#13): its records, a small e1RM trend chart and
// every workout's sets, newest first. Opened from the last-workout line.
import { h } from "../dom.js";
import { e1rmChart, whole } from "./e1rm-chart.js";
import { monthDay, screen } from "./screen.js";
import { loadText, setRow } from "./workout.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { ExerciseInWorkout } from "../core/types.js" */

/**
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function historyView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    if (id === undefined) return;
    const [exercise, history, records, trend] = await Promise.all([
      forge.getExercise(id),
      forge.history(id),
      forge.records(id),
      forge.e1rmTrend(id),
    ]);
    /** @type {Map<string, number>} */
    const e1rmByWorkout = new Map(
      trend.points.map((p) => [p.workoutId, p.value]),
    );
    /** @param {number} value @param {string} label */
    const stat = (value, label) =>
      h(
        "div",
        { class: "stat" },
        h("span", { class: "stat-value" }, whole(value)),
        h("span", { class: "label" }, label),
      );
    const { heaviest, bestE1rm, repsAtLoad } = records;
    root.replaceChildren(
      screen(
        exercise?.name ?? id,
        h(
          "a",
          { class: "chip back", href: `#/log/ex/${encodeURIComponent(id)}` },
          "← Log",
        ),
        ...(history.length === 0
          ? [h("p", { class: "lede" }, "No sets logged yet.")]
          : [
              h("h2", { class: "label section" }, "Records"),
              h(
                "div",
                { class: "stats" },
                heaviest
                  ? stat(heaviest.load, `Heaviest ${heaviest.unit}`)
                  : null,
                bestE1rm
                  ? stat(bestE1rm.value, `Best e1RM ${bestE1rm.set.unit}`)
                  : null,
              ),
              ...(repsAtLoad.length
                ? [
                    h("p", { class: "label" }, "Most reps at a load"),
                    h(
                      "ul",
                      { class: "reps-at-load" },
                      ...repsAtLoad.map((r) =>
                        h("li", {}, `${loadText(r)} × ${r.reps}`),
                      ),
                    ),
                  ]
                : []),
              ...e1rmChart(trend),
              h("h2", { class: "label section" }, "Workouts"),
              ...history.map((w) =>
                workoutSets(w, e1rmByWorkout.get(w.workout.id), trend.unit),
              ),
            ]),
      ),
    );
  }
}

/**
 * One workout's sets for the exercise, under its date and best e1RM: the
 * chart's numbers, readable without the chart.
 * @param {ExerciseInWorkout} entry
 * @param {number | undefined} e1rm
 * @param {string} unit
 */
function workoutSets({ workout, sets }, e1rm, unit) {
  return h(
    "section",
    { class: "history-workout" },
    h(
      "h3",
      { class: "history-date" },
      monthDay(workout.date),
      workout.finishedAt
        ? null
        : h("span", { class: "label" }, " · In progress"),
      e1rm === undefined
        ? null
        : h("span", { class: "label" }, ` · e1RM ${whole(e1rm)} ${unit}`),
    ),
    h("ol", { class: "sets" }, ...sets.map(setRow)),
  );
}
