import { h } from "../dom.js";
import { endRest } from "./rest-timer.js";
import {
  countOf,
  listDate,
  screen,
  twoTapButton,
  typedNumber,
} from "./screen.js";
import { setChoices, setRow } from "./workout.js";

/** @import { SetRef, WorkoutSet } from "../core/types.js" */
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
        const name =
          (await forge.getExercise(entry.exerciseId))?.name ?? entry.exerciseId;
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
     */
    function editableSet(ref, name, set) {
      const row = setRow(set, ref.index);
      row.classList.add("set-editable");
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Correct ${name} set ${ref.index + 1}`);
      const open = () => row.replaceWith(setForm(ref, set));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open();
      });
      return row;
    }

    /**
     * The form correcting one set: load, reps, RIR and set type, with Save,
     * Cancel and a two-tap Delete.
     * @param {SetRef} ref
     * @param {WorkoutSet} set
     */
    function setForm(ref, set) {
      const choices = setChoices(set);
      const load = h("input", {
        class: "small-number wide",
        type: "text",
        inputmode: "decimal",
        "aria-label": `Load in ${set.unit}`,
        value: String(set.load),
      });
      const reps = h("input", {
        class: "small-number",
        type: "text",
        inputmode: "numeric",
        "aria-label": "Reps",
        value: String(set.reps),
      });
      const status = h("p", { class: "lede", role: "status", hidden: true });
      return h(
        "li",
        { class: "set-form" },
        h(
          "div",
          { class: "set-form-fields" },
          h("span", { class: "label" }, set.unit),
          load,
          h("span", { class: "label" }, "×"),
          reps,
          h("span", { class: "label" }, "reps"),
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
                    load: typedNumber(load),
                    reps: typedNumber(reps),
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
