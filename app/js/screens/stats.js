// The Stats board (spec #80; #82): one range for every card, laid out as
// the Slab prototype's progress board. Cards draw what the core's
// dashboard query returns; the rules live in the core.
import { h } from "../dom.js";
import { e1rmChartBody } from "./e1rm-chart.js";
import { hardSetsCardView } from "./hard-sets-card.js";
import { calendarCardView } from "./calendar-card.js";
import { tonnageCardView } from "./tonnage-card.js";
import { regionSplitCardView } from "./region-split-card.js";
import { recordTimelineCardView } from "./record-timeline-card.js";
import { pointHref } from "./mark.js";
import { rangeWords, screen, whole } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { Forge } from "../core/forge.js" */
/** @import { RangeId } from "../core/dashboard.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>} Dashboard */

// Each range's chip; typed by the core's ranges, so a new one can't be
// left without a chip.
/** @type {Record<RangeId, string>} */
const CHIPS = { "4w": "4W", "12w": "12W", "1y": "1Y" };

/**
 * @param {Pick<ScreenContext, "forge">} context
 */
export function statsView({ forge }) {
  const board = h("div", { class: "board" });
  show();
  return screen("Stats", board);

  async function show() {
    const dashboard = await forge.dashboard();
    board.replaceChildren(
      rangeChips(dashboard.range.id, async (range) => {
        await forge.chooseDashboard({ range });
        show();
      }),
      h("hr", { class: "rule" }),
      ...e1rmCard(dashboard, async (exerciseId) => {
        await forge.chooseDashboard({ exerciseId });
        show();
      }),
      h("hr", { class: "rule" }),
      ...hardSetsCardView(dashboard.hardSets, {
        id: dashboard.range.id,
        words: rangeWords(dashboard.range.weeks),
      }),
      h("hr", { class: "rule" }),
      ...calendarCardView(dashboard.calendar, dashboard.range.weeks),
      h("hr", { class: "rule" }),
      ...tonnageCardView(dashboard.tonnage, rangeWords(dashboard.range.weeks)),
      h("hr", { class: "rule" }),
      ...regionSplitCardView(
        dashboard.regionSplit,
        rangeWords(dashboard.range.weeks),
      ),
      h("hr", { class: "rule" }),
      ...recordTimelineCardView(
        dashboard.records,
        rangeWords(dashboard.range.weeks),
        forge.today(),
      ),
    );
  }
}

/**
 * The range control (story 2): pressed chip is the range shown.
 * @param {RangeId} current
 * @param {(range: RangeId) => void} choose
 */
function rangeChips(current, choose) {
  return h(
    "div",
    { class: "chips range", role: "group", "aria-label": "Range" },
    ...Object.entries(CHIPS).map(([id, label]) =>
      h(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-pressed": String(id === current),
          onclick: () => {
            if (id !== current) choose(/** @type {RangeId} */ (id));
          },
        },
        label,
      ),
    ),
  );
}

/**
 * The e1RM card (stories 11–17): the exercise, its latest e1RM as the hero,
 * the change over the range and the trend line.
 * @param {Dashboard} dashboard
 * @param {(exerciseId: string) => void} choose
 * @returns {Node[]}
 */
function e1rmCard({ range, e1rm }, choose) {
  const heading = h("h2", { class: "label section" }, "e1RM trend");
  if (!e1rm)
    return [
      heading,
      h(
        "p",
        { class: "lede" },
        // Non-breaking spaces keep each exercise type on one line.
        "No e1RM yet. It shows once you finish a workout with weight\u00a0×\u00a0reps or bodyweight\u00a0×\u00a0reps sets.",
      ),
    ];
  const { exerciseId, name, unit, points, latest, change, choices } = e1rm;
  const picker = h(
    "select",
    {
      class: "search exercise-pick",
      "aria-label": "Exercise",
      onchange: (/** @type {Event} */ e) =>
        choose(/** @type {HTMLSelectElement} */ (e.target).value),
    },
    ...choices.map(({ id, name }) =>
      h("option", { value: id, selected: id === exerciseId }, name),
    ),
  );
  if (latest === undefined)
    return [
      heading,
      picker,
      h(
        "p",
        { class: "lede" },
        `No ${name} workouts in the last ${rangeWords(range.weeks)}.`,
      ),
    ];
  return [
    heading,
    picker,
    h(
      "p",
      { class: "hero" },
      h("span", { class: "hero-value" }, whole(latest)),
      h(
        "span",
        { class: "hero-side" },
        h("span", { class: "hero-unit" }, unit),
        change ? changeLine(change, unit) : false,
      ),
    ),
    // A point opens its workout within Stats (#84; stories 51, 60).
    ...e1rmChartBody({ unit, points }, (point) => pointHref(point.workoutId)),
  ];
}

/**
 * The change as the prototype writes it, with an arrow and a sign so the
 * direction never rests on colour (story 15): "▲ +9 / 8 WKS". A screen
 * reader hears it in words instead (story 55): "up 9 lb over 8 weeks".
 * @param {{ value: number, weeks: number }} change
 * @param {string} unit
 */
function changeLine({ value, weeks }, unit) {
  const rounded = Math.round(value);
  const size = Math.abs(rounded);
  const [arrow, way] =
    rounded > 0
      ? ["▲ +", `up ${size} ${unit}`]
      : rounded < 0
        ? ["▼ −", `down ${size} ${unit}`]
        : ["= ", "no change"];
  const [span, over] =
    weeks < 1
      ? ["<1 WK", "within a week"]
      : weeks === 1
        ? ["1 WK", "over 1 week"]
        : [`${weeks} WKS`, `over ${weeks} weeks`];
  return h(
    "span",
    { class: "hero-change" },
    h("span", { "aria-hidden": "true" }, `${arrow}${size} / ${span}`),
    h("span", { class: "visually-hidden" }, `${way} ${over}`),
  );
}
