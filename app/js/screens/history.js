// An exercise's history (#13): its records, a small e1RM trend chart and
// every workout's sets, newest first. Opened from the last-workout line.
import { h } from "../dom.js";
import { monthDay, screen } from "./screen.js";
import { setRow } from "./workout.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { Forge } from "../core/forge.js" */
/** @import { ExerciseInWorkout } from "../core/types.js" */

const SVG = "http://www.w3.org/2000/svg";

/**
 * An SVG element; h() makes HTML ones.
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 */
function svg(tag, attrs = {}) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs))
    el.setAttribute(key, String(value));
  return el;
}

/** @param {number} value e.g. 186.67 → "187" */
const whole = (value) => String(Math.round(value));

/**
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function historyView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    if (id === undefined) return;
    const [exercise, history, records] = await Promise.all([
      forge.getExercise(id),
      forge.history(id),
      forge.records(id),
    ]);
    const unit = history[0]?.sets[0]?.unit ?? "lb";
    /** @param {number} value @param {string} label */
    const stat = (value, label) =>
      h(
        "div",
        { class: "stat" },
        h("span", { class: "stat-value" }, whole(value)),
        h("span", { class: "label" }, label),
      );
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
                records.heaviest
                  ? stat(
                      records.heaviest.load,
                      `Heaviest ${records.heaviest.unit}`,
                    )
                  : null,
                records.bestE1rm
                  ? stat(
                      records.bestE1rm.value,
                      `Best e1RM ${records.bestE1rm.set.unit}`,
                    )
                  : null,
              ),
              ...(records.repsAtLoad.length
                ? [
                    h("p", { class: "label" }, "Most reps at a load"),
                    h(
                      "ul",
                      { class: "reps-at-load" },
                      ...records.repsAtLoad.map((r) =>
                        h("li", {}, `${r.load} ${r.unit} × ${r.reps}`),
                      ),
                    ),
                  ]
                : []),
              ...e1rmChart(forge, history, unit),
              h("h2", { class: "label section" }, "Workouts"),
              ...history.map((w) => workoutSets(forge, w)),
            ]),
      ),
    );
  }
}

/**
 * One workout's sets for the exercise, under its date and best e1RM: the
 * chart's numbers, readable without the chart.
 * @param {Forge} forge
 * @param {ExerciseInWorkout} entry
 */
function workoutSets(forge, { workout, sets }) {
  const best = bestE1rm(forge, sets);
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
      best === undefined
        ? null
        : h("span", { class: "label" }, ` · e1RM ${whole(best)}`),
    ),
    h("ol", { class: "sets" }, ...sets.map(setRow)),
  );
}

/**
 * A workout's best e1RM for the exercise, if any set has one.
 * @param {Forge} forge
 * @param {ExerciseInWorkout["sets"]} sets
 */
function bestE1rm(forge, sets) {
  const values = sets.map((s) => forge.e1rm(s)).filter((v) => v !== undefined);
  return values.length ? Math.max(...values) : undefined;
}

/**
 * The e1RM trend (spec #3, story 51): each workout's best e1RM over time,
 * one 2 px line with square markers in the accent, as the Slab prototype's
 * progress board. Tap or hover finds the nearest workout; arrow keys step
 * through them. Nothing for an exercise with no e1RM (timed, or warm-ups
 * only).
 * @param {Forge} forge
 * @param {ExerciseInWorkout[]} history newest first
 * @param {string} unit
 * @returns {Node[]}
 */
function e1rmChart(forge, history, unit) {
  const points = history
    .map(({ workout, sets }) => ({
      date: workout.date,
      time: Date.parse(`${workout.date}T12:00:00`),
      value: bestE1rm(forge, sets),
    }))
    .filter(
      /** @returns {p is { date: string, time: number, value: number }} */
      (p) => p.value !== undefined,
    )
    .reverse();
  if (points.length === 0) return [];

  const width = 358;
  const height = 150;
  const pad = { top: 22, right: 44, bottom: 22, left: 36 };
  const values = points.map((p) => p.value);
  // Clean ticks a little outside the data, so the line isn't pinned to the
  // frame.
  const low = Math.floor((Math.min(...values) * 0.95) / 5) * 5;
  const high = Math.ceil((Math.max(...values) * 1.05) / 5) * 5;
  const first = points[0].time;
  const last = points.at(-1)?.time ?? first;
  const x = (/** @type {number} */ t) =>
    last === first
      ? (pad.left + width - pad.right) / 2
      : pad.left +
        ((t - first) / (last - first)) * (width - pad.left - pad.right);
  const y = (/** @type {number} */ v) =>
    pad.top + (1 - (v - low) / (high - low)) * (height - pad.top - pad.bottom);

  const chart = svg("svg", {
    viewBox: `0 0 ${width} ${height}`,
    class: "chart",
    role: "img",
    tabindex: 0,
    "aria-label": `e1RM by workout, ${points.length} workouts: latest ${whole(values.at(-1) ?? 0)} ${unit}, best ${whole(Math.max(...values))} ${unit}`,
  });
  for (const tick of [low, high]) {
    chart.append(
      svg("line", {
        x1: pad.left,
        x2: width - pad.right,
        y1: y(tick),
        y2: y(tick),
        class: "chart-grid",
      }),
    );
    const label = svg("text", {
      x: pad.left - 6,
      y: y(tick) + 4,
      "text-anchor": "end",
      class: "chart-axis",
    });
    label.textContent = String(tick);
    chart.append(label);
  }
  if (points.length > 1)
    chart.append(
      svg("polyline", {
        points: points.map((p) => `${x(p.time)},${y(p.value)}`).join(" "),
        class: "chart-line",
      }),
    );
  for (const p of points)
    chart.append(
      svg("rect", {
        x: x(p.time) - 5,
        y: y(p.value) - 5,
        width: 10,
        height: 10,
        class: "chart-point",
      }),
    );
  // The latest value, labelled at the line's end.
  const end = points.at(-1) ?? points[0];
  const endLabel = svg("text", {
    x: x(end.time) + 9,
    y: y(end.value) + 4,
    class: "chart-value",
  });
  endLabel.textContent = whole(end.value);
  chart.append(endLabel);
  for (const [t, anchor] of /** @type {const} */ ([
    [first, "start"],
    [last, "end"],
  ])) {
    if (anchor === "end" && last === first) continue;
    const label = svg("text", {
      x: x(t),
      y: height - 4,
      "text-anchor": last === first ? "middle" : anchor,
      class: "chart-axis",
    });
    label.textContent = monthDay((anchor === "start" ? points[0] : end).date);
    chart.append(label);
  }

  const crosshair = svg("line", {
    y1: pad.top - 8,
    y2: height - pad.bottom,
    class: "chart-crosshair",
    visibility: "hidden",
  });
  chart.append(crosshair);
  const tip = h("p", { class: "chart-tip", "aria-live": "polite" });
  let shown = -1;
  /** @param {number} i */
  const showPoint = (i) => {
    shown = Math.max(0, Math.min(points.length - 1, i));
    const p = points[shown];
    crosshair.setAttribute("x1", String(x(p.time)));
    crosshair.setAttribute("x2", String(x(p.time)));
    crosshair.setAttribute("visibility", "visible");
    tip.textContent = `${monthDay(p.date)} · e1RM ${whole(p.value)} ${unit}`;
  };
  /** @param {PointerEvent} e */
  const nearest = (e) => {
    const box = chart.getBoundingClientRect();
    const at = ((e.clientX - box.left) / box.width) * width;
    let best = 0;
    for (let i = 1; i < points.length; i++)
      if (
        Math.abs(x(points[i].time) - at) < Math.abs(x(points[best].time) - at)
      )
        best = i;
    showPoint(best);
  };
  chart.addEventListener("pointermove", (e) =>
    nearest(/** @type {PointerEvent} */ (e)),
  );
  chart.addEventListener("pointerdown", (e) =>
    nearest(/** @type {PointerEvent} */ (e)),
  );
  chart.addEventListener("focus", () =>
    showPoint(shown < 0 ? points.length - 1 : shown),
  );
  chart.addEventListener("keydown", (e) => {
    const key = /** @type {KeyboardEvent} */ (e).key;
    if (key === "ArrowLeft") showPoint(shown - 1);
    else if (key === "ArrowRight") showPoint(shown + 1);
  });

  return [h("h2", { class: "label section" }, `e1RM · ${unit}`), chart, tip];
}
