// The Stats board's tonnage card (#87; spec #80, stories 36–41): tonnage
// per week as lime bars, a single series in the accent, so no legend and no
// new colour. A week's reading names each workout's tonnage, and its bar
// opens them.
import { h } from "../dom.js";
import {
  chartRoot,
  exploreAlong,
  grid,
  linear,
  niceRange,
  svg,
} from "./chart.js";
import { openMark } from "./mark.js";
import { countOf, monthDay, thousands, tonnageText } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { Frame } from "./chart.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["tonnage"]} Tonnage */
/** @typedef {Tonnage["weeks"][number]} Week */

// Room on the left for a tick like "15,000".
/** @type {Frame} */
const FRAME = {
  width: 358,
  height: 150,
  pad: { top: 16, right: 8, bottom: 22, left: 48 },
};

/**
 * @param {Tonnage} tonnage
 * @param {string} rangeWords e.g. "12 weeks"
 * @returns {Node[]}
 */
export function tonnageCardView({ unit, weeks }, rangeWords) {
  const heading = h(
    "h2",
    { class: "label section card-head" },
    h("span", {}, "Tonnage / week"),
    h("span", {}, unit),
  );
  const most = Math.max(...weeks.map((w) => w.tonnage));
  // Workouts of only cardio, timed holds or unweighed assisted sets have
  // no tonnage, which isn't the same as none at all (story 10).
  if (most === 0)
    return [
      heading,
      h(
        "p",
        { class: "lede" },
        weeks.some((w) => w.workouts.length)
          ? `No sets with a load in the last ${rangeWords}.`
          : `No workouts in the last ${rangeWords}.`,
      ),
    ];
  const { width, height, pad } = FRAME;
  // A round top tick a little above the highest week.
  const { high: top } = niceRange(
    [0, most],
    10 ** Math.floor(Math.log10(most)) / 2,
  );
  const y = linear([0, top], [height - pad.bottom, pad.top]);
  const slot = (width - pad.left - pad.right) / weeks.length;
  const barWidth = Math.max(2, slot * 0.7);
  /** @param {number} i the bar's centre */
  const x = (i) => pad.left + slot * (i + 0.5);
  const latest = weeks.at(-1)?.tonnage ?? 0;

  const chart = chartRoot(
    FRAME,
    `Tonnage by week over ${rangeWords}, in ${unit}: this week ${tonnageText(latest, unit)}, highest ${tonnageText(most, unit)}.`,
  );
  chart.append(...grid(FRAME, [0, top], y, thousands));
  weeks.forEach((week, i) => {
    if (week.tonnage > 0)
      chart.append(
        svg("rect", {
          x: x(i) - barWidth / 2,
          y: y(week.tonnage),
          width: barWidth,
          height: y(0) - y(week.tonnage),
          class: "chart-bar",
        }),
      );
  });
  chart.append(
    svg(
      "text",
      { x: pad.left, y: height - 4, class: "chart-axis" },
      monthDay(weeks[0].start),
    ),
    svg(
      "text",
      {
        x: width - pad.right,
        y: height - 4,
        "text-anchor": "end",
        class: "chart-axis",
      },
      monthDay(weeks[weeks.length - 1].start),
    ),
  );

  const tip = exploreAlong(
    chart,
    FRAME,
    weeks.map((_, i) => x(i)),
    (i) => {
      const week = weeks[i];
      const each = week.workouts
        .map((w) => `${monthDay(w.date)}: ${tonnageText(w.tonnage, unit)}`)
        .join(", ");
      return {
        value: tonnageText(week.tonnage, unit),
        label: ` · week of ${monthDay(week.start)} · ${each || "no workouts"}`,
        ...(week.workouts.length > 0 && {
          open: openMark(
            week.workouts.map((w) => w.workoutId),
            { kind: "tonnage", week: week.start },
          ),
        }),
      };
    },
  );

  return [
    heading,
    h(
      "p",
      { class: "label card-note" },
      `${countOf(weeks.filter((w) => w.tonnage > 0).length, "week")} with workouts`,
    ),
    chart,
    tip,
  ];
}
