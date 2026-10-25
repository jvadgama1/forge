import { h } from "../dom.js";
import { screen } from "./screen.js";

/**
 * A screen whose feature arrives in a later phase.
 * @param {string} title
 * @param {string} text
 */
export function placeholderView(title, text) {
  return screen(title, h("p", { class: "lede" }, text));
}
