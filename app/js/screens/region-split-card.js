// The Stats board's region split card (#88; spec #80, stories 42–44): each
// week's hard sets stacked by region, Push at the bottom, then Pull, Legs
// and Core, in their validated colours and that fixed order, which the
// palette was checked for side by side. The regions are named in a legend
// and in every reading, so colour is never the only signal. Each region's
// part of a week is a mark: it reads out and opens its workouts.
import { h } from "../dom.js";
import { REGIONS } from "../core/muscle-groups.js";
import { chartRoot, explore, grid, linear, niceRange, svg } from "./chart.js";
import { openMark } from "./mark.js";
import { countOf, monthDay, setCount } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { Frame } from "./chart.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["regionSplit"]} RegionSplit */

/** @type {Frame} */
const FRAME = {
  width: 358,
  height: 170,
  pad: { top: 12, right: 8, bottom: 22, left: 30 },
};

const PER_WEEK = REGIONS.length;

/**
 * @param {RegionSplit} regionSplit
 * @param {string} rangeWords e.g. "12 weeks"
 * @returns {Node[]}
 */
export function regionSplitCardView({ weeks }, rangeWords) {
  const heading = h("h2", { class: "label section" }, "Hard sets by region");
  const most = Math.max(...weeks.map((w) => w.total));
  if (most === 0)
    return [
      heading,
      h("p", { class: "lede" }, `No hard sets in the last ${rangeWords}.`),
    ];
  const { width, height, pad } = FRAME;
  const { high: top } = niceRange([0, most], 5);
  const y = linear([0, top], [height - pad.bottom, pad.top]);
  const slot = (width - pad.left - pad.right) / weeks.length;
  const barWidth = Math.max(2, slot * 0.7);
  /** @param {number} week */
  const left = (week) => pad.left + slot * (week + 0.5) - barWidth / 2;
  // Each segment's bottom and top, in hard sets, stacked in region order.
  const stacks = weeks.map((week) => {
    let below = 0;
    return week.regions.map((r) => {
      const from = below;
      below += r.hardSets;
      return { from, to: below };
    });
  });

  const latest = weeks[weeks.length - 1];
  const chart = chartRoot(
    FRAME,
    `Hard sets by region per week over ${rangeWords}. This week: ${latest.regions.map((r) => `${r.label} ${setCount(r.hardSets)}`).join(", ")}.`,
  );
  chart.append(...grid(FRAME, [0, top], y));
  weeks.forEach((week, w) =>
    week.regions.forEach((r, i) => {
      const { from, to } = stacks[w][i];
      if (r.hardSets > 0)
        chart.append(
          svg("rect", {
            x: left(w),
            y: y(to),
            width: barWidth,
            height: y(from) - y(to),
            class: "chart-segment",
            "data-region": r.id,
          }),
        );
    }),
  );
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
      monthDay(latest.start),
    ),
  );
  const ring = svg("rect", { class: "calendar-ring", visibility: "hidden" });
  chart.append(ring);

  const tip = explore(chart, {
    frame: FRAME,
    count: weeks.length * PER_WEEK,
    // The week under the pointer, and the region's part at its height, or
    // the top one above the stack.
    nearest: (px, py) => {
      const w = Math.min(
        weeks.length - 1,
        Math.max(0, Math.floor((px - pad.left) / slot)),
      );
      // The pointer's height, back in hard sets.
      const at =
        (top * (height - pad.bottom - py)) / (height - pad.bottom - pad.top);
      const filled = stacks[w]
        .map((s, i) => ({ ...s, i }))
        .filter((s) => s.to > s.from);
      const hit =
        filled.find((s) => at >= s.from && at < s.to) ?? filled.at(-1);
      return w * PER_WEEK + (hit?.i ?? 0);
    },
    choose: (mark) => {
      const w = Math.floor(mark / PER_WEEK);
      const { from, to } = stacks[w][mark % PER_WEEK];
      ring.setAttribute("x", String(left(w) - 1));
      ring.setAttribute("width", String(barWidth + 2));
      ring.setAttribute("y", String(y(to) - 1));
      ring.setAttribute("height", String(Math.max(2, y(from) - y(to)) + 2));
      ring.setAttribute("visibility", "visible");
    },
    read: (mark) => {
      const week = weeks[Math.floor(mark / PER_WEEK)];
      const region = week.regions[mark % PER_WEEK];
      return {
        value: `${region.label} ${setCount(region.hardSets)}`,
        label: ` · week of ${monthDay(week.start)} · ${week.regions.map((r) => `${r.label} ${setCount(r.hardSets)}`).join(", ")}`,
        ...(region.workoutIds.length > 0 && {
          open: openMark(region.workoutIds, {
            kind: "region",
            region: region.id,
            week: week.start,
          }),
        }),
      };
    },
    // Focus starts on the latest week's bottom part, Push.
    start: (weeks.length - 1) * PER_WEEK,
    // Left and right step a week, up and down a region.
    steps: {
      ArrowLeft: -PER_WEEK,
      ArrowRight: PER_WEEK,
      ArrowUp: 1,
      ArrowDown: -1,
    },
  });

  return [
    heading,
    h(
      "p",
      { class: "label card-note" },
      `${countOf(weeks.filter((w) => w.total > 0).length, "week")} with hard sets`,
    ),
    chart,
    tip,
    h(
      "p",
      { class: "region-legend" },
      ...REGIONS.map((r) =>
        h("span", { class: "tag", "data-region": r.id }, r.label),
      ),
    ),
  ];
}
