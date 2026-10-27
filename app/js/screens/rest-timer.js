// The rest timer (#12): it starts when a set is logged, counts down on the
// logging screen, can be paused, extended or dismissed, and vibrates when it
// ends. Its state lives here, not in a screen, because logging a set redraws
// the screen; it runs only while the app is open (spec #3).
import { h } from "../dom.js";
import { pad2 } from "./screen.js";

/** Seconds added by one tap on +15 s. */
const EXTEND = 15;

/**
 * The rest in progress: when it ends, or, while paused, how long is left.
 * @type {{ endsAt: number, pausedLeft?: number, vibrated: boolean } | undefined}
 */
let rest;
/** @type {ReturnType<typeof setInterval> | undefined} */
let ticker;

/** Milliseconds of rest left, never below 0. */
function left() {
  if (!rest) return 0;
  return Math.max(0, rest.pausedLeft ?? rest.endsAt - Date.now());
}

/**
 * Starts a rest of `seconds`, replacing any rest in progress.
 * @param {number} seconds
 */
export function startRest(seconds) {
  rest = { endsAt: Date.now() + seconds * 1000, vibrated: false };
  run();
}

/** Ends the rest, if any: its set was undone, or its workout finished. */
export function endRest() {
  rest = undefined;
  clearInterval(ticker);
  redraw();
}

/** Ticks until the rest is over. */
function run() {
  clearInterval(ticker);
  ticker = setInterval(tick, 250);
  redraw();
}

/**
 * Redraws, and at the end vibrates once and stops ticking. Only if the app
 * is in view: the timer runs only while the app is open (spec #3), and a
 * buzz on coming back, long after, would mislead.
 */
function tick() {
  if (!rest) return;
  if (left() === 0 && !rest.vibrated) {
    rest.vibrated = true;
    clearInterval(ticker);
    if (document.visibilityState === "visible")
      navigator.vibrate?.([300, 150, 300]);
  }
  redraw();
}

function pauseOrResume() {
  if (!rest) return;
  if (rest.pausedLeft === undefined) rest.pausedLeft = left();
  else {
    rest.endsAt = Date.now() + rest.pausedLeft;
    delete rest.pausedLeft;
  }
  redraw();
}

function extend() {
  if (!rest) return;
  if (rest.pausedLeft !== undefined) rest.pausedLeft += EXTEND * 1000;
  else rest.endsAt = Math.max(rest.endsAt, Date.now()) + EXTEND * 1000;
  // Extended after it was over: it runs and vibrates again.
  if (rest.vibrated) {
    rest.vibrated = false;
    run();
  } else redraw();
}

/**
 * Updates for every rest bar on screen; a redrawn screen brings a new one.
 * @type {Set<() => boolean>} each returns false once its bar is gone
 */
const bars = new Set();

function redraw() {
  for (const update of bars) if (!update()) bars.delete(update);
}

/**
 * The rest bar for the logging screen, hidden while no rest is in progress.
 * Built once and updated in place, so a tap never lands on a button that a
 * tick has just replaced.
 * @returns {HTMLElement}
 */
export function restBar() {
  const label = h("span", { class: "label" });
  const time = h("span", { class: "rest-time" });
  const pause = h(
    "button",
    { class: "chip", type: "button", onclick: pauseOrResume },
    "Pause",
  );
  const more = h(
    "button",
    {
      class: "chip",
      type: "button",
      "aria-label": "Add 15 seconds",
      onclick: extend,
    },
    "+15 s",
  );
  const bar = h(
    "div",
    { class: "rest", role: "timer" },
    h("div", { class: "rest-head" }, label, time),
    h(
      "div",
      { class: "rest-actions" },
      pause,
      more,
      h(
        "button",
        { class: "chip", type: "button", onclick: endRest },
        "Dismiss",
      ),
    ),
  );

  const update = () => {
    bar.hidden = !rest;
    if (!rest) return bar.isConnected;
    const seconds = Math.ceil(left() / 1000);
    const done = seconds === 0;
    const paused = rest.pausedLeft !== undefined;
    label.textContent = done ? "Rest over" : paused ? "Paused" : "Rest";
    time.textContent = `${Math.floor(seconds / 60)}:${pad2(seconds % 60)}`;
    pause.textContent = paused ? "Resume" : "Pause";
    pause.hidden = done;
    bar.toggleAttribute("data-done", done);
    return bar.isConnected;
  };
  update();
  bars.add(update);
  return bar;
}
