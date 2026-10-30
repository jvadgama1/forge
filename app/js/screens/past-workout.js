import { h } from "../dom.js";
import { fieldsFor, readFields } from "./measure.js";
import { endRest } from "./rest-timer.js";
import {
  countOf,
  listDate,
  screen,
  twoTapButton,
  typedNumber,
} from "./screen.js";
import { setChoices, setRow } from "./workout.js";

/** @import { ExerciseType, SetRef, WorkoutSet } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * One workout (#20; spec #3, stories 53-54): its exercises and sets, any of
 * which can be corrected or deleted, and the whole workout deleted.
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function pastWorkoutView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const workout = id === undefined ? undefined : await forge.getWorkout(id);
    if (!workout) {
      root.replaceChildren(
        screen(
          "Workout not found",
          h("p", { class: "lede" }, "It may have been deleted."),
          h(
            "a",
            { class: "button", href: "#/workouts" },
            "Workouts",
            h("span", { "aria-hidden": "true" }, "→"),
          ),
        ),
      );
      return;
    }
    const workoutId = workout.id;
    const inProgress = !workout.finishedAt;
    // A change to the workout in progress ends its rest, as undo does (#12).
    const changed = () => {
      if (inProgress) endRest();
    };
    const [title, gym] = await Promise.all([
      forge.workoutTitle(workout),
      forge.getGym(workout.gymId),
    ]);
    const { exercises, sets, minutes } = forge.summarize(workout);
    const blocks = await Promise.all(
      forge.exercisesDone(workout).map(async (entry) => {
        const exercise = await forge.getExercise(entry.exerciseId);
        const name = exercise?.name ?? entry.exerciseId;
        const type = exercise?.type ?? "weight-reps";
        return h(
          "section",
          { class: "past-exercise" },
          h("h2", { class: "past-exercise-name" }, name),
          h(
            "ol",
            { class: "sets", "aria-label": `${name} sets` },
            ...entry.sets.map((set, index) =>
              editableSet(
                { workoutId, exerciseId: entry.exerciseId, index },
                name,
                set,
                type,
              ),
            ),
          ),
        );
      }),
    );
    root.replaceChildren(
      screen(
        title,
        h("a", { class: "chip back", href: "#/workouts" }, "← Workouts"),
        h(
          "p",
          { class: "label" },
          [
            listDate(workout.date, forge.today()),
            gym?.name,
            inProgress ? "In progress" : countOf(minutes, "minute"),
          ]
            .filter(Boolean)
            .join(" · "),
        ),
        h(
          "p",
          { class: "label" },
          `${countOf(exercises, "exercise")}, ${countOf(sets, "set")} · tap a set to correct it`,
        ),
        ...(workout.note ? [h("p", { class: "lede" }, workout.note)] : []),
        ...blocks,
        ...(inProgress
          ? [
              h(
                "a",
                { class: "button", href: "#/log" },
                "Back to logging",
                h("span", { "aria-hidden": "true" }, "→"),
              ),
            ]
          : []),
        twoTapButton({
          className: "button secondary",
          text: "Delete workout",
          again: () => `Tap again to delete ${title} for good`,
          act: async () => {
            await forge.deleteWorkout(workoutId);
            changed();
            location.hash = "#/workouts";
          },
        }),
      ),
    );

    /**
     * A set row that opens a form to correct it on a tap.
     * @param {SetRef} ref
     * @param {string} name the exercise's
     * @param {WorkoutSet} set
     * @param {ExerciseType} type the exercise's
     */
    function editableSet(ref, name, set, type) {
      const row = setRow(set, ref.index, type);
      row.classList.add("set-editable");
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Correct ${name} set ${ref.index + 1}`);
      const open = () => row.replaceWith(setForm(ref, set, type));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open();
      });
      return row;
    }

    /**
     * The form correcting one set: its measure (load and reps, or what the
     * exercise type measures: #19), RIR and set type, with Save, Cancel and
     * a two-tap Delete.
     * @param {SetRef} ref
     * @param {WorkoutSet} set
     * @param {ExerciseType} type the exercise's
     */
    function setForm(ref, set, type) {
      const choices = setChoices(type, set);
      const fields = fieldsFor(type, set.unit, forge.loadStep(ref.exerciseId));
      const inputs = fields.map((field) =>
        h("input", {
          class: `small-number${field.mode === "decimal" ? " wide" : ""}`,
          type: "text",
          inputmode: field.mode,
          "aria-label": field.name,
          value: field.show(set),
        }),
      );
      const status = h("p", { class: "lede", role: "status", hidden: true });
      return h(
        "li",
        { class: "set-form" },
        h(
          "div",
          { class: "set-form-fields" },
          ...fields.flatMap((field, i) => [
            // Time and distance aren't multiplied (#19).
            ...(i
              ? [h("span", { class: "label" }, type === "cardio" ? "·" : "×")]
              : []),
            inputs[i],
            h("span", { class: "label" }, field.label),
          ]),
        ),
        ...choices.nodes,
        h(
          "div",
          { class: "set-form-actions" },
          h(
            "button",
            {
              class: "chip primary",
              type: "button",
              onclick: async () => {
                status.hidden = true;
                try {
                  await forge.editSet(ref, {
                    ...readFields(fields, inputs.map(typedNumber)),
                    ...choices.read(),
                  });
                  show();
                } catch (error) {
                  status.textContent = /** @type {Error} */ (error).message;
                  status.hidden = false;
                }
              },
            },
            "Save",
          ),
          h(
            "button",
            { class: "chip", type: "button", onclick: show },
            "Cancel",
          ),
          twoTapButton({
            className: "chip",
            text: "Delete set",
            again: () => "Tap again to delete",
            act: async () => {
              const left = await forge.deleteSet(ref);
              changed();
              // The workout's last set took the workout with it.
              if (left) show();
              else location.hash = "#/workouts";
            },
          }),
        ),
        status,
      );
    }
  }
}
