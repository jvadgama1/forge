import { h } from "../dom.js";
import { countOf, screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * The routines, each with its days and version, and a field to add one
 * (#14). Adding a routine opens it, to plan its days.
 * @param {Pick<ScreenContext, "forge">} context
 */
export function routinesView({ forge }) {
  const menu = h("nav", { class: "menu", "aria-label": "Routines" });
  const name = h("input", {
    class: "search",
    type: "text",
    placeholder: "New routine name",
    "aria-label": "New routine name",
    autocomplete: "off",
  });
  const status = h("p", { class: "lede", role: "status" });

  forge.listRoutines().then((routines) => {
    menu.replaceChildren(
      ...routines.map((routine) => {
        const latest = routine.versions.at(-1);
        return h(
          "a",
          { href: `#/routines/${routine.id}` },
          routine.name,
          h(
            "span",
            { class: "menu-end" },
            h(
              "span",
              { class: "label" },
              `${countOf(latest?.days.length ?? 0, "day")} · v${latest?.number ?? 1}`,
            ),
            h("span", { "aria-hidden": "true" }, "→"),
          ),
        );
      }),
    );
    if (!routines.length)
      menu.replaceChildren(
        h(
          "p",
          { class: "lede" },
          "No routines yet. Add one, then plan its days.",
        ),
      );
  });

  return screen(
    "Routines",
    menu,
    h(
      "form",
      {
        class: "add-gym",
        onsubmit: async (e) => {
          e.preventDefault();
          status.textContent = "";
          try {
            const routine = await forge.saveRoutine({
              name: name.value,
              days: [],
            });
            location.hash = `#/routines/${routine.id}`;
          } catch (error) {
            status.textContent = /** @type {Error} */ (error).message;
          }
        },
      },
      name,
      h(
        "button",
        { class: "button", type: "submit" },
        "Add routine",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    ),
    status,
  );
}
