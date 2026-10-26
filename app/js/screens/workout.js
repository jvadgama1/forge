// The logging screen (#11), laid out as the Slab prototype: one exercise at
// a time, its sets so far, a big load × reps entry with steppers, RIR,
// warm-up / drop-set flags and one button to log the set.
import { h } from "../dom.js";
import { muscleGroup } from "../core/muscle-groups.js";
import { choiceChips } from "./exercise-list.js";

/** @import { Workout, WorkoutSet } from "../core/types.js" */
/** @import { Forge } from "../core/forge.js" */

/** @param {number} n */
const pad2 = (n) => String(n).padStart(2, "0");

/** @param {number} rir 0–4, where 4 means "4 or more" */
const rirLabel = (rir) => (rir === 4 ? "4+" : String(rir));

/**
 * A typed number, forgiving a decimal comma ("2,5"); blank is no number.
 * @param {HTMLInputElement} field
 */
function typed(field) {
  const text = field.value.trim().replace(",", ".");
  return text === "" ? Number.NaN : Number(text);
}

/**
 * Minutes and seconds since `startedAt`, as 32:14 (or 1:05:09 past an hour).
 * @param {string} startedAt
 */
function elapsed(startedAt) {
  const s = Math.max(
    0,
    Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000),
  );
  const hours = Math.floor(s / 3600);
  const rest = `${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`;
  return hours ? `${hours}:${rest}` : rest;
}

/**
 * A clock that ticks while it's on screen, and stops once it isn't.
 * @param {string} startedAt
 */
function timer(startedAt) {
  const clock = h("span", { class: "timer" }, elapsed(startedAt));
  const tick = setInterval(() => {
    if (!clock.isConnected) clearInterval(tick);
    else clock.textContent = elapsed(startedAt);
  }, 1000);
  return clock;
}

/**
 * The header every workout screen shares: wordmark and gym, the workout's
 * name, its timer and the exercise count, which opens the workout's list.
 * @param {{ workout: Workout, gymName: string, position?: string }} header
 */
export function workoutHeader({ workout, gymName, position }) {
  return [
    h(
      "div",
      { class: "workout-top" },
      h("p", { class: "wordmark" }, "Forge"),
      h("span", { class: "label" }, `At ${gymName}`),
    ),
    h(
      "div",
      { class: "workout-title" },
      h("h1", { class: "title" }, "Freestyle"),
      h(
        "div",
        { class: "workout-clock" },
        timer(workout.startedAt),
        position
          ? h(
              "a",
              {
                class: "chip",
                href: "#/log/exercises",
                "aria-label": `Exercise ${position}: this workout's exercises`,
              },
              `Ex ${position} ▾`,
            )
          : null,
      ),
    ),
    h("hr", { class: "rule" }),
  ];
}

/**
 * One logged set: number, load × reps, any flag, RIR and a tick.
 * @param {WorkoutSet} set
 * @param {number} index
 */
function setRow(set, index) {
  const flag = set.warmUp ? "Warm-up" : set.drop ? "Drop set" : "";
  return h(
    "li",
    {},
    h("span", { class: "set-no" }, pad2(index + 1)),
    h(
      "span",
      { class: "set-what" },
      `${set.load} ${set.unit} × ${set.reps}`,
      flag && h("span", { class: "label set-flag" }, flag),
    ),
    h(
      "span",
      { class: "label" },
      set.rir === undefined ? "" : `RIR ${rirLabel(set.rir)}`,
    ),
    h("span", { class: "set-done", "aria-label": "logged" }, "✓"),
  );
}

/**
 * The logging screen for one exercise of the workout in progress.
 * @param {{ forge: Forge, workout: Workout, exerciseId: string, gymName: string, onLogged: () => void }} screen
 */
export async function workoutScreen({
  forge,
  workout,
  exerciseId,
  gymName,
  onLogged,
}) {
  const live = workout.entries.filter((e) => !e.skipped);
  const index = live.findIndex((e) => e.exerciseId === exerciseId);
  const entry = live[index];
  const exercise = await forge.getExercise(exerciseId);
  const sets = entry?.sets ?? [];
  const step = forge.loadStep(exerciseId);
  const prefill = forge.nextSet(workout, exerciseId);

  /** @type {{ rir: number | undefined, flag: "warmUp" | "drop" | undefined }} */
  const choice = { rir: undefined, flag: undefined };

  const load = h("input", {
    class: "big-number",
    type: "text",
    inputmode: "decimal",
    placeholder: "—",
    "aria-label": "Load in lb",
    value: prefill ? String(prefill.load) : "",
  });
  const reps = h("input", {
    class: "big-number",
    type: "text",
    inputmode: "numeric",
    placeholder: "—",
    "aria-label": "Reps",
    value: prefill ? String(prefill.reps) : "",
  });
  const status = h("p", { class: "lede", role: "status" });

  /**
   * −/+ for a number field: by `by`, never below `min`; from empty, + starts
   * at `by`.
   * @param {HTMLInputElement} field
   * @param {number} by
   * @param {number} min
   * @param {string} what
   */
  const steppers = (field, by, min, what) =>
    h(
      "div",
      { class: "steppers" },
      h(
        "button",
        {
          type: "button",
          "aria-label": `Decrease ${what}`,
          onclick: () => {
            const value = typed(field);
            if (value - by >= min) field.value = String(value - by);
          },
        },
        "−",
      ),
      h(
        "button",
        {
          type: "button",
          "aria-label": `Increase ${what}`,
          onclick: () => {
            const value = typed(field);
            field.value = String(Number.isNaN(value) ? by : value + by);
          },
        },
        "+",
      ),
    );

  const rirButtons = h(
    "div",
    { class: "rir" },
    h("span", { class: "label" }, "RIR"),
    choiceChips({
      label: "RIR, optional",
      options: [0, 1, 2, 3, 4].map((value) => ({
        value,
        text: rirLabel(value),
      })),
      selected: undefined,
      clearable: true,
      onChoose: (value) => {
        choice.rir = value;
      },
    }),
  );

  /** @type {{ value: "warmUp" | "drop", text: string }[]} */
  const flagOptions = [
    { value: "warmUp", text: "Warm-up" },
    { value: "drop", text: "Drop set" },
  ];
  const flags = choiceChips({
    label: "Set type",
    options: flagOptions,
    selected: undefined,
    clearable: true,
    onChoose: (value) => {
      choice.flag = value;
    },
  });

  const logButton = h(
    "button",
    {
      class: "button",
      type: "button",
      onclick: async () => {
        // One tap, one set: a second tap while saving does nothing.
        if (logButton.disabled) return;
        logButton.disabled = true;
        status.textContent = "";
        try {
          await forge.logSet(workout.id, exerciseId, {
            load: typed(load),
            reps: typed(reps),
            rir: choice.rir,
            warmUp: choice.flag === "warmUp",
            drop: choice.flag === "drop",
          });
          onLogged();
        } catch (error) {
          status.textContent = /** @type {Error} */ (error).message;
          logButton.disabled = false;
        }
      },
    },
    `Log set ${pad2(sets.length + 1)}`,
    h("span", { "aria-hidden": "true" }, "→"),
  );

  const before = live[index - 1];
  const after = live[index + 1];
  /** @param {string} id */
  const nameOf = async (id) => (await forge.getExercise(id))?.name ?? id;
  const nav = h(
    "div",
    { class: "workout-nav" },
    before
      ? h(
          "a",
          { class: "chip", href: `#/log/ex/${before.exerciseId}` },
          `← ${await nameOf(before.exerciseId)}`,
        )
      : h("span"),
    after
      ? h(
          "a",
          { class: "chip", href: `#/log/ex/${after.exerciseId}` },
          `${await nameOf(after.exerciseId)} →`,
        )
      : h("a", { class: "chip", href: "#/log/add" }, "Add exercise →"),
  );

  const primary = exercise && muscleGroup(exercise.primary[0]);
  return h(
    "section",
    {},
    ...workoutHeader({
      workout,
      gymName,
      position: `${pad2(index + 1)}/${pad2(live.length)}`,
    }),
    h(
      "div",
      { class: "exercise-head" },
      h("h2", { class: "exercise-name" }, exercise?.name ?? exerciseId),
      primary
        ? h(
            "span",
            { class: "tag", "data-region": primary.region },
            `${primary.region} · ${primary.label}`,
          )
        : null,
    ),
    h(
      "ol",
      { class: "sets", "aria-label": "Sets logged" },
      ...sets.map(setRow),
      h(
        "li",
        { class: "set-now" },
        h("span", { class: "set-no" }, pad2(sets.length + 1)),
        h("span", { class: "set-what" }, "Now"),
      ),
    ),
    h(
      "div",
      { class: "entry" },
      h(
        "div",
        { class: "entry-half" },
        load,
        h("span", { class: "label" }, "lb"),
        steppers(load, step, 0, "load"),
      ),
      h(
        "div",
        { class: "entry-half" },
        reps,
        h("span", { class: "label" }, "Reps"),
        steppers(reps, 1, 1, "reps"),
      ),
    ),
    rirButtons,
    flags,
    logButton,
    status,
    nav,
  );
}
