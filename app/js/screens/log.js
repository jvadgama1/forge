import { h } from "../dom.js";
import { screen } from "./screen.js";

export function logView() {
  return screen(
    "No workouts yet",
    h(
      "p",
      { class: "lede" },
      "Workout logging lands with the next tickets. Meanwhile, browse the exercise library.",
    ),
    h(
      "a",
      { class: "button", href: "#/library" },
      "Exercise library",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
  );
}
