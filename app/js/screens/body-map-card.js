// The Stats board's body heat map (#85; spec #80, stories 26–30): front
// and back figures, each muscle group shaded by its hard sets per week, the
// same numbers as the hard-sets card. Its colours climb from dim blue (fewer)
// to bright red (more), the scale the maintainer chose on PR #100, their
// lightness rising at every step, so brighter always means more. A legend gives each shade's numbers and a
// muscle group's reading names it with its own, so the shade is never the
// only signal.
import { h } from "../dom.js";
import { BODY_MAP_EDGES } from "../core/dashboard.js";
import { BOX, FIGURES, MIRROR, SILHOUETTE, unmirror } from "./body-figures.js";
import { chartRoot, explore, heatLegend, svg } from "./chart.js";
import { markId } from "./mark.js";
import { setCount } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { RangeId } from "../core/dashboard.js" */
/** @import { Shape } from "./body-figures.js" */
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
 * A shape's path, and its mirror for a pair.
 * @param {Shape} shape
 * @param {Record<string, string | number>} attrs
 * @returns {{ el: SVGPathElement, mirrored: boolean }[]}
 */
const paths = (shape, attrs) =>
  (shape.pair ? [false, true] : [false]).map((mirrored) => ({
    el: /** @type {SVGPathElement} */ (
      svg("path", {
        d: shape.d,
        ...attrs,
        ...(mirrored && { transform: MIRROR }),
      })
    ),
    mirrored,
  }));

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

  /**
   * Each drawn muscle group shape, with what finding it under a point
   * needs: its figure's offset and whether it's a mirrored half.
   * @type {{ i: number, offset: number, mirrored: boolean, el: SVGPathElement }[]}
   */
  const shapes = [];
  for (const figure of FIGURES) {
    const g = svg("g", { transform: `translate(${figure.offset} 0)` });
    for (const shape of SILHOUETTE)
      g.append(...paths(shape, { class: "body-silhouette" }).map((p) => p.el));
    for (const shape of figure.shapes) {
      const i = index.get(shape.muscleGroup);
      if (i === undefined) continue;
      for (const { el, mirrored } of paths(shape, {
        class: "muscle-shape",
        "data-level": muscleGroups[i].level,
      })) {
        g.append(el);
        shapes.push({ i, offset: figure.offset, mirrored, el });
      }
    }
    g.append(
      svg(
        "text",
        {
          x: BOX.centre,
          y: FRAME.height - 4,
          "text-anchor": "middle",
          class: "chart-axis",
        },
        figure.name.toUpperCase(),
      ),
    );
    chart.append(g);
  }

  /**
   * A card point in a shape's own drawing space: into its figure's box, and
   * mirrored back for a right half.
   * @param {{ offset: number, mirrored: boolean }} shape
   * @param {number} px
   * @param {number} py
   */
  const local = ({ offset, mirrored }, px, py) => {
    const x = px - offset;
    return { x: mirrored ? unmirror(x) : x, y: py };
  };

  const tip = explore(chart, {
    frame: FRAME,
    count: muscleGroups.length,
    // The shape under the pointer, the top one first; else the nearest.
    nearest: (px, py) => {
      for (let k = shapes.length - 1; k >= 0; k--)
        if (shapes[k].el.isPointInFill(local(shapes[k], px, py)))
          return shapes[k].i;
      let best = shapes[0];
      let bestDistance = Infinity;
      for (const s of shapes) {
        const box = s.el.getBBox();
        const { x, y } = local(s, px, py);
        const distance =
          (box.x + box.width / 2 - x) ** 2 + (box.y + box.height / 2 - y) ** 2;
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

  return [
    heading,
    chart,
    tip,
    heatLegend("Hard sets a week", LEGEND, "body-legend"),
  ];
}
