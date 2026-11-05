// @ts-nocheck -- throwaway prototype (#85); not for main.
// PROTOTYPE (#85, throwaway): three looks for the body heat map, switched by
// ?variant=A|B|C on the Stats page, to pick one on the phone. Not for main:
// the chosen look is rebuilt properly in body-figures.js / body-map-card.js.
//
// A  Band in grey: blue under the 10–20 band, grey in it, red over it.
// B  Blue below, red above: blue under 10, red from 10, solid shapes.
// C  Glow: B's colours as soft glowing shapes on a dim body.
// D  Brighter = more: dim blue under 5 up to bright red over 20.
import { h } from "../dom.js";
import { svg } from "./chart.js";
import { setCount } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["hardSets"]} HardSets */

// Level 0 (none) to 4 (over 20). Validated on #121212 (dataviz validator):
// B: adjacent CVD ΔE ≥ 19.0, normal-vision ≥ 19.1; A: CVD 8.2, normal 15.9.
const PALETTES = {
  A: ["#2b2b2b", "#5598e7", "#1c5cab", "#6e6d68", "#dd716a"],
  B: ["#2b2b2b", "#5598e7", "#1c5cab", "#9e3432", "#dd716a"],
  // D: CVD ΔE ≥ 17.6, normal-vision ≥ 18.3; lightness climbs with volume.
  D: ["#2b2b2b", "#21539c", "#4688e8", "#da534f", "#f2a7a1"],
};
const LEGENDS = {
  A: ["None", "Under 5", "5 to under 10", "10–20 (on target)", "Over 20"],
  B: ["None", "Under 5", "5 to under 10", "10–20", "Over 20"],
  D: ["None", "Under 5", "5 to under 10", "10–20", "Over 20"],
};
const VARIANTS = {
  A: "Band in grey",
  B: "Blue below, red above",
  C: "Glow",
  D: "Brighter = more",
};

// The body's soft silhouette, drawn in a 160 × 310 box, centre x = 80. A
// `pair` shape is the left half, mirrored onto the right.
const SILHOUETTE = [
  {
    pair: false,
    d: "M80 6 C88 6 94 13 94 22 C94 31 88 38 80 38 C72 38 66 31 66 22 C66 13 72 6 80 6 Z",
  },
  { pair: false, d: "M73 34 L87 34 L89 48 L71 48 Z" },
  {
    pair: false,
    d: "M46 50 C60 45 100 45 114 50 C120 60 118 84 111 100 C106 120 106 140 109 158 L51 158 C54 140 54 120 49 100 C42 84 40 60 46 50 Z",
  },
  {
    pair: true,
    d: "M36 54 C44 50 51 55 51 66 L49 118 C49 124 47 128 46 133 L45 168 C46 178 44 196 37 197 C30 197 27 180 28 168 L28 130 C28 122 30 118 29 112 L27 72 C27 62 30 57 36 54 Z",
  },
  {
    pair: true,
    d: "M51 156 L80 156 L79 236 C79 244 77 252 75 260 L71 300 C73 305 75 310 66 310 L56 310 C52 310 53 304 56 300 L52 258 C51 248 51 244 52 236 C47 210 45 182 51 156 Z",
  },
];

/** @type {Record<"front" | "back", { muscleGroup: string, pair: boolean, d: string }[]>} */
const MUSCLES = {
  front: [
    {
      muscleGroup: "traps",
      pair: true,
      d: "M74 40 C68 45 60 48 52 50 C60 54 68 54 75 51 Z",
    },
    {
      muscleGroup: "side-delts",
      pair: true,
      d: "M46 52 C38 52 32 58 32 68 C32 75 35 80 39 82 C40 72 42 62 46 52 Z",
    },
    {
      muscleGroup: "front-delts",
      pair: true,
      d: "M48 52 C55 52 61 56 62 61 C58 69 52 75 44 80 C42 70 44 60 48 52 Z",
    },
    {
      muscleGroup: "chest",
      pair: true,
      d: "M63 58 C70 56 76 56 79 58 L79 86 C72 90 62 88 56 82 C54 74 56 64 63 58 Z",
    },
    {
      muscleGroup: "biceps",
      pair: true,
      d: "M34 86 C40 84 46 86 46 92 C47 102 45 112 41 117 C36 116 32 110 31 100 C30 93 31 88 34 86 Z",
    },
    {
      muscleGroup: "forearms",
      pair: true,
      d: "M31 123 C37 121 44 123 45 129 C45 143 41 158 39 168 L32 168 C29 156 28 141 28 131 C28 127 29 124 31 123 Z",
    },
    {
      muscleGroup: "abs",
      pair: true,
      d: "M70 93 C73 92 77 92 79 93 L79 146 C75 147 71 144 69 140 Z",
    },
    {
      muscleGroup: "obliques",
      pair: true,
      d: "M56 93 C62 93 66 97 67 105 L67 140 C62 140 57 134 55 124 C53 112 53 100 56 93 Z",
    },
    {
      muscleGroup: "quads",
      pair: true,
      d: "M52 163 C60 159 72 161 75 165 C76 187 73 214 68 233 C62 235 56 231 54 223 C49 205 48 182 52 163 Z",
    },
    {
      muscleGroup: "adductors",
      pair: true,
      d: "M77 165 C79 167 79 173 79 181 C79 196 76 209 73 219 C72 200 74 182 77 165 Z",
    },
    {
      muscleGroup: "calves",
      pair: true,
      d: "M55 255 C61 251 70 253 72 259 C73 275 70 290 66 299 L60 299 C55 289 53 272 55 255 Z",
    },
  ],
  back: [
    {
      muscleGroup: "lats-upper-back",
      pair: true,
      d: "M55 62 C62 66 69 76 75 88 L79 98 L79 124 C72 124 62 118 56 108 C51 96 50 80 55 62 Z",
    },
    {
      muscleGroup: "traps",
      pair: false,
      d: "M80 38 C84 41 94 46 104 50 C98 56 90 64 86 76 L80 86 L74 76 C70 64 62 56 56 50 C66 46 76 41 80 38 Z",
    },
    {
      muscleGroup: "side-delts",
      pair: true,
      d: "M46 52 C38 52 32 58 32 68 C32 75 35 80 39 82 C40 72 42 62 46 52 Z",
    },
    {
      muscleGroup: "rear-delts",
      pair: true,
      d: "M48 53 C55 53 60 56 60 61 C57 68 51 75 44 80 C42 70 44 61 48 53 Z",
    },
    {
      muscleGroup: "triceps",
      pair: true,
      d: "M34 86 C40 84 46 86 46 92 C47 102 45 112 41 117 C36 116 32 110 31 100 C30 93 31 88 34 86 Z",
    },
    {
      muscleGroup: "forearms",
      pair: true,
      d: "M31 123 C37 121 44 123 45 129 C45 143 41 158 39 168 L32 168 C29 156 28 141 28 131 C28 127 29 124 31 123 Z",
    },
    {
      muscleGroup: "lower-back",
      pair: true,
      d: "M70 127 C74 126 77 126 79 127 L79 147 C75 149 71 146 69 142 Z",
    },
    {
      muscleGroup: "glutes",
      pair: true,
      d: "M55 152 C62 148 74 148 79 152 L79 184 C70 188 58 186 53 178 C50 168 51 158 55 152 Z",
    },
    {
      muscleGroup: "hamstrings",
      pair: true,
      d: "M52 191 C60 189 72 189 77 191 C78 207 76 222 72 235 C64 237 56 233 54 225 C50 213 50 201 52 191 Z",
    },
    {
      muscleGroup: "calves",
      pair: true,
      d: "M54 253 C62 249 72 251 73 261 C74 275 70 287 66 297 L60 297 C55 287 52 271 54 253 Z",
    },
  ],
};

/**
 * One shape, and its mirror for a pair, in a figure's box.
 * @param {{ pair: boolean, d: string }} shape
 * @param {Record<string, string | number>} attrs
 */
function draw(shape, attrs) {
  const one = svg("path", { d: shape.d, ...attrs });
  if (!shape.pair) return [one];
  return [
    one,
    svg("path", {
      d: shape.d,
      ...attrs,
      transform: "translate(160 0) scale(-1 1)",
    }),
  ];
}

/**
 * The prototype's card for a variant.
 * @param {HardSets} hardSets
 * @param {string} variant
 * @returns {Node[]}
 */
export function bodyMapPrototype({ muscleGroups }, variant) {
  const key = variant in VARIANTS ? variant : "A";
  const palette = PALETTES[key === "C" ? "B" : key];
  const glow = key === "C";
  const levels = new Map(muscleGroups.map((m) => [m.id, m.level]));
  const chart = svg("svg", {
    viewBox: "0 0 358 324",
    class: "chart",
    role: "img",
    "aria-label": `Body heat map, prototype ${key}`,
  });
  for (const [view, offset] of /** @type {const} */ ([
    ["front", 10],
    ["back", 188],
  ])) {
    const g = svg("g", { transform: `translate(${offset} 0)` });
    for (const shape of SILHOUETTE)
      g.append(
        ...draw(shape, {
          fill: glow ? "#161616" : "#1b1b1b",
          stroke: "#2c2c2c",
          "stroke-width": 1,
        }),
      );
    for (const shape of MUSCLES[view]) {
      const colour = palette[levels.get(shape.muscleGroup) ?? 0];
      g.append(
        ...draw(shape, {
          fill: colour,
          stroke: glow ? colour : "#121212",
          "stroke-width": glow ? 0.5 : 1.5,
          "stroke-linejoin": "round",
          ...(glow && {
            style: `filter: drop-shadow(0 0 5px ${colour}); opacity: 0.9`,
          }),
        }),
      );
    }
    g.append(
      svg(
        "text",
        { x: 80, y: 322, "text-anchor": "middle", class: "chart-axis" },
        view.toUpperCase(),
      ),
    );
    chart.append(g);
  }
  const chest = muscleGroups.find((m) => m.id === "chest");
  return [
    h(
      "h2",
      { class: "label section card-head" },
      h("span", {}, "Body heat map"),
      h("span", {}, "Hard sets / week"),
    ),
    chart,
    h(
      "p",
      { class: "chart-tip" },
      h("strong", {}, setCount(chest?.perWeek ?? 0)),
      h("span", { class: "label" }, " hard sets a week · Chest · in the band"),
    ),
    h(
      "p",
      { class: "heat-legend label" },
      h("span", {}, "Hard sets a week"),
      ...LEGENDS[key === "C" ? "B" : key].map((text, level) =>
        h(
          "span",
          { class: "heat-key" },
          h("span", {
            class: "heat-swatch",
            style: `background: ${palette[level]}`,
          }),
          text,
        ),
      ),
    ),
    switcher(key),
  ];
}

/**
 * The floating bar that flips variants; prototype only.
 * @param {string} key
 */
function switcher(key) {
  const keys = Object.keys(VARIANTS);
  /** @param {number} step */
  const go = (step) => {
    const next = keys[(keys.indexOf(key) + step + keys.length) % keys.length];
    const url = new URL(location.href);
    url.searchParams.set("variant", next);
    history.replaceState(null, "", url);
    dispatchEvent(new HashChangeEvent("hashchange"));
  };
  return h(
    "div",
    {
      class: "prototype-switcher",
      role: "group",
      "aria-label": "Prototype variants",
    },
    h("button", { type: "button", onclick: () => go(-1) }, "←"),
    h(
      "span",
      {},
      `${key} · ${VARIANTS[/** @type {keyof typeof VARIANTS} */ (key)]}`,
    ),
    h("button", { type: "button", onclick: () => go(1) }, "→"),
  );
}
