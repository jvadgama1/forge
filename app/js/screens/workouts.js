import { h } from "../dom.js";
import { countOf, listDate, screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * Every workout, newest first by workout date (#20; spec #3, story 53),
 * each opening its detail to review or correct it.
 * @param {Pick<ScreenContext, "forge">} context
 */
export function workoutsView({ forge }) {
  const menu = h("nav", { class: "menu", "aria-label": "Workouts" });
  show();
  return screen("Workouts", menu);

  async function show() {
    const [workouts, gyms] = await Promise.all([
      forge.listWorkouts(),
      forge.listGyms(),
    ]);
    const today = forge.today();
    const gymNames = new Map(gyms.map((g) => [g.id, g.name]));
    const rows = await Promise.all(
      workouts.map(async (workout) => {
        const { exercises, sets } = forge.summarize(workout);
        return h(
          "a",
          { class: "workout-link", href: `#/workouts/${workout.id}` },
          h(
            "span",
            { class: "workout-link-main" },
            h(
              "span",
              { class: "name" },
              `${listDate(workout.date, today)} · ${await forge.workoutTitle(workout)}`,
            ),
            h(
              "span",
              { class: "label" },
              [
                gymNames.get(workout.gymId),
                `${countOf(exercises, "exercise")}, ${countOf(sets, "set")}`,
                workout.finishedAt ? "" : "In progress",
              ]
                .filter(Boolean)
                .join(" · "),
            ),
          ),
          h("span", { "aria-hidden": "true" }, "→"),
        );
      }),
    );
    menu.replaceChildren(
      ...(rows.length ? rows : [h("p", { class: "lede" }, "No workouts yet.")]),
    );
  }
}
