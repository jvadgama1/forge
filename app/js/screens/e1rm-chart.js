// The history's e1RM trend (#13; spec #3, story 51): each workout's best
// e1RM over time, one 2 px accent line with square markers as the Slab
// prototype's progress board. A single series in the accent, so no legend
// and no new palette. Tap or hover finds the nearest workout; arrow keys step
// through them.
import { h } from "../dom.js";
import { monthDay } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @typedef {Awaited<ReturnType<Forge["e1rmTrend"]>>} Trend */

const SVG = "http://www.w3.org/2000/svg";

/**
 * An SVG element; h() makes HTML ones.
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {string} [text]
 */
function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs))
    el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
}

/** @param {number} value e.g. 186.67 → "187" */
export const whole = (value) => String(Math.round(value));

const WIDTH = 358;
const HEIGHT = 150;
const PAD = { top: 22, right: 44, bottom: 22, left: 36 };

/**
 * The chart, its heading and the line that reads out the chosen workout;
 * nothing when no workout has an e1RM.
 * @param {Trend} trend
 * @returns {Node[]}
 */
export function e1rmChart({ unit, points }) {
  if (points.length === 0) return [];
  const values = points.map((p) => p.value);
  // Clean ticks a little outside the data, so the line isn't pinned to the
  // frame.
  const low = Math.floor((Math.min(...values) * 0.95) / 5) * 5;
  const high = Math.ceil((Math.max(...values) * 1.05) / 5) * 5;
  const times = points.map((p) => Date.parse(`${p.date}T12:00:00`));
  const first = times[0];
  const last = times[times.length - 1];
  /** @param {number} i */
  const x = (i) =>
    last === first
      ? (PAD.left + WIDTH - PAD.right) / 2
      : PAD.left +
        ((times[i] - first) / (last - first)) * (WIDTH - PAD.left - PAD.right);
  /** @param {number} v */
  const y = (v) =>
    PAD.top + (1 - (v - low) / (high - low)) * (HEIGHT - PAD.top - PAD.bottom);
  const end = points.length - 1;

  const chart = svg("svg", {
    viewBox: `0 0 ${WIDTH} ${HEIGHT}`,
    class: "chart",
    role: "img",
    tabindex: 0,
    "aria-label": `e1RM by workout, ${points.length} workouts: latest ${whole(values[end])} ${unit}, best ${whole(Math.max(...values))} ${unit}`,
  });
  for (const tick of [low, high])
    chart.append(
      svg("line", {
        x1: PAD.left,
        x2: WIDTH - PAD.right,
        y1: y(tick),
        y2: y(tick),
        class: "chart-grid",
      }),
      svg(
        "text",
        {
          x: PAD.left - 6,
          y: y(tick) + 4,
          "text-anchor": "end",
          class: "chart-axis",
        },
        String(tick),
      ),
    );
  if (points.length > 1)
    chart.append(
      svg("polyline", {
        points: points.map((p, i) => `${x(i)},${y(p.value)}`).join(" "),
        class: "chart-line",
      }),
    );
  points.forEach((p, i) =>
    chart.append(
      svg("rect", {
        x: x(i) - 5,
        y: y(p.value) - 5,
        width: 10,
        height: 10,
        class: "chart-point",
      }),
    ),
  );
  // The latest value, labelled at the line's end; the dates of both ends.
  chart.append(
    svg(
      "text",
      { x: x(end) + 9, y: y(values[end]) + 4, class: "chart-value" },
      whole(values[end]),
    ),
    svg(
      "text",
      {
        x: x(0),
        y: HEIGHT - 4,
        "text-anchor": end === 0 ? "middle" : "start",
        class: "chart-axis",
      },
      monthDay(points[0].date),
    ),
  );
  if (end > 0)
    chart.append(
      svg(
        "text",
        { x: x(end), y: HEIGHT - 4, "text-anchor": "end", class: "chart-axis" },
        monthDay(points[end].date),
      ),
    );

  const crosshair = svg("line", {
    y1: PAD.top - 8,
    y2: HEIGHT - PAD.bottom,
    class: "chart-crosshair",
    visibility: "hidden",
  });
  chart.append(crosshair);
  // Value first, then what it is (dataviz: values lead, labels follow).
  const value = h("strong", {});
  const what = h("span", { class: "label" });
  const tip = h(
    "p",
    { class: "chart-tip", "aria-live": "polite" },
    value,
    what,
  );
  let shown = -1;
  /** @param {number} i */
  const show = (i) => {
    shown = Math.max(0, Math.min(end, i));
    crosshair.setAttribute("x1", String(x(shown)));
    crosshair.setAttribute("x2", String(x(shown)));
    crosshair.setAttribute("visibility", "visible");
    value.textContent = `${whole(values[shown])} ${unit}`;
    what.textContent = ` e1RM · ${monthDay(points[shown].date)}`;
  };
  /** @param {Event} e */
  const nearest = (e) => {
    const { clientX } = /** @type {PointerEvent} */ (e);
    const box = chart.getBoundingClientRect();
    const at = ((clientX - box.left) / box.width) * WIDTH;
    let best = 0;
    for (let i = 1; i <= end; i++)
      if (Math.abs(x(i) - at) < Math.abs(x(best) - at)) best = i;
    show(best);
  };
  chart.addEventListener("pointermove", nearest);
  chart.addEventListener("pointerdown", nearest);
  chart.addEventListener("focus", () => show(shown < 0 ? end : shown));
  chart.addEventListener("keydown", (e) => {
    const key = /** @type {KeyboardEvent} */ (e).key;
    if (key === "ArrowLeft") show(shown - 1);
    else if (key === "ArrowRight") show(shown + 1);
  });

  return [h("h2", { class: "label section" }, `e1RM · ${unit}`), chart, tip];
}
