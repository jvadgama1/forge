import { MUSCLE_GROUPS, muscleGroup } from "../core/muscle-groups.js";
import { h } from "../dom.js";
import { screen } from "./screen.js";

/** @import { Exercise, ExerciseType, MuscleGroup } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/** @type {Record<ExerciseType, string>} */
const TYPE_LABELS = {
  "weight-reps": "Weight × reps",
  "bodyweight-reps": "Bodyweight",
  assisted: "Assisted",
  timed: "Timed",
  cardio: "Cardio",
};

/**
 * One library row. The region swatch always sits beside the region's name,
 * so colour is never the only signal.
 * @param {Exercise} e
 */
function exerciseRow(e) {
  const main = muscleGroup(e.primary[0]);
  const others = [...e.primary.slice(1), ...e.secondary].map(
    (id) => muscleGroup(id).label,
  );
  return h(
    "li",
    {},
    h(
      "div",
      { class: "row-main" },
      h("span", { class: "name" }, e.name),
      h(
        "span",
        { class: "tag", "data-region": main.region },
        `${main.region} · ${main.label}`,
      ),
    ),
    h(
      "p",
      { class: "meta" },
      [...others, TYPE_LABELS[e.type]].filter(Boolean).join(" · "),
    ),
  );
}

/** @param {Pick<ScreenContext, "forge">} context */
export function libraryView({ forge }) {
  /** @type {{ query: string, muscleGroup: MuscleGroup | undefined }} */
  const state = { query: "", muscleGroup: undefined };
  const list = h("ul", { class: "list" });
  const count = h("p", { class: "label count", "aria-live": "polite" });

  async function refresh() {
    const results = await forge.searchExercises(state);
    count.textContent = `${results.length} exercise${results.length === 1 ? "" : "s"}`;
    list.replaceChildren(...results.map(exerciseRow));
  }

  /** @param {MuscleGroup | undefined} id @param {string} label */
  const chip = (id, label) =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        "aria-pressed": String(state.muscleGroup === id),
        onclick: (e) => {
          state.muscleGroup = id;
          for (const c of chips.children)
            c.setAttribute("aria-pressed", String(c === e.currentTarget));
          refresh();
        },
      },
      label,
    );
  const chips = h(
    "div",
    { class: "chips", role: "group", "aria-label": "Filter by muscle group" },
    chip(undefined, "All"),
    ...MUSCLE_GROUPS.map((m) => chip(m.id, m.label)),
  );

  const search = h("input", {
    class: "search",
    type: "search",
    placeholder: "Search exercises",
    "aria-label": "Search exercises",
    oninput: (e) => {
      state.query = /** @type {HTMLInputElement} */ (e.target).value;
      refresh();
    },
  });

  refresh();
  return screen("Exercises", search, chips, count, list);
}
