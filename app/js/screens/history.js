// An exercise's history (#13): its records, a small e1RM trend chart and
// every workout's sets, newest first. Opened from the last-workout line.
import { h } from "../dom.js";
import { e1rmChart, whole } from "./e1rm-chart.js";
import { setText } from "./measure.js";
import { monthDay, screen } from "./screen.js";
import { setRow } from "./workout.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { ExerciseInWorkout, ExerciseType } from "../core/types.js" */

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
    const type = exercise?.type ?? "weight-reps";
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
    const { heaviest, leastAssist, bestE1rm, repsAtLoad } = records;
    // A bodyweight load counts the body weight (#19).
    const withBody = type === "bodyweight-reps" ? " with BW" : "";
    const stats = [
      heaviest && stat(heaviest.load, `Heaviest ${heaviest.unit}${withBody}`),
      leastAssist && stat(leastAssist.load, `Least assist ${leastAssist.unit}`),
      bestE1rm && stat(bestE1rm.value, `Best e1RM ${bestE1rm.set.unit}`),
    ].filter((s) => s !== undefined);
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
              // Timed holds and cardio have no records (#19).
              ...(stats.length || repsAtLoad.length
                ? [h("h2", { class: "label section" }, "Records")]
                : []),
              ...(stats.length ? [h("div", { class: "stats" }, ...stats)] : []),
              ...(repsAtLoad.length
                ? [
                    h("p", { class: "label" }, "Most reps at a load"),
                    h(
                      "ul",
                      { class: "reps-at-load" },
                      ...repsAtLoad.map((r) => h("li", {}, setText(r, type))),
                    ),
                  ]
                : []),
              ...e1rmChart(trend),
              h("h2", { class: "label section" }, "Workouts"),
              ...history.map((w) =>
                workoutSets(
                  w,
                  e1rmByWorkout.get(w.workout.id),
                  trend.unit,
                  type,
                ),
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
 * @param {ExerciseType} type
 */
function workoutSets({ workout, sets }, e1rm, unit, type) {
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
    h("ol", { class: "sets" }, ...sets.map((set, i) => setRow(set, i, type))),
  );
}
