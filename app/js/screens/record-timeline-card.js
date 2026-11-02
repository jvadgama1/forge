// The Stats board's record timeline (#89; spec #80, stories 45–48): the
// records set in the range, newest first, one row per set with every kind
// it beat, in the celebration's own words, so the board and the gym floor
// agree. Each row opens its workout. A list rather than a chart, so every
// record reads in full.
import { h } from "../dom.js";
import { setText } from "./measure.js";
import { countOf, listDate, whole } from "./screen.js";
import { recordName } from "./workout.js";

/** @import { Forge } from "../core/forge.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["records"]} Records */

// Rows shown before "Show all", so a year of records doesn't bury the
// cards below.
const FIRST = 8;

/**
 * @param {Records} records
 * @param {string} rangeWords e.g. "12 weeks"
 * @param {string} today YYYY-MM-DD
 * @returns {Node[]}
 */
export function recordTimelineCardView(records, rangeWords, today) {
  const heading = h("h2", { class: "label section" }, "Records");
  if (records.length === 0)
    return [
      heading,
      h("p", { class: "lede" }, `No records in the last ${rangeWords}.`),
    ];
  const rows = records.map((r) =>
    h(
      "a",
      {
        class: "workout-link",
        href: `#/stats/point/${encodeURIComponent(r.workoutId)}`,
      },
      h(
        "span",
        { class: "workout-link-main" },
        h("span", { class: "name" }, `${listDate(r.date, today)} · ${r.name}`),
        h(
          "span",
          { class: "label" },
          [
            setText(r.set, r.type),
            ...r.kinds.map((kind) =>
              kind === "e1rm" && r.e1rm !== undefined
                ? `best e1RM ${whole(r.e1rm)} ${r.set.unit}`
                : recordName(kind, r.set, r.type),
            ),
          ].join(" · "),
        ),
      ),
      h("span", { "aria-hidden": "true" }, "→"),
    ),
  );
  const list = h(
    "nav",
    { class: "menu", "aria-label": "Records" },
    ...rows.slice(0, FIRST),
  );
  const more = h(
    "button",
    { class: "chip", type: "button" },
    `Show all ${rows.length}`,
  );
  more.addEventListener("click", () => {
    list.replaceChildren(...rows);
    more.remove();
  });
  return [
    heading,
    h(
      "p",
      { class: "label card-note" },
      `${countOf(records.length, "set")} beat a record in the last ${rangeWords}`,
    ),
    list,
    ...(rows.length > FIRST ? [more] : []),
  ];
}
