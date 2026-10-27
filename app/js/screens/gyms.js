import { h } from "../dom.js";
import { exerciseCount } from "./exercise-list.js";
import { screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * The gyms, each with its exercise count, and a field to add one (#10).
 * Adding a gym opens its page, to tick what it has.
 * @param {Pick<ScreenContext, "forge">} context
 */
export function gymsView({ forge }) {
  const menu = h("nav", { class: "menu", "aria-label": "Gyms" });
  const name = h("input", {
    class: "search",
    type: "text",
    placeholder: "New gym name",
    "aria-label": "New gym name",
    autocomplete: "off",
  });
  const status = h("p", { class: "lede", role: "status" });

  forge.listGyms().then((gyms) => {
    menu.replaceChildren(
      ...gyms.map((gym) =>
        h(
          "a",
          { href: `#/gyms/${gym.id}` },
          gym.name,
          h(
            "span",
            { class: "menu-end" },
            h(
              "span",
              { class: "label" },
              exerciseCount(gym.exerciseIds.length),
            ),
            h("span", { "aria-hidden": "true" }, "→"),
          ),
        ),
      ),
    );
    if (!gyms.length)
      menu.replaceChildren(
        h(
          "p",
          { class: "lede" },
          "No gyms yet. Add one, then tick the exercises it has.",
        ),
      );
  });

  return screen(
    "Gyms",
    menu,
    h(
      "form",
      {
        class: "add-form",
        onsubmit: async (e) => {
          e.preventDefault();
          status.textContent = "";
          try {
            const gym = await forge.createGym(name.value);
            location.hash = `#/gyms/${gym.id}`;
          } catch (error) {
            status.textContent = /** @type {Error} */ (error).message;
          }
        },
      },
      name,
      h(
        "button",
        { class: "button", type: "submit" },
        "Add gym",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    ),
    status,
  );
}
