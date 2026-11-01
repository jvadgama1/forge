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
 * What a chart's tip line reads out for one mark.
 * @typedef {{ value: string, label: string }} Reading
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
 */
export function grid({ width, pad }, ticks, y) {
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
      String(tick),
    ),
  ]);
}

/**
 * Makes a chart's marks explorable: a crosshair over the mark nearest a tap
 * or the pointer, arrow keys to step, and focus starting on the last mark.
 * Call it after drawing the marks, so the crosshair sits on top.
 * @param {SVGElement} chart
 * @param {Frame} frame
 * @param {number[]} xs each mark's x, in order
 * @param {(i: number) => Reading} read
 * @returns {HTMLElement} the tip line, to place below the chart
 */
export function explore(chart, { height, pad, width }, xs, read) {
  const end = xs.length - 1;
  const crosshair = svg("line", {
    y1: pad.top - 8,
    y2: height - pad.bottom,
    class: "chart-crosshair",
    visibility: "hidden",
  });
  chart.append(crosshair);
  const value = h("strong", {});
  const label = h("span", { class: "label" });
  const tip = h(
    "p",
    { class: "chart-tip", "aria-live": "polite" },
    value,
    label,
  );
  let shown = -1;
  /** @param {number} i */
  const show = (i) => {
    shown = Math.max(0, Math.min(end, i));
    crosshair.setAttribute("x1", String(xs[shown]));
    crosshair.setAttribute("x2", String(xs[shown]));
    crosshair.setAttribute("visibility", "visible");
    const reading = read(shown);
    value.textContent = reading.value;
    label.textContent = reading.label;
  };
  /** @param {Event} e */
  const nearest = (e) => {
    const { clientX } = /** @type {PointerEvent} */ (e);
    const box = chart.getBoundingClientRect();
    const at = ((clientX - box.left) / box.width) * width;
    let best = 0;
    for (let i = 1; i <= end; i++)
      if (Math.abs(xs[i] - at) < Math.abs(xs[best] - at)) best = i;
    show(best);
  };
  chart.addEventListener("pointermove", nearest);
  chart.addEventListener("pointerdown", nearest);
  chart.addEventListener("focus", () => show(shown < 0 ? end : shown));
  chart.addEventListener("keydown", (e) => {
    const key = /** @type {KeyboardEvent} */ (e).key;
    if (key === "ArrowLeft") show(shown - 1);
    else if (key === "ArrowRight") show(shown + 1);
  });
  return tip;
}
