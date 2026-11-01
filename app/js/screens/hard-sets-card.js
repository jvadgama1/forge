// The Stats board's hard-sets card (#83; spec #80, stories 18–25): hard sets
// per week for every muscle group, a horizontal bar each, since 17 upright
// bars won't fit a phone with readable names. Grouped by region, in its
// validated colour beside the region's name, against the 10–20 band, with
// each muscle group's state in words so neither colour nor length carries
// it alone.
import { h } from "../dom.js";
import { TARGET } from "../core/dashboard.js";

/** @import { Forge } from "../core/forge.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["hardSets"]} HardSets */

const REGIONS = /** @type {const} */ ([
  ["push", "Push"],
  ["pull", "Pull"],
  ["legs", "Legs"],
  ["core", "Core"],
]);

/** @type {Record<HardSets["muscles"][number]["band"], string>} */
const BAND_WORDS = { under: "Under", in: "In band", over: "Over" };

/**
 * A count as the card shows it: whole, or to 0.1 where it isn't ("9.5").
 * @param {number} n
 */
const sets = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * @param {HardSets} hardSets
 * @param {string} rangeWords e.g. "12 weeks"
 * @returns {Node[]}
 */
export function hardSetsCard({ trainingWeeks, muscles }, rangeWords) {
  const heading = h(
    "h2",
    { class: "label section card-head" },
    h("span", {}, "Hard sets / week"),
    h("span", {}, `Target ${TARGET.min}–${TARGET.max}`),
  );
  if (trainingWeeks === 0)
    return [
      heading,
      h("p", { class: "lede" }, `No workouts in the last ${rangeWords}.`),
    ];
  // Room past the band, so "over" shows as over.
  const scale = Math.max(TARGET.max + 5, ...muscles.map((m) => m.perWeek));
  /** @param {number} n */
  const pct = (n) => `${(n / scale) * 100}%`;
  return [
    heading,
    h(
      "p",
      { class: "label hard-sets-note" },
      `Average of ${trainingWeeks} training week${trainingWeeks === 1 ? "" : "s"}`,
    ),
    ...REGIONS.flatMap(([region, name]) => [
      h("p", { class: "tag hard-sets-region", "data-region": region }, name),
      h(
        "ul",
        { class: "hard-sets", "data-region": region },
        ...muscles
          .filter((m) => m.region === region)
          .map((m) =>
            h(
              "li",
              { class: "hard-set", "data-band": m.band },
              h("span", { class: "hard-set-name" }, m.label),
              h(
                "span",
                {
                  class: "hard-set-track",
                  "aria-hidden": "true",
                  style: `--band-from: ${pct(TARGET.min)}; --band-width: ${pct(TARGET.max - TARGET.min)}; --value: ${pct(m.perWeek)}`,
                },
                h("span", { class: "hard-set-band" }),
                h("span", { class: "hard-set-bar" }),
              ),
              h("span", { class: "hard-set-value" }, sets(m.perWeek)),
              h("span", { class: "hard-set-state" }, BAND_WORDS[m.band]),
            ),
          ),
      ),
    ]),
  ];
}
