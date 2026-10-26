import { h } from "../dom.js";
import { screen } from "./screen.js";

export function logView() {
  return screen(
    "No workouts yet",
    h(
      "p",
      { class: "lede" },
      "Workout logging lands with the next tickets. Meanwhile, browse your exercises.",
    ),
    h(
      "a",
      { class: "button", href: "#/exercises" },
      "Exercises",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
  );
}
