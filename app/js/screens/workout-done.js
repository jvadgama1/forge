import { h } from "../dom.js";
import { screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

const doneButton = () =>
  h(
    "a",
    { class: "button", href: "#/log" },
    "Done",
    h("span", { "aria-hidden": "true" }, "→"),
  );

/**
 * After finishing (#11): the summary, or word that nothing was saved
 * (/log/done with no id).
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function workoutDoneView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const workout = id === undefined ? undefined : await forge.getWorkout(id);
    if (!workout) {
      root.replaceChildren(
        screen(
          "Nothing saved",
          h(
            "p",
            { class: "lede" },
            "No sets were logged, so the workout was discarded.",
          ),
          doneButton(),
        ),
      );
      return;
    }
    const { exercises, sets, minutes } = forge.summarize(workout);
    /** @param {number} value @param {string} one @param {string} many */
    const stat = (value, one, many) =>
      h(
        "div",
        { class: "stat" },
        h("span", { class: "stat-value" }, String(value)),
        h("span", { class: "label" }, value === 1 ? one : many),
      );
    root.replaceChildren(
      screen(
        "Workout done",
        h(
          "div",
          { class: "stats" },
          stat(exercises, "Exercise", "Exercises"),
          stat(sets, "Set", "Sets"),
          stat(minutes, "Minute", "Minutes"),
        ),
        ...(workout.note ? [h("p", { class: "lede" }, workout.note)] : []),
        doneButton(),
      ),
    );
  }
}
