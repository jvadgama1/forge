// The Stats board's calendar card (#86; spec #80, stories 31–35): a square
// per day in Monday-to-Sunday columns, as the Slab progress board, shaded
// on the validated heat-map ramp by the day's hard sets. The legend gives
// each shade's numbers and a day's reading gives its own, so the shade is
// never the only signal. A break is plain empty weeks.
import { h } from "../dom.js";
import { chartRoot, svg } from "./chart.js";
import { countOf, monthDay } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @import { Frame } from "./chart.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["calendar"]} Calendar */
/** @typedef {Calendar["days"][number]} Day */

/** @type {Frame} */
const FRAME = {
  width: 358,
  height: 0,
  pad: { top: 0, right: 0, bottom: 0, left: 0 },
};

// Each level's hard sets a day, for the legend (spec #80, Rules: Calendar
// levels).
const LEGEND = ["Rest", "1–9", "10–19", "20–29", "30+"];

/**
 * Where a day opens: its workout, or the list of its workouts (#84).
 * @param {Day} day
 */
const dayHref = (day) =>
  day.workoutIds.length === 1
    ? `#/stats/point/${encodeURIComponent(day.workoutIds[0])}`
    : `#/stats/day:${day.date}`;

/**
 * A day's reading, value first.
 * @param {Day} day
 * @returns {[string, string]}
 */
function reading(day) {
  if (day.future) return [monthDay(day.date), " · to come"];
  if (day.workoutIds.length === 0) return [monthDay(day.date), " · rest day"];
  return [
    `${countOf(day.hardSets, "hard set")}`,
    ` · ${monthDay(day.date)} · ${countOf(day.workoutIds.length, "workout")}`,
  ];
}

/**
 * @param {Calendar} calendar
 * @param {number} weeks the range's
 * @returns {Node[]}
 */
export function calendarCardView({ workouts, days }, weeks) {
  const heading = h(
    "h2",
    { class: "label section card-head" },
    h("span", {}, countOf(workouts, "workout")),
    h("span", {}, countOf(weeks, "week")),
  );
  if (workouts === 0)
    return [
      heading,
      h(
        "p",
        { class: "lede" },
        `No workouts in the last ${countOf(weeks, "week")}.`,
      ),
    ];
  const columns = days.length / 7;
  const step = FRAME.width / columns;
  // A year's 52 columns get a hairline gap; fewer get room to breathe.
  const gap = columns > 20 ? 1 : 3;
  const cellWidth = step - gap;
  const cellHeight = Math.min(cellWidth, 12);
  const rowStep = cellHeight + gap;
  const frame = { ...FRAME, height: rowStep * 7 - gap };
  /** @param {number} i */
  const x = (i) => Math.floor(i / 7) * step;
  /** @param {number} i */
  const y = (i) => (i % 7) * rowStep;

  const trainedDays = days.filter((d) => d.workoutIds.length > 0).length;
  const chart = chartRoot(
    frame,
    `Training days over ${countOf(weeks, "week")}: ${countOf(workouts, "workout")} on ${countOf(trainedDays, "day")}.`,
  );
  chart.classList.add("calendar");
  days.forEach((day, i) => {
    if (!day.future)
      chart.append(
        svg("rect", {
          x: x(i),
          y: y(i),
          width: cellWidth,
          height: cellHeight,
          class: "calendar-day",
          "data-level": day.level,
        }),
      );
  });
  const ring = svg("rect", {
    width: cellWidth + 2,
    height: cellHeight + 2,
    class: "calendar-ring",
    visibility: "hidden",
  });
  chart.append(ring);

  const value = h("strong", {});
  const label = h("span", { class: "label" });
  const open = h("a", { class: "chart-open" });
  open.hidden = true;
  const tip = h(
    "p",
    { class: "chart-tip", "aria-live": "polite" },
    value,
    label,
    open,
  );
  // Days run in date order, those to come last: today is the last past one.
  const todayIndex = Math.max(0, days.filter((d) => !d.future).length - 1);
  let shown = -1;
  /** @param {number} i */
  const show = (i) => {
    shown = Math.max(0, Math.min(days.length - 1, i));
    const day = days[shown];
    ring.setAttribute("x", String(x(shown) - 1));
    ring.setAttribute("y", String(y(shown) - 1));
    ring.setAttribute("visibility", "visible");
    [value.textContent, label.textContent] = reading(day);
    open.hidden = day.workoutIds.length === 0;
    if (!open.hidden) {
      open.href = dayHref(day);
      open.textContent =
        day.workoutIds.length === 1 ? "Open workout →" : "Open workouts →";
    }
  };
  /** @param {Event} e */
  const nearest = (e) => {
    const { clientX, clientY } = /** @type {PointerEvent} */ (e);
    const box = chart.getBoundingClientRect();
    const scale = frame.width / box.width;
    const column = Math.floor(((clientX - box.left) * scale) / step);
    const row = Math.floor(((clientY - box.top) * scale) / rowStep);
    show(
      Math.min(columns - 1, Math.max(0, column)) * 7 +
        Math.min(6, Math.max(0, row)),
    );
  };
  /** Opens the shown day, if it has workouts. */
  const go = () => {
    const day = days[shown];
    if (day?.workoutIds.length) location.hash = dayHref(day);
  };
  chart.addEventListener("pointermove", nearest);
  chart.addEventListener("pointerdown", nearest);
  chart.addEventListener("focus", () => show(shown < 0 ? todayIndex : shown));
  // Left and right step a week, up and down a day.
  chart.addEventListener("keydown", (e) => {
    const key = /** @type {KeyboardEvent} */ (e).key;
    const move = { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 };
    if (key in move) {
      e.preventDefault();
      show(shown + move[/** @type {keyof typeof move} */ (key)]);
    } else if (key === "Enter") go();
  });
  // A mouse hovers to read, so its click opens the day; a tap only reads,
  // and the tip's link opens it (stories 49, 51).
  chart.addEventListener("click", (e) => {
    if (/** @type {PointerEvent} */ (e).pointerType === "mouse") go();
  });

  return [
    heading,
    chart,
    tip,
    h(
      "p",
      { class: "calendar-legend label" },
      h("span", {}, "Hard sets a day"),
      ...LEGEND.map((text, level) =>
        h(
          "span",
          { class: "calendar-key" },
          h("span", { class: "calendar-swatch", "data-level": String(level) }),
          text,
        ),
      ),
    ),
  ];
}
