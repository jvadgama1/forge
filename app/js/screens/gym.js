import { h } from "../dom.js";
import { exerciseFilter, exerciseSummary } from "./exercise-list.js";
import { screen } from "./screen.js";

/** @import { ExerciseFilter } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * One gym: rename it, tick the exercises it has, or delete it (#10).
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function gymView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const gym = id === undefined ? undefined : await forge.getGym(id);
    if (!gym) {
      root.replaceChildren(
        screen(
          "Gym not found",
          h("p", { class: "lede" }, "It may have been deleted."),
          h(
            "a",
            { class: "button", href: "#/gyms" },
            "Gyms",
            h("span", { "aria-hidden": "true" }, "→"),
          ),
        ),
      );
      return;
    }
    const gymId = gym.id;
    let savedName = gym.name;
    const ticked = new Set(gym.exerciseIds);
    const total = (await forge.searchExercises({})).length;
    /** @type {ExerciseFilter} */
    const filter = {};

    const name = h("input", {
      class: "search",
      type: "text",
      value: gym.name,
      "aria-label": "Gym name",
      autocomplete: "off",
    });
    const status = h("p", { class: "lede", role: "status" });
    const count = h("p", { class: "label count", "aria-live": "polite" });
    const list = h("ul", { class: "list" });
    const showCount = () => {
      count.textContent = `${ticked.size} of ${total} exercises here`;
    };

    async function refresh() {
      const exercises = await forge.searchExercises(filter);
      list.replaceChildren(
        ...exercises.map((e) =>
          h(
            "li",
            {},
            h(
              "label",
              { class: "tick" },
              h("input", {
                type: "checkbox",
                checked: ticked.has(e.id),
                onchange: async (event) => {
                  const on = /** @type {HTMLInputElement} */ (event.target)
                    .checked;
                  if (on) ticked.add(e.id);
                  else ticked.delete(e.id);
                  showCount();
                  await forge.setExerciseAtGym(gymId, e.id, on);
                },
              }),
              h("span", { class: "tick-body" }, ...exerciseSummary(e)),
            ),
          ),
        ),
      );
    }

    let armed = false;
    const remove = h(
      "button",
      {
        class: "button secondary",
        type: "button",
        onclick: async () => {
          if (!armed) {
            armed = true;
            remove.textContent = `Tap again to delete ${savedName}`;
            return;
          }
          await forge.deleteGym(gymId);
          location.hash = "#/gyms";
        },
      },
      "Delete gym",
    );

    const page = screen(
      gym.name,
      h("p", { class: "label field" }, "Name"),
      h(
        "form",
        {
          class: "inline",
          onsubmit: async (e) => {
            e.preventDefault();
            status.textContent = "";
            try {
              savedName = (await forge.renameGym(gymId, name.value)).name;
              const title = page.querySelector(".title");
              if (title) title.textContent = savedName;
              status.textContent = "Saved";
            } catch (error) {
              status.textContent = /** @type {Error} */ (error).message;
            }
          },
        },
        name,
        h("button", { class: "chip", type: "submit" }, "Save"),
      ),
      status,
      count,
      ...exerciseFilter(filter, refresh),
      list,
      remove,
    );
    showCount();
    refresh();
    root.replaceChildren(page);
  }
}
