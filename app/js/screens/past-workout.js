import { h } from "../dom.js";
import { choiceChips } from "./exercise-list.js";
import {
  countOf,
  listDate,
  screen,
  twoTapButton,
  typedNumber,
} from "./screen.js";
import { setRow } from "./workout.js";

/** @import { WorkoutSet } from "../core/types.js" */
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
    const [title, gym] = await Promise.all([
      forge.workoutTitle(workout),
      forge.getGym(workout.gymId),
    ]);
    const { exercises, sets, minutes } = forge.summarize(workout);
    const blocks = await Promise.all(
      workout.entries
        .filter((e) => e.sets.length > 0)
        .map(async (entry) => {
          const name =
            (await forge.getExercise(entry.exerciseId))?.name ??
            entry.exerciseId;
          return h(
            "section",
            { class: "history-workout" },
            h("h2", { class: "history-date" }, name),
            h(
              "ol",
              { class: "sets", "aria-label": `${name} sets` },
              ...entry.sets.map((set, i) =>
                editableSet(entry.exerciseId, name, set, i),
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
            workout.finishedAt
              ? `${countOf(minutes, "minute")}`
              : "In progress",
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
        ...(workout.finishedAt
          ? []
          : [
              h(
                "a",
                { class: "button", href: "#/log" },
                "Back to logging",
                h("span", { "aria-hidden": "true" }, "→"),
              ),
            ]),
        twoTapButton({
          className: "button secondary",
          text: "Delete workout",
          again: () => `Tap again to delete ${title} for good`,
          act: async () => {
            await forge.deleteWorkout(workoutId);
            location.hash = "#/workouts";
          },
        }),
      ),
    );

    /**
     * A set row that opens a form to correct it on a tap.
     * @param {string} exerciseId
     * @param {string} name
     * @param {WorkoutSet} set
     * @param {number} index
     */
    function editableSet(exerciseId, name, set, index) {
      const row = setRow(set, index);
      row.classList.add("set-editable");
      row.setAttribute("role", "button");
      row.setAttribute("tabindex", "0");
      row.setAttribute("aria-label", `Correct ${name} set ${index + 1}`);
      const open = () => row.replaceWith(setForm(exerciseId, set, index));
      row.addEventListener("click", open);
      row.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") open();
      });
      return row;
    }

    /**
     * The form correcting one set: load, reps, RIR and set type, with Save,
     * Cancel and a two-tap Delete.
     * @param {string} exerciseId
     * @param {WorkoutSet} set
     * @param {number} index
     */
    function setForm(exerciseId, set, index) {
      /** @type {{ rir: number | undefined, flag: "warmUp" | "drop" | undefined }} */
      const choice = {
        rir: set.rir,
        flag: set.warmUp ? "warmUp" : set.drop ? "drop" : undefined,
      };
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
          { class: "slot-targets" },
          h("span", { class: "label" }, set.unit),
          load,
          h("span", { class: "label" }, "×"),
          reps,
          h("span", { class: "label" }, "reps"),
        ),
        h(
          "div",
          { class: "rir" },
          h("span", { class: "label" }, "RIR"),
          choiceChips({
            label: "RIR, optional",
            options: [0, 1, 2, 3, 4].map((value) => ({
              value,
              text: value === 4 ? "4+" : String(value),
            })),
            selected: set.rir,
            clearable: true,
            onChoose: (value) => {
              choice.rir = value;
            },
          }),
        ),
        choiceChips({
          label: "Set type",
          options: [
            { value: /** @type {const} */ ("warmUp"), text: "Warm-up" },
            { value: /** @type {const} */ ("drop"), text: "Drop set" },
          ],
          selected: choice.flag,
          clearable: true,
          onChoose: (value) => {
            choice.flag = value;
          },
        }),
        h(
          "div",
          { class: "weight-actions" },
          h(
            "button",
            {
              class: "chip",
              type: "button",
              onclick: async () => {
                status.hidden = true;
                try {
                  await forge.editSet(workoutId, exerciseId, index, {
                    load: typedNumber(load),
                    reps: typedNumber(reps),
                    rir: choice.rir,
                    warmUp: choice.flag === "warmUp",
                    drop: choice.flag === "drop",
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
              await forge.deleteSet(workoutId, exerciseId, index);
              show();
            },
          }),
        ),
        status,
      );
    }
  }
}
