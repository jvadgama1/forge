// The Stats board's body heat map (#85; spec #80, stories 26–30): front
// and back figures, each muscle group shaded on the validated heat-map ramp
// by its hard sets per week, the same numbers as the hard-sets card. A
// legend gives each shade's numbers and a muscle group's reading names it
// with its own, so the shade is never the only signal.
import { h } from "../dom.js";
import { BODY_MAP_EDGES } from "../core/dashboard.js";
import { BOX, FIGURES, HEAD, NECK, placed } from "./body-figures.js";
import { chartRoot, explore, heatLegend, svg } from "./chart.js";
import { markId } from "./mark.js";
import { setCount } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { RangeId } from "../core/dashboard.js" */
/** @import { Points } from "./body-figures.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["hardSets"]} HardSets */

// Two figures side by side, their names beneath.
const FRAME = {
  width: 358,
  height: BOX.height + 14,
  pad: { top: 0, right: 0, bottom: 0, left: 0 },
};

// Each shade's hard sets a week, from the core's edges; a number like 9.5
// sits in one shade only.
const { low, min, max } = BODY_MAP_EDGES;
const LEGEND = [
  "None",
  `Under ${low}`,
  `${low} to under ${min}`,
  `${min}–${max}`,
  `Over ${max}`,
];

/** @type {Record<HardSets["muscleGroups"][number]["band"], string>} */
const BAND_WORDS = {
  under: "under the band",
  in: "in the band",
  over: "over the band",
};

/**
 * Whether a point is inside a shape (ray casting).
 * @param {number} x
 * @param {number} y
 * @param {Points} points
 */
function inside(x, y, points) {
  let hit = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}

/** @param {Points} points */
const centre = (points) => [
  points.reduce((n, [x]) => n + x, 0) / points.length,
  points.reduce((n, [, y]) => n + y, 0) / points.length,
];

/** @param {Points} points */
const pointsAttr = (points) => points.map(([x, y]) => `${x},${y}`).join(" ");

/**
 * @param {HardSets} hardSets
 * @param {{ id: RangeId, words: string }} range
 * @returns {Node[]}
 */
export function bodyMapCardView({ trainingWeeks, muscleGroups }, range) {
  const heading = h(
    "h2",
    { class: "label section card-head" },
    h("span", {}, "Body heat map"),
    h("span", {}, "Hard sets / week"),
  );
  if (trainingWeeks === 0)
    return [
      heading,
      h("p", { class: "lede" }, `No workouts in the last ${range.words}.`),
    ];
  const index = new Map(muscleGroups.map((m, i) => [m.id, i]));
  const chart = chartRoot(
    FRAME,
    `Body heat map, hard sets a week: ${muscleGroups.map((m) => `${m.label} ${setCount(m.perWeek)}`).join(", ")}.`,
  );
  chart.classList.add("body-map");

  /** Each drawn shape with the muscle group it stands for. @type {{ i: number, points: Points, el: SVGElement }[]} */
  const shapes = [];
  for (const figure of FIGURES) {
    const centre = figure.offset + BOX.centre;
    // The head and neck, then the other shapes that aren't muscle groups.
    chart.append(
      svg("circle", {
        cx: centre,
        cy: HEAD.cy,
        r: HEAD.r,
        class: "body-neutral",
      }),
      svg("rect", {
        x: centre - NECK.width / 2,
        y: NECK.top,
        width: NECK.width,
        height: NECK.height,
        class: "body-neutral",
      }),
    );
    for (const half of figure.neutral)
      for (const mirrored of [false, true])
        chart.append(
          svg("polygon", {
            points: pointsAttr(placed(half, figure.offset, mirrored)),
            class: "body-neutral",
          }),
        );
    for (const shape of figure.shapes) {
      const i = index.get(shape.muscleGroup);
      if (i === undefined) continue;
      for (const mirrored of shape.pair ? [false, true] : [false]) {
        const points = placed(shape.points, figure.offset, mirrored);
        const el = svg("polygon", {
          points: pointsAttr(points),
          class: "muscle-shape",
          "data-level": muscleGroups[i].level,
        });
        chart.append(el);
        shapes.push({ i, points, el });
      }
    }
    chart.append(
      svg(
        "text",
        {
          x: centre,
          y: FRAME.height - 4,
          "text-anchor": "middle",
          class: "chart-axis",
        },
        figure.name.toUpperCase(),
      ),
    );
  }

  const tip = explore(chart, {
    frame: FRAME,
    count: muscleGroups.length,
    // The shape under the pointer, the top one first; else the nearest.
    nearest: (px, py) => {
      for (let k = shapes.length - 1; k >= 0; k--)
        if (inside(px, py, shapes[k].points)) return shapes[k].i;
      let best = shapes[0];
      let bestDistance = Infinity;
      for (const s of shapes) {
        const [cx, cy] = centre(s.points);
        const distance = (cx - px) ** 2 + (cy - py) ** 2;
        if (distance < bestDistance) [best, bestDistance] = [s, distance];
      }
      return best.i;
    },
    // A muscle group's shapes on both figures are outlined together.
    choose: (i) => {
      for (const s of shapes)
        s.el.classList.toggle("muscle-shape-chosen", s.i === i);
    },
    read: (i) => {
      const m = muscleGroups[i];
      return {
        value: setCount(m.perWeek),
        label: ` hard sets a week · ${m.label} · ${BAND_WORDS[m.band]}`,
        ...(m.perWeek > 0 && {
          open: {
            href: `#/stats/${markId({ kind: "hard-sets", muscleGroup: m.id, range: range.id })}`,
            words: "Open workouts",
          },
        }),
      };
    },
    start: 0,
  });

  return [heading, chart, tip, heatLegend("Hard sets a week", LEGEND)];
}
