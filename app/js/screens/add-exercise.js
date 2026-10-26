import { exercisesView } from "./exercises.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * The exercise picker, adding the chosen exercise to the workout in
 * progress and opening it for logging (#11).
 * @param {Pick<ScreenContext, "forge">} context
 */
export function addExerciseView({ forge }) {
  return exercisesView({
    forge,
    title: "Add exercise",
    onPick: async (exercise) => {
      const workout = await forge.currentWorkout();
      if (!workout) {
        location.hash = "#/log";
        return;
      }
      await forge.addExercise(workout.id, exercise.id);
      location.hash = `#/log/ex/${exercise.id}`;
    },
  });
}
