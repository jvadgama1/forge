import { h } from "../dom.js";
import { autoFinishedLine } from "./auto-finished.js";
import { endRest } from "./rest-timer.js";
import { choiceChips } from "./exercise-list.js";
import { screen } from "./screen.js";
import { workoutHeader, workoutScreen } from "./workout.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * The Log tab (#11): the workout in progress, on the exercise asked for (a
 * /log/ex/:id route) or the one it left off at; otherwise a screen to start
 * a freestyle workout at a gym.
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function logView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const workout = await forge.currentWorkout();
    if (!workout) {
      root.replaceChildren(await startScreen());
      // Mentioned once it's actually on screen (#45).
      if (root.isConnected && root.querySelector("[data-auto-finished]"))
        await forge.dismissAutoFinished();
      return;
    }
    const gymName = (await forge.getGym(workout.gymId))?.name ?? "this gym";
    const exerciseId = forge.exerciseToShow(workout, id);
    if (!exerciseId) {
      root.replaceChildren(
        h(
          "section",
          {},
          ...workoutHeader({ workout, gymName }),
          h("p", { class: "lede" }, "Add your first exercise."),
          h(
            "a",
            { class: "button", href: "#/log/add" },
            "Add exercise",
            h("span", { "aria-hidden": "true" }, "→"),
          ),
          h(
            "button",
            {
              class: "button secondary",
              type: "button",
              onclick: async (e) => {
                /** @type {HTMLButtonElement} */ (e.currentTarget).disabled =
                  true;
                await forge.finishWorkout(workout.id);
                endRest();
                location.hash = "#/log/done";
              },
            },
            "Finish workout",
          ),
        ),
      );
      return;
    }
    root.replaceChildren(
      await workoutScreen({
        forge,
        workout,
        exerciseId,
        gymName,
        onLogged: show,
      }),
    );
  }

  async function startScreen() {
    const [gyms, current, autoFinished] = await Promise.all([
      forge.listGyms(),
      forge.currentGym(),
      autoFinishedNote(),
    ]);
    if (!current)
      return screen(
        "Start workout",
        h(
          "p",
          { class: "lede" },
          "Add a gym first, so the workout knows where you are.",
        ),
        h(
          "a",
          { class: "button", href: "#/gyms" },
          "Gyms",
          h("span", { "aria-hidden": "true" }, "→"),
        ),
        ...(autoFinished ? [autoFinished] : []),
      );
    let gymId = current.id;
    const status = h("p", { class: "lede", role: "status" });
    return screen(
      "Start workout",
      h("p", { class: "label field" }, "Gym"),
      choiceChips({
        label: "Gym",
        options: gyms.map((g) => ({ value: g.id, text: g.name })),
        selected: gymId,
        onChoose: (chosen) => {
          if (chosen !== undefined) gymId = chosen;
        },
      }),
      h(
        "button",
        {
          class: "button start",
          type: "button",
          onclick: async () => {
            try {
              await forge.startWorkout(gymId);
              endRest(); // one left from an earlier workout
              show();
            } catch (error) {
              status.textContent = /** @type {Error} */ (error).message;
            }
          },
        },
        "Start freestyle",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      status,
      ...(autoFinished ? [autoFinished] : []),
    );
  }

  /** A workout finished for the user since the last visit (#45). */
  async function autoFinishedNote() {
    const mention = await forge.autoFinished();
    const workout = mention?.workout;
    if (!mention || !workout?.finishedAt) return null;
    const { exercises, sets } = forge.summarize(workout);
    return h(
      "p",
      { class: "lede", "data-auto-finished": true },
      autoFinishedLine({
        date: workout.date,
        daysAgo: mention.daysAgo,
        finishedAt: new Date(workout.finishedAt),
        exercises,
        sets,
      }),
    );
  }
}
