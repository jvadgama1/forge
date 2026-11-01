// The history's e1RM trend (#13; spec #3, story 51): each workout's best
// e1RM over time, one 2 px accent line with square markers as the Slab
// prototype's progress board. A single series in the accent, so no legend
// and no new palette. Drawn with the shared chart pieces (#81).
import { h } from "../dom.js";
import { chartRoot, explore, grid, linear, niceRange, svg } from "./chart.js";
import { monthDay, whole } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { Frame } from "./chart.js" */
/** @typedef {Awaited<ReturnType<Forge["e1rmTrend"]>>} Trend */

// 358 wide fills a 390 px phone screen inside its 16 px gutters.
/** @type {Frame} */
const FRAME = {
  width: 358,
  height: 150,
  pad: { top: 22, right: 44, bottom: 22, left: 36 },
};

/**
 * The chart, its heading and the line that reads out the chosen workout;
 * nothing when no workout has an e1RM.
 * @param {Trend} trend
 * @returns {Node[]}
 */
export function e1rmChart(trend) {
  if (trend.points.length === 0) return [];
  return [
    h("h2", { class: "label section" }, `e1RM · ${trend.unit}`),
    ...e1rmChartBody(trend),
  ];
}

/**
 * The chart and the line that reads out the chosen workout, without a
 * heading: the Stats board heads it with its hero number (#82), and links
 * the reading to its workout (#84).
 * @param {Pick<Trend, "unit" | "points">} trend at least one point
 * @param {(point: Trend["points"][number]) => string} [hrefOf]
 * @returns {Node[]}
 */
export function e1rmChartBody({ unit, points }, hrefOf) {
  const { width, height, pad } = FRAME;
  const values = points.map((p) => p.value);
  const { low, high } = niceRange(values);
  const times = points.map((p) => Date.parse(`${p.date}T12:00:00`));
  const timeScale = linear(
    [times[0], times[times.length - 1]],
    [pad.left, width - pad.right],
  );
  const xs = times.map(timeScale);
  /** @param {number} i */
  const x = (i) => xs[i];
  const y = linear([low, high], [height - pad.bottom, pad.top]);
  const end = points.length - 1;

  const chart = chartRoot(
    FRAME,
    `e1RM by workout, ${points.length} workouts: latest ${whole(values[end])} ${unit}, best ${whole(Math.max(...values))} ${unit}`,
  );
  chart.append(...grid(FRAME, [low, high], y));
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
        y: height - 4,
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
        { x: x(end), y: height - 4, "text-anchor": "end", class: "chart-axis" },
        monthDay(points[end].date),
      ),
    );

  const tip = explore(chart, FRAME, xs, (i) => ({
    value: `${whole(values[i])} ${unit}`,
    label: ` e1RM · ${monthDay(points[i].date)}`,
    ...(hrefOf && { href: hrefOf(points[i]), link: "Open workout" }),
  }));

  return [chart, tip];
}
