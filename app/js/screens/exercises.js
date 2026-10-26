import { h } from "../dom.js";
import {
  choiceChips,
  exerciseCount,
  exerciseFilter,
  exerciseSummary,
} from "./exercise-list.js";
import { screen } from "./screen.js";

/** @import { ExerciseFilter, Gym } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * The exercise picker: the current gym's exercises, preselecting the gym
 * used last, with "Show all" for the whole library (#10).
 * @param {Pick<ScreenContext, "forge">} context
 */
export function exercisesView({ forge }) {
  /** @type {ExerciseFilter} */
  const filter = {};
  /** @type {Gym[]} */
  let gyms = [];
  /** @type {Gym | undefined} */
  let gym;
  let showAll = false;

  const gymPicker = h("div", { class: "gym-picker" });
  const list = h("ul", { class: "list" });
  const count = h("p", { class: "label count", "aria-live": "polite" });
  const showAllChip = h(
    "button",
    {
      class: "chip",
      type: "button",
      "aria-pressed": "false",
      hidden: true,
      onclick: () => {
        showAll = !showAll;
        showAllChip.setAttribute("aria-pressed", String(showAll));
        refresh();
      },
    },
    "Show all",
  );

  async function refresh() {
    const results = await forge.pickExercises({
      gymId: gym?.id,
      showAll,
      ...filter,
    });
    const atGym = showAll ? undefined : gym;
    count.textContent = atGym
      ? `${results.length} at ${atGym.name}`
      : exerciseCount(results.length);
    list.replaceChildren(
      ...results.map((e) => h("li", {}, ...exerciseSummary(e))),
    );
    // A gym with nothing ticked yet: point to where its exercises are chosen.
    if (atGym && !results.length && !filter.query && !filter.muscleGroup)
      list.replaceChildren(
        h(
          "p",
          { class: "lede" },
          `No exercises ticked at ${atGym.name} yet. `,
          h("a", { href: `#/gyms/${atGym.id}` }, "Tick them"),
        ),
      );
  }

  async function start() {
    [gyms, gym] = await Promise.all([forge.listGyms(), forge.currentGym()]);
    if (gym) {
      showAllChip.hidden = false;
      gymPicker.replaceChildren(
        h("p", { class: "label field" }, "Gym"),
        choiceChips({
          label: "Gym",
          options: gyms.map((g) => ({ value: g.id, text: g.name })),
          selected: gym.id,
          onChoose: async (id) => {
            gym = gyms.find((g) => g.id === id);
            refresh();
            await forge.chooseGym(id);
          },
        }),
      );
    } else {
      gymPicker.replaceChildren(
        h(
          "p",
          { class: "lede" },
          h("a", { href: "#/gyms" }, "Add your gyms"),
          " to see just the exercises each one has.",
        ),
      );
    }
    refresh();
  }

  start();
  return screen(
    "Exercises",
    gymPicker,
    ...exerciseFilter(filter, refresh),
    h("div", { class: "count-row" }, count, showAllChip),
    list,
  );
}
