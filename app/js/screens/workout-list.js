import { h } from "../dom.js";
import { endRest } from "./rest-timer.js";
import { countOf, screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * The workout's exercises (#11): reorder, skip or bring back, jump to one,
 * add another; the workout's note; and finishing.
 * @param {Pick<ScreenContext, "forge">} context
 */
export function workoutListView({ forge }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const workout = await forge.currentWorkout();
    if (!workout) {
      location.hash = "#/log";
      return;
    }
    const id = workout.id;
    const names = await Promise.all(
      workout.entries.map(
        async (e) =>
          (await forge.getExercise(e.exerciseId))?.name ?? e.exerciseId,
      ),
    );

    /** @param {string} text @param {string} label @param {() => Promise<unknown>} act */
    const action = (text, label, act) =>
      h(
        "button",
        {
          class: "chip",
          type: "button",
          "aria-label": label,
          onclick: async () => {
            await act();
            show();
          },
        },
        text,
      );

    const rows = workout.entries.map((entry, i) => {
      const name = names[i];
      const setCount = entry.sets.length;
      return h(
        "li",
        { class: "workout-row" },
        h(
          "div",
          { class: "workout-row-main" },
          entry.skipped
            ? h("span", { class: "name skipped" }, name)
            : h(
                "a",
                { class: "name", href: `#/log/ex/${entry.exerciseId}` },
                name,
              ),
          h(
            "span",
            { class: "label" },
            entry.skipped
              ? "Skipped"
              : setCount
                ? countOf(setCount, "set")
                : "No sets yet",
          ),
        ),
        h(
          "div",
          { class: "workout-row-actions" },
          action("↑", `Move ${name} up`, () =>
            forge.moveExercise(id, entry.exerciseId, i - 1),
          ),
          action("↓", `Move ${name} down`, () =>
            forge.moveExercise(id, entry.exerciseId, i + 1),
          ),
          entry.skipped
            ? action("Bring back", `Bring back ${name}`, () =>
                forge.addExercise(id, entry.exerciseId),
              )
            : action("Skip", `Skip ${name}`, () =>
                forge.skipExercise(id, entry.exerciseId),
              ),
        ),
      );
    });

    const note = h("textarea", {
      class: "search note",
      rows: "2",
      placeholder: "Slept 5 hrs, new shoes…",
      "aria-label": "Workout note",
      onchange: async () => {
        await forge.setWorkoutNote(id, note.value);
        noteStatus.textContent = "Saved";
      },
    });
    note.value = workout.note ?? "";
    const noteStatus = h("span", { class: "label", "aria-live": "polite" });

    root.replaceChildren(
      screen(
        "This workout",
        workout.entries.length
          ? h("ul", { class: "list" }, ...rows)
          : h("p", { class: "lede" }, "No exercises yet."),
        h(
          "a",
          { class: "button add-exercise", href: "#/log/add" },
          "Add exercise",
          h("span", { "aria-hidden": "true" }, "→"),
        ),
        h("p", { class: "label section" }, "Note ", noteStatus),
        note,
        h(
          "button",
          {
            class: "button secondary",
            type: "button",
            onclick: async (e) => {
              // One tap finishes; a second while saving does nothing.
              /** @type {HTMLButtonElement} */ (e.currentTarget).disabled =
                true;
              const finished = await forge.finishWorkout(id);
              endRest();
              location.hash = finished
                ? `#/log/done/${finished.id}`
                : "#/log/done";
            },
          },
          "Finish workout",
        ),
      ),
    );
  }
}
