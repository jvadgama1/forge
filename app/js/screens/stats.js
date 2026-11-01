// The Stats board (spec #80; #82): one range for every card, laid out as
// the Slab prototype's progress board. Cards draw what the core's
// dashboard query returns; the rules live in the core.
import { h } from "../dom.js";
import { e1rmTrendChart } from "./e1rm-chart.js";
import { screen, whole } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */
/** @import { Forge } from "../core/forge.js" */
/** @import { RangeId } from "../core/dashboard.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>} Dashboard */

/** @type {{ id: RangeId, label: string, words: string }[]} */
const RANGES = [
  { id: "4w", label: "4W", words: "4 weeks" },
  { id: "12w", label: "12W", words: "12 weeks" },
  { id: "1y", label: "1Y", words: "year" },
];

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
    ...RANGES.map(({ id, label }) =>
      h(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-pressed": String(id === current),
          onclick: () => {
            if (id !== current) choose(id);
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
        "No e1RM yet. It shows once you finish a workout with weight × reps or bodyweight sets.",
      ),
    ];
  const { exerciseId, unit, points, latest, change, choices } = e1rm;
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
  const name = choices.find((c) => c.id === exerciseId)?.name ?? exerciseId;
  if (latest === undefined)
    return [
      heading,
      picker,
      h(
        "p",
        { class: "lede" },
        `No ${name} workouts in the last ${words(range.id)}.`,
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
        change
          ? h(
              "span",
              { class: "hero-change", "aria-label": changeWords(change, unit) },
              changeText(change),
            )
          : false,
      ),
    ),
    ...e1rmTrendChart({ unit, points }),
  ];
}

/** @param {RangeId} id */
const words = (id) => RANGES.find((r) => r.id === id)?.words ?? id;

/**
 * The change as the prototype writes it, with an arrow and a sign so the
 * direction never rests on colour (story 15): "▲ +9 / 8 WKS".
 * @param {{ value: number, weeks: number }} change
 */
function changeText({ value, weeks }) {
  const rounded = Math.round(value);
  const arrow = rounded > 0 ? "▲ +" : rounded < 0 ? "▼ −" : "= ";
  const span = weeks < 1 ? "<1 WK" : weeks === 1 ? "1 WK" : `${weeks} WKS`;
  return `${arrow}${Math.abs(rounded)} / ${span}`;
}

/**
 * The change read aloud (story 55): "up 32 lb over 11 weeks".
 * @param {{ value: number, weeks: number }} change
 * @param {string} unit
 */
function changeWords({ value, weeks }, unit) {
  const rounded = Math.round(value);
  const way = rounded > 0 ? "up" : "down";
  const over =
    weeks < 1 ? "within a week" : `over ${weeks} week${weeks === 1 ? "" : "s"}`;
  return rounded === 0
    ? `no change ${over}`
    : `${way} ${Math.abs(rounded)} ${unit} ${over}`;
}
