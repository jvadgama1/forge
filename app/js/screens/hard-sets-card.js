// The Stats board's hard-sets card (#83; spec #80, stories 18–25): hard sets
// per week for every muscle group, a horizontal bar each, since 17 upright
// bars won't fit a phone with readable names. Grouped by region, in its
// validated colour beside the region's name, against the 10–20 band, with
// each muscle group's state in words so neither colour nor length carries
// it alone. Each bar carries its number, so it needs no tip (spec #80,
// Look).
import { h } from "../dom.js";
import { TARGET } from "../core/dashboard.js";
import { REGIONS } from "../core/muscle-groups.js";

/** @import { Forge } from "../core/forge.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["hardSets"]} HardSets */
/** @typedef {HardSets["muscleGroups"][number]["band"]} Band */

/** @type {Record<Band, string>} */
const BAND_WORDS = { under: "Under", in: "In band", over: "Over" };

/**
 * A count as the card shows it: whole, or to 0.1 where it isn't ("9.5").
 * @param {number} n
 */
const setCount = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

/**
 * @param {HardSets} hardSets
 * @param {string} rangeWords e.g. "12 weeks"
 * @returns {Node[]}
 */
export function hardSetsCardView({ trainingWeeks, muscleGroups }, rangeWords) {
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
  const scale = Math.max(TARGET.max + 5, ...muscleGroups.map((m) => m.perWeek));
  /** @param {number} n */
  const pct = (n) => `${(n / scale) * 100}%`;
  /** @param {Band} band */
  const howMany = (band) => muscleGroups.filter((m) => m.band === band).length;
  return [
    heading,
    h(
      "p",
      { class: "label hard-sets-note" },
      `Average of ${trainingWeeks} training week${trainingWeeks === 1 ? "" : "s"}`,
    ),
    // The whole card in a sentence, for a screen reader (story 55).
    h(
      "p",
      { class: "visually-hidden" },
      `Of 17 muscle groups, ${howMany("in")} in the band, ${howMany("over")} over, ${howMany("under")} under.`,
    ),
    ...REGIONS.flatMap((region) => [
      h(
        "p",
        { class: "tag hard-sets-region", "data-region": region.id },
        region.label,
      ),
      h(
        "ul",
        { class: "hard-sets", "data-region": region.id },
        ...muscleGroups
          .filter((m) => m.region === region.id)
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
              h("span", { class: "hard-set-value" }, setCount(m.perWeek)),
              h("span", { class: "hard-set-state" }, BAND_WORDS[m.band]),
            ),
          ),
      ),
    ]),
  ];
}
