// Exercise-list pieces shared by the Exercises picker and a gym's page.
import { MUSCLE_GROUPS, muscleGroup } from "../core/muscle-groups.js";
import { h } from "../dom.js";
import { countOf } from "./screen.js";

/** @import { Exercise, ExerciseFilter, ExerciseType } from "../core/types.js" */

/** @param {number} n */
export const exerciseCount = (n) => countOf(n, "exercise");

/** @type {Record<ExerciseType, string>} */
const TYPE_LABELS = {
  "weight-reps": "Weight × reps",
  "bodyweight-reps": "Bodyweight",
  assisted: "Assisted",
  timed: "Timed",
  cardio: "Cardio",
};

/**
 * An exercise's name and muscle groups. The region swatch always sits beside
 * the region's name, so colour is never the only signal.
 * @param {Exercise} e
 */
export function exerciseSummary(e) {
  const main = muscleGroup(e.primary[0]);
  const others = [...e.primary.slice(1), ...e.secondary].map(
    (id) => muscleGroup(id).label,
  );
  return [
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
  ];
}

/**
 * A row of chips where one is pressed. With `clearable`, tapping the pressed
 * chip unpresses it and chooses nothing (`undefined`).
 * @template {string | number | undefined} T
 * @param {{ label: string, options: { value: T, text: string }[], selected: T | undefined, onChoose: (value: T | undefined) => void, clearable?: boolean }} chips
 */
export function choiceChips({
  label,
  options,
  selected,
  onChoose,
  clearable = false,
}) {
  let current = selected;
  const group = h("div", {
    class: "chips",
    role: "group",
    "aria-label": label,
  });
  for (const { value, text } of options)
    group.append(
      h(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-pressed": String(value === selected),
          onclick: (e) => {
            current = clearable && current === value ? undefined : value;
            for (const c of group.children)
              c.setAttribute(
                "aria-pressed",
                String(c === e.currentTarget && current !== undefined),
              );
            onChoose(current);
          },
        },
        text,
      ),
    );
  return group;
}

/**
 * The search box and muscle-group chips. Changes `filter` in place, then
 * calls `onChange`.
 * @param {ExerciseFilter} filter
 * @param {() => void} onChange
 */
export function exerciseFilter(filter, onChange) {
  return [
    h("input", {
      class: "search",
      type: "search",
      placeholder: "Search exercises",
      "aria-label": "Search exercises",
      oninput: (e) => {
        filter.query = /** @type {HTMLInputElement} */ (e.target).value;
        onChange();
      },
    }),
    choiceChips({
      label: "Filter by muscle group",
      options: [
        { value: undefined, text: "All" },
        ...MUSCLE_GROUPS.map((m) => ({ value: m.id, text: m.label })),
      ],
      selected: filter.muscleGroup,
      onChoose: (id) => {
        filter.muscleGroup = id;
        onChange();
      },
    }),
  ];
}
