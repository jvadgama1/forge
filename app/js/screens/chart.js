// What every chart shares (#81): hand-drawn inline SVG, since the forms are
// few and the Slab look exacting (spec #80, no charting library). Each chart
// brings its own frame, so a phone card and a wide one can differ. Tip lines
// lead with the value (dataviz: values lead, labels follow).
import { h } from "../dom.js";

const SVG = "http://www.w3.org/2000/svg";

/**
 * A chart's drawing area, in its own coordinates: the whole, and the room
 * kept on each side for axis labels.
 * @typedef {{ width: number, height: number, pad: { top: number, right: number, bottom: number, left: number } }} Frame
 */

/**
 * What a chart's tip line reads out for one mark, and where the mark's
 * workouts open, if it links there (#84).
 * @typedef {{ value: string, label: string, open?: { href: string, words: string } }} Reading
 */

/**
 * An SVG element; h() makes HTML ones.
 * @param {string} tag
 * @param {Record<string, string | number>} [attrs]
 * @param {string} [text]
 */
export function svg(tag, attrs = {}, text) {
  const el = document.createElementNS(SVG, tag);
  for (const [key, value] of Object.entries(attrs))
    el.setAttribute(key, String(value));
  if (text !== undefined) el.textContent = text;
  return el;
}

/**
 * Clean ticks a little outside the data, so a line isn't pinned to the
 * frame: 5% beyond the lowest and highest values, out to a multiple of
 * `step`.
 * @param {number[]} values
 * @param {number} [step]
 */
export function niceRange(values, step = 5) {
  return {
    low: Math.floor((Math.min(...values) * 0.95) / step) * step,
    high: Math.ceil((Math.max(...values) * 1.05) / step) * step,
  };
}

/**
 * A straight-line scale from data to frame coordinates. A domain of one
 * value maps to the middle of the range, so a single mark is centred.
 * @param {[number, number]} domain
 * @param {[number, number]} range
 * @returns {(value: number) => number}
 */
export function linear([d0, d1], [r0, r1]) {
  if (d0 === d1) return () => (r0 + r1) / 2;
  return (value) => r0 + ((value - d0) / (d1 - d0)) * (r1 - r0);
}

/**
 * A chart's root: focusable for arrow keys, an image to a screen reader,
 * described by `label`.
 * @param {Frame} frame
 * @param {string} label
 */
export function chartRoot(frame, label) {
  return svg("svg", {
    viewBox: `0 0 ${frame.width} ${frame.height}`,
    class: "chart",
    role: "img",
    tabindex: 0,
    "aria-label": label,
  });
}

/**
 * A grid line across the frame at each tick, labelled at the left.
 * @param {Frame} frame
 * @param {number[]} ticks
 * @param {(value: number) => number} y
 * @param {(tick: number) => string} [label] how a tick reads
 */
export function grid({ width, pad }, ticks, y, label = String) {
  return ticks.flatMap((tick) => [
    svg("line", {
      x1: pad.left,
      x2: width - pad.right,
      y1: y(tick),
      y2: y(tick),
      class: "chart-grid",
    }),
    svg(
      "text",
      {
        x: pad.left - 6,
        y: y(tick) + 4,
        "text-anchor": "end",
        class: "chart-axis",
      },
      label(tick),
    ),
  ]);
}

/**
 * Makes a chart's marks explorable: the mark nearest a tap or the pointer
 * is chosen and read out below, arrow keys step through them, and focus
 * starts on `start`. A mouse hovers to read, so its click opens the mark
 * (story 51), as Enter does; a tap only reads, and the tip's link opens it
 * (story 49).
 * @param {SVGElement} chart
 * @param {object} marks
 * @param {Frame} marks.frame
 * @param {number} marks.count
 * @param {(x: number, y: number) => number} marks.nearest the mark nearest a
 *   point, in the frame's coordinates
 * @param {(i: number) => void} marks.choose shows a mark as chosen
 * @param {(i: number) => Reading} marks.read
 * @param {Record<string, number>} [marks.steps] how far each arrow key
 *   moves; left and right one mark unless given
 * @param {number} [marks.start] the last mark unless given
 * @returns {HTMLElement} the tip line, to place below the chart
 */
export function explore(
  chart,
  {
    frame,
    count,
    nearest,
    choose,
    read,
    steps = { ArrowLeft: -1, ArrowRight: 1 },
    start = count - 1,
  },
) {
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
  let shown = -1;
  /** @type {string | undefined} the shown mark's link */
  let href;
  /** @param {number} i */
  const show = (i) => {
    shown = Math.max(0, Math.min(count - 1, i));
    choose(shown);
    const reading = read(shown);
    value.textContent = reading.value;
    label.textContent = reading.label;
    href = reading.open?.href;
    open.hidden = !reading.open;
    if (reading.open) {
      open.href = reading.open.href;
      open.textContent = `${reading.open.words} →`;
    }
  };
  /** @param {Event} e */
  const pick = (e) => {
    const { clientX, clientY } = /** @type {PointerEvent} */ (e);
    const box = chart.getBoundingClientRect();
    const scale = frame.width / box.width;
    show(nearest((clientX - box.left) * scale, (clientY - box.top) * scale));
  };
  chart.addEventListener("pointermove", pick);
  chart.addEventListener("pointerdown", pick);
  chart.addEventListener("focus", () => show(shown < 0 ? start : shown));
  chart.addEventListener("keydown", (e) => {
    const { key } = /** @type {KeyboardEvent} */ (e);
    if (key in steps) {
      e.preventDefault();
      show(shown + steps[key]);
    } else if (key === "Enter" && href) location.hash = href;
  });
  chart.addEventListener("click", (e) => {
    if (/** @type {PointerEvent} */ (e).pointerType === "mouse" && href)
      location.hash = href;
  });
  return tip;
}

/**
 * Explores marks along x, as a line chart's: a crosshair over the chosen
 * one. Call it after drawing the marks, so the crosshair sits on top.
 * @param {SVGElement} chart
 * @param {Frame} frame
 * @param {number[]} xs each mark's x, in order
 * @param {(i: number) => Reading} read
 */
export function exploreAlong(chart, frame, xs, read) {
  const { height, pad } = frame;
  const crosshair = svg("line", {
    y1: pad.top - 8,
    y2: height - pad.bottom,
    class: "chart-crosshair",
    visibility: "hidden",
  });
  chart.append(crosshair);
  return explore(chart, {
    frame,
    count: xs.length,
    nearest: (at) => {
      let best = 0;
      for (let i = 1; i < xs.length; i++)
        if (Math.abs(xs[i] - at) < Math.abs(xs[best] - at)) best = i;
      return best;
    },
    choose: (i) => {
      crosshair.setAttribute("x1", String(xs[i]));
      crosshair.setAttribute("x2", String(xs[i]));
      crosshair.setAttribute("visibility", "visible");
    },
    read,
  });
}
