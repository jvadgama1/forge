// One exercise's page (#21): its settings (unit, increment, rest default,
// pinned note) and, for a custom exercise, its name, muscle groups and body
// half. /exercises/new makes a custom exercise.
import { MUSCLE_GROUPS } from "../core/muscle-groups.js";
import { TYPE_RULES } from "../core/exercise-types.js";
import { h } from "../dom.js";
import {
  TYPE_LABELS,
  choiceChips,
  exerciseSummary,
  toggleChips,
} from "./exercise-list.js";
import { screen, typedNumber } from "./screen.js";

/** @import { Exercise, ExerciseSettings, ExerciseType } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/** Rest defaults offered as chips; any other saved value is offered too. */
const RESTS = [60, 90, 120, 180, 300];

/** @param {number | "off"} rest as "Off", "90 s", "2 min" */
const restText = (rest) =>
  rest === "off" ? "Off" : rest < 120 ? `${rest} s` : `${rest / 60} min`;

/**
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function exerciseView({ forge, id }) {
  const root = h("div", { class: "exercise-page" });
  show();
  return root;

  async function show() {
    const isNew = id === "new";
    const exercise =
      isNew || id === undefined ? undefined : await forge.getExercise(id);
    if (!isNew && !exercise) {
      root.replaceChildren(
        screen(
          "Exercise not found",
          h("a", { class: "chip back", href: "#/exercises" }, "← Exercises"),
        ),
      );
      return;
    }
    const editable = isNew || !!exercise?.custom;
    /** @type {ExerciseSettings} */
    const settings = await forge.exerciseSettings(exercise?.id);

    // The custom exercise's details as chosen so far, in Sets for the chips.
    const chosenDetails = {
      type: /** @type {ExerciseType} */ (exercise?.type ?? "weight-reps"),
      body: exercise?.body ?? "upper",
      primary: new Set(exercise?.primary ?? []),
      secondary: new Set(exercise?.secondary ?? []),
    };
    const chosen = { unit: settings.unit, rest: settings.rest };

    const name = h("input", {
      class: "search",
      type: "text",
      placeholder: "Name",
      "aria-label": "Name",
      value: exercise?.name ?? "",
    });
    const increment = h("input", {
      class: "search",
      type: "text",
      inputmode: "decimal",
      "aria-label": "Increment",
      value: String(settings.increment),
    });
    // The increment follows the unit and body half while it's the default.
    const followDefault = (/** @type {() => void} */ change) => {
      const wasDefault =
        typedNumber(increment) ===
        forge.defaultIncrement(chosenDetails.body, chosen.unit);
      change();
      if (wasDefault)
        increment.value = String(
          forge.defaultIncrement(chosenDetails.body, chosen.unit),
        );
    };
    const note = h("textarea", {
      class: "search note-field",
      rows: "2",
      placeholder: "Seat height, grip…",
      "aria-label": "Pinned note",
    });
    note.value = settings.note ?? "";
    const status = h("p", { class: "lede", role: "status", hidden: true });

    /** @param {ExerciseType} type */
    const isCardio = (type) => TYPE_RULES[type].measure === "time-distance";
    const muscleOptions = MUSCLE_GROUPS.map((m) => ({
      value: m.id,
      text: m.label,
    }));
    const rests = [
      "off",
      ...new Set([
        ...RESTS,
        ...(settings.rest === "off" ? [] : [settings.rest]),
      ]),
    ].sort((a, b) => (a === "off" ? -1 : b === "off" ? 1 : +a - +b));

    const units = choiceChips({
      label: "Unit",
      options: [
        { value: /** @type {const} */ ("lb"), text: "lb" },
        { value: /** @type {const} */ ("kg"), text: "kg" },
      ],
      selected: chosen.unit,
      onChoose: (unit) => {
        if (unit) followDefault(() => (chosen.unit = unit));
      },
    });
    const incrementBlock = h(
      "div",
      {},
      h("p", { class: "label field" }, "Increment"),
      increment,
    );
    // Cardio's unit is its distance's, and it has no load to step (#19).
    const showUnits = () => {
      const cardio = isCardio(chosenDetails.type);
      const [lb, kg] = units.children;
      lb.textContent = cardio ? "mi" : "lb";
      kg.textContent = cardio ? "km" : "kg";
      incrementBlock.hidden = cardio;
    };
    showUnits();

    const details = editable
      ? [
          h("p", { class: "label field" }, "Name"),
          name,
          ...(!isNew && exercise
            ? [
                h("p", { class: "label field" }, "Type"),
                // Its sets are measured by it (#19), so it can't change.
                h(
                  "p",
                  { class: "meta" },
                  `${TYPE_LABELS[exercise.type]} · fixed once made`,
                ),
              ]
            : []),
          ...(isNew
            ? [
                h("p", { class: "label field" }, "Type"),
                choiceChips({
                  label: "Type",
                  options: /** @type {ExerciseType[]} */ (
                    Object.keys(TYPE_LABELS)
                  ).map((t) => ({ value: t, text: TYPE_LABELS[t] })),
                  selected: chosenDetails.type,
                  onChoose: (t) => {
                    if (!t) return;
                    chosenDetails.type = t;
                    showUnits();
                  },
                }),
              ]
            : []),
          h("p", { class: "label field" }, "Primary muscle groups"),
          toggleChips({
            label: "Primary muscle groups",
            options: muscleOptions,
            selected: chosenDetails.primary,
          }),
          h("p", { class: "label field" }, "Secondary muscle groups"),
          toggleChips({
            label: "Secondary muscle groups",
            options: muscleOptions,
            selected: chosenDetails.secondary,
          }),
          h("p", { class: "label field" }, "Body"),
          choiceChips({
            label: "Body",
            options: [
              { value: /** @type {const} */ ("upper"), text: "Upper" },
              { value: /** @type {const} */ ("lower"), text: "Lower" },
            ],
            selected: chosenDetails.body,
            onChoose: (body) => {
              if (body) followDefault(() => (chosenDetails.body = body));
            },
          }),
        ]
      : exercise
        ? [
            h(
              "div",
              { class: "exercise-summary" },
              ...exerciseSummary(exercise),
            ),
          ]
        : [];

    root.replaceChildren(
      screen(
        isNew ? "New exercise" : (exercise?.name ?? ""),
        h("a", { class: "chip back", href: "#/exercises" }, "← Exercises"),
        ...details,
        h("h2", { class: "label section" }, "Settings"),
        h("p", { class: "label field" }, "Unit"),
        units,
        incrementBlock,
        h("p", { class: "label field" }, "Rest"),
        choiceChips({
          label: "Rest",
          options: rests.map((r) => ({
            value: /** @type {number | "off"} */ (r),
            text: restText(/** @type {number | "off"} */ (r)),
          })),
          selected: chosen.rest,
          onChoose: (rest) => {
            if (rest !== undefined) chosen.rest = rest;
          },
        }),
        h("p", { class: "label field" }, "Pinned note"),
        note,
        h(
          "button",
          {
            class: "button",
            type: "button",
            onclick: async () => {
              status.hidden = true;
              try {
                const saved = editable
                  ? await forge.saveCustomExercise({
                      ...(exercise ? { id: exercise.id } : {}),
                      name: name.value,
                      type: chosenDetails.type,
                      body: chosenDetails.body,
                      primary: [...chosenDetails.primary],
                      secondary: [...chosenDetails.secondary],
                    })
                  : /** @type {Exercise} */ (exercise);
                await forge.saveExerciseSettings(saved.id, {
                  unit: chosen.unit,
                  ...(isCardio(chosenDetails.type)
                    ? {}
                    : { increment: typedNumber(increment) }),
                  rest: chosen.rest,
                  note: note.value,
                });
                location.hash = "#/exercises";
              } catch (error) {
                status.textContent = /** @type {Error} */ (error).message;
                status.hidden = false;
              }
            },
          },
          "Save",
          h("span", { "aria-hidden": "true" }, "→"),
        ),
        status,
      ),
    );
  }
}
