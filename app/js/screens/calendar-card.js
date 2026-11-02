// The Stats board's calendar card (#86; spec #80, stories 31–35): a square
// per day in Monday-to-Sunday columns, as the Slab progress board, shaded
// on the validated heat-map ramp by the day's hard sets. The legend gives
// each shade's numbers and a day's reading gives its own, so the shade is
// never the only signal. A break is plain empty weeks.
import { h } from "../dom.js";
import { CALENDAR_LEVELS } from "../core/dashboard.js";
import { chartRoot, explore, heatLegend, svg } from "./chart.js";
import { openMark } from "./mark.js";
import { countOf, monthDay } from "./screen.js";

/** @import { Forge } from "../core/forge.js" */
/** @typedef {Awaited<ReturnType<Forge["dashboard"]>>["calendar"]} Calendar */
/** @typedef {Calendar["days"][number]} Day */

// The phone's width for the grid, and the largest a day's square grows, so
// 4 or 12 weeks stay a calendar rather than a wall.
const WIDTH = 358;
const LARGEST = 22;

// Each shade's hard sets a day, from the core's levels: "1–9", …, "30+".
const LEGEND = [
  "None",
  ...[1, ...CALENDAR_LEVELS].map((least, i, all) =>
    i + 1 < all.length ? `${least}–${all[i + 1] - 1}` : `${least}+`,
  ),
];

/**
 * A day's reading, value first, with its workouts to open.
 * @param {Day} day
 * @returns {import("./chart.js").Reading}
 */
function reading(day) {
  if (day.future) return { value: monthDay(day.date), label: " · to come" };
  if (day.workoutIds.length === 0)
    return { value: monthDay(day.date), label: " · no workout" };
  return {
    value: countOf(day.hardSets, "hard set"),
    label: ` · ${monthDay(day.date)} · ${countOf(day.workoutIds.length, "workout")}`,
    open: openMark(day.workoutIds, { kind: "day", date: day.date }),
  };
}

/**
 * @param {Calendar} calendar
 * @param {number} weeks the range's
 * @returns {Node[]}
 */
export function calendarCardView({ workouts, trainingDays, days }, weeks) {
  const heading = h(
    "h2",
    { class: "label section" },
    `${countOf(workouts, "workout")} · ${countOf(weeks, "week")}`,
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
  const step = Math.min(WIDTH / columns, LARGEST);
  // A year's 52 columns get a hairline gap; fewer get room to breathe.
  const gap = columns > 20 ? 1 : 3;
  const size = step - gap;
  const frame = {
    width: columns * step - gap,
    height: 7 * step - gap,
    pad: { top: 0, right: 0, bottom: 0, left: 0 },
  };
  /** @param {number} i */
  const x = (i) => Math.floor(i / 7) * step;
  /** @param {number} i */
  const y = (i) => (i % 7) * step;

  const chart = chartRoot(
    frame,
    `Training days over ${countOf(weeks, "week")}: ${countOf(workouts, "workout")} on ${countOf(trainingDays, "day")}.`,
  );
  chart.classList.add("calendar");
  // Drawn at its own size, not stretched to the card.
  chart.setAttribute("width", String(frame.width));
  days.forEach((day, i) => {
    if (!day.future)
      chart.append(
        svg("rect", {
          x: x(i),
          y: y(i),
          width: size,
          height: size,
          class: "calendar-day",
          "data-level": day.level,
        }),
      );
  });
  const ring = svg("rect", {
    width: size + 2,
    height: size + 2,
    class: "chart-ring",
    visibility: "hidden",
  });
  chart.append(ring);

  /** @param {number} n @param {number} most */
  const clamp = (n, most) => Math.min(most, Math.max(0, Math.floor(n)));
  const tip = explore(chart, {
    frame,
    count: days.length,
    nearest: (px, py) =>
      clamp(px / step, columns - 1) * 7 + clamp(py / step, 6),
    choose: (i) => {
      ring.setAttribute("x", String(x(i) - 1));
      ring.setAttribute("y", String(y(i) - 1));
      ring.setAttribute("visibility", "visible");
    },
    read: (i) => reading(days[i]),
    // Left and right step a week, up and down a day.
    steps: { ArrowLeft: -7, ArrowRight: 7, ArrowUp: -1, ArrowDown: 1 },
    // Days run in date order, those to come last: today is the last past one.
    start: Math.max(0, days.filter((d) => !d.future).length - 1),
  });

  return [heading, chart, tip, heatLegend("Hard sets a day", LEGEND)];
}
