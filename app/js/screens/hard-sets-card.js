// The Stats board's hard-sets card (#83; spec #80, stories 18–25): hard sets
// per week for every muscle group, a horizontal bar each, since 17 upright
// bars won't fit a phone with readable names. Grouped by region, in its
// validated colour beside the region's name, against the 10–20 band, with
// each muscle group's state in words so neither colour nor length carries
// it alone. Each bar carries its number, so it needs no tip (spec #80,
// Look); a row opens the workouts behind it (#84).
import { h } from "../dom.js";
import { TARGET } from "../core/dashboard.js";
import { REGIONS } from "../core/muscle-groups.js";
import { markId } from "./mark.js";
import { setCount } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { RangeId } from "../core/dashboard.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["hardSets"]} HardSets */
/** @typedef {HardSets["muscleGroups"][number]["band"]} Band */

/** @type {Record<Band, string>} */
const BAND_WORDS = { under: "Under", in: "In band", over: "Over" };

/**
 * @param {HardSets} hardSets
 * @param {{ id: RangeId, words: string }} range e.g. 12w, "12 weeks"
 * @returns {Node[]}
 */
export function hardSetsCardView({ trainingWeeks, muscleGroups }, range) {
  const heading = h(
    "h2",
    { class: "label section card-head" },
    h("span", {}, "Hard sets / week"),
    h("span", {}, `Target ${TARGET.min}–${TARGET.max}`),
  );
  if (trainingWeeks === 0)
    return [
      heading,
      h("p", { class: "lede" }, `No workouts in the last ${range.words}.`),
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
              {},
              h(
                "a",
                {
                  class: "hard-set",
                  "data-band": m.band,
                  href: `#/stats/${markId({ kind: "hard-sets", muscleGroup: m.id, range: range.id })}`,
                },
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
      ),
    ]),
  ];
}
