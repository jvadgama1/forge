import { h } from "../dom.js";
import { accountId, screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/** @param {Pick<ScreenContext, "user" | "signOut">} context */
export function moreView({ user, signOut }) {
  return screen(
    "More",
    h(
      "nav",
      { class: "menu" },
      h(
        "a",
        { href: "#/gyms" },
        "Gyms",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      h(
        "a",
        { href: "#/exercises" },
        "Exercises",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    ),
    h("h2", { class: "label section" }, "Account"),
    h("p", { class: "account" }, user.email ?? "Signed in"),
    ...accountId(user),
    h(
      "button",
      { class: "button secondary", type: "button", onclick: () => signOut() },
      "Sign out",
    ),
  );
}
