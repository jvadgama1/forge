import { h } from "../dom.js";
import { countOf, monthDay, screen } from "./screen.js";

/** @import { RoutineVersion } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * A routine version as the routine screens name it: "Version 2 · saved Oct 14".
 * @param {RoutineVersion} version
 */
export const versionText = (version) =>
  `Version ${version.number} · saved ${monthDay(version.savedAt.slice(0, 10))}`;

/**
 * The routines, each with its days and version, and a field to add one
 * (#14). Adding a routine opens it, to add its days.
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
        const latest = forge.currentVersion(routine);
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
              [
                countOf(latest?.days.length ?? 0, "day"),
                latest ? `version ${latest.number}` : "",
              ]
                .filter(Boolean)
                .join(" · "),
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
          "No routines yet. Add one, then add its days.",
        ),
      );
  });

  return screen(
    "Routines",
    menu,
    h(
      "form",
      {
        class: "add-form",
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
