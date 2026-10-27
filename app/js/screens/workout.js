// The logging screen (#11), laid out as the Slab prototype: one exercise at
// a time, its sets so far, a big load × reps entry with steppers, RIR,
// warm-up / drop-set flags and one button to log the set.
import { h } from "../dom.js";
import { muscleGroup } from "../core/muscle-groups.js";
import { choiceChips } from "./exercise-list.js";
import { endRest, restBar, startRest } from "./rest-timer.js";
import { monthDay, pad2 } from "./screen.js";

/** @import { Load, RecordKind, Workout, WorkoutSet } from "../core/types.js" */
/** @import { Forge } from "../core/forge.js" */

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
 * @param {{ workout: Workout, title: string, gymName: string, position?: string }} header
 *   `title` is the routine day's name, or Freestyle (#14).
 */
export function workoutHeader({ workout, title, gymName, position }) {
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
      h("h1", { class: "title" }, title),
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

/** @param {Load} load as "135 lb" */
export const loadText = ({ load, unit }) => `${load} ${unit}`;

/** @param {WorkoutSet} set as "135 lb × 8" */
const setText = (set) => `${loadText(set)} × ${set.reps}`;

/**
 * One logged set: number, load × reps, any flag, RIR and a tick.
 * @param {WorkoutSet} set
 * @param {number} index
 */
export function setRow(set, index) {
  const flag = set.warmUp ? "Warm-up" : set.drop ? "Drop set" : "";
  return h(
    "li",
    {},
    h("span", { class: "set-no" }, pad2(index + 1)),
    h(
      "span",
      { class: "set-what" },
      setText(set),
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
 * The exercise's last workout on one line (spec #3, story 25), in DESIGN.md's
 * order (date, each working set, RIR) and the Slab prototype's coral-edged
 * card. Tapping it opens the full history (#13).
 * @param {string} exerciseId
 * @param {NonNullable<Awaited<ReturnType<Forge["lastWorkoutLine"]>>>} last
 */
function lastWorkoutLine(exerciseId, { date, sets, rir }) {
  return h(
    "a",
    {
      class: "last-workout",
      href: `#/log/history/${encodeURIComponent(exerciseId)}`,
    },
    h("span", { class: "label last-head" }, `Last · ${monthDay(date)}`),
    h(
      "span",
      { class: "last-sets" },
      sets.length
        ? sets.map((s) => `${s.load}×${s.reps}`).join(", ")
        : "Warm-ups only",
      rir === undefined
        ? null
        : h("span", { class: "label" }, ` · RIR ${rirLabel(rir)}`),
    ),
    h("span", { class: "last-link" }, "History →"),
  );
}

/**
 * What the celebration calls a record the set beat.
 * @param {RecordKind} record
 * @param {WorkoutSet} set the set that beat it
 */
const recordName = (record, set) =>
  record === "heaviest"
    ? "heaviest load"
    : record === "e1rm"
      ? "best e1RM"
      : `most reps at ${loadText(set)}`;

/**
 * A small celebration for a set that beat a record (spec #3, story 40):
 * a star and the record's name, so it isn't colour alone.
 * @param {RecordKind[]} records
 * @param {WorkoutSet} set the set that beat them
 */
function celebration(records, set) {
  return h(
    "p",
    { class: "record", role: "status" },
    h("span", { "aria-hidden": "true" }, "★ "),
    `New record: ${records.map((r) => recordName(r, set)).join(", ")}`,
  );
}

/**
 * The logging screen for one exercise of the workout in progress.
 * @param {{ forge: Forge, workout: Workout, exerciseId: string, gymName: string, records?: RecordKind[], onLogged: (records?: RecordKind[]) => void }} screen
 */
export async function workoutScreen({
  forge,
  workout,
  exerciseId,
  gymName,
  records = [],
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
          const logged = await forge.logSet(workout.id, exerciseId, {
            load: typed(load),
            reps: typed(reps),
            rir: choice.rir,
            warmUp: choice.flag === "warmUp",
            drop: choice.flag === "drop",
          });
          startRest(forge.restAfterSet(exerciseId));
          onLogged(await forge.recordsSetBy(logged, exerciseId));
        } catch (error) {
          status.textContent = /** @type {Error} */ (error).message;
          logButton.disabled = false;
        }
      },
    },
    `Log set ${pad2(sets.length + 1)}`,
    h("span", { "aria-hidden": "true" }, "→"),
  );

  // Undo the last set (#42): two taps, since the set is gone afterwards.
  const last = sets.at(-1);
  let armed = false;
  const undo = h(
    "button",
    {
      class: "chip undo",
      type: "button",
      hidden: !last,
      onclick: async () => {
        if (!last || undo.disabled) return;
        if (!armed) {
          armed = true;
          undo.textContent = `Tap again to undo ${setText(last)}`;
          return;
        }
        undo.disabled = true;
        status.textContent = "";
        try {
          await forge.undoLastSet(workout.id, exerciseId);
          // The rest was for that set: it goes with it.
          endRest();
          onLogged();
        } catch (error) {
          status.textContent = /** @type {Error} */ (error).message;
          armed = false;
          undo.textContent = "Undo last set";
          undo.disabled = false;
        }
      },
    },
    "Undo last set",
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

  const lastWorkout = await forge.lastWorkoutLine(exerciseId, workout.id);
  const targets = await forge.targets(workout, exerciseId);
  const primary = exercise && muscleGroup(exercise.primary[0]);
  return h(
    "section",
    {},
    ...workoutHeader({
      workout,
      title: await forge.workoutTitle(workout),
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
    targets
      ? h(
          "p",
          { class: "label targets" },
          `Target ${targets.sets} × ${targets.repMin}–${targets.repMax}`,
          targets.rir === undefined ? "" : ` · RIR ${rirLabel(targets.rir)}`,
        )
      : null,
    lastWorkout ? lastWorkoutLine(exerciseId, lastWorkout) : null,
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
    records.length && last ? celebration(records, last) : null,
    undo,
    restBar(),
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
