// The logging screen (#11), laid out as the Slab prototype: one exercise at
// a time, its sets so far, a big two-number entry with steppers (load × reps,
// or what the exercise type measures: #19), RIR, warm-up / drop-set flags and
// one button to log the set.
import { h } from "../dom.js";
import { muscleGroup } from "../core/muscle-groups.js";
import { TYPE_RULES } from "../core/exercise-types.js";
import { choiceChips } from "./exercise-list.js";
import {
  fieldsFor,
  loadText,
  readFields,
  recordName,
  setText,
  shortText,
} from "./measure.js";
import { endRest, restBar, startRest } from "./rest-timer.js";
import { monthDay, pad2, typedNumber as typed } from "./screen.js";

/** @import { ExerciseType, RecordKind, SuggestedWeight, Workout, WorkoutSet } from "../core/types.js" */
/** @import { Forge } from "../core/forge.js" */

/** @param {number} n to 0.01 */
const round = (n) => Math.round(n * 100) / 100;

/** @param {number} rir 0–4, where 4 means "4 or more" */
const rirLabel = (rir) => (rir === 4 ? "4+" : String(rir));

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
 * @param {{ workout: Workout, title: string, gymName: string, backDated: boolean, position?: string }} header
 *   `title` is the routine day's name, or Freestyle (#14). A back-dated
 *   workout's header says its date (#20).
 */
export function workoutHeader({
  workout,
  title,
  gymName,
  backDated,
  position,
}) {
  return [
    h(
      "div",
      { class: "workout-top" },
      h("p", { class: "wordmark" }, "Forge"),
      h(
        "span",
        { class: "label" },
        backDated
          ? `At ${gymName} · ${monthDay(workout.date)}`
          : `At ${gymName}`,
      ),
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

/**
 * One logged set: number, its measure, any flag, RIR and a tick.
 * @param {WorkoutSet} set
 * @param {number} index
 * @param {ExerciseType} type the exercise's
 */
export function setRow(set, index, type) {
  const flag = set.warmUp ? "Warm-up" : set.drop ? "Drop set" : "";
  return h(
    "li",
    {},
    h("span", { class: "set-no" }, pad2(index + 1)),
    h(
      "span",
      { class: "set-what" },
      setText(set, type),
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
 * A set's optional RIR and set type (warm-up or drop set), as chips that
 * a second tap clears: for logging a set and for correcting one (#11, #20).
 * A timed hold or cardio has only the warm-up flag (#19).
 * @param {ExerciseType} type the exercise's
 * @param {Pick<WorkoutSet, "rir" | "warmUp" | "drop">} [set] to start from
 */
export function setChoices(type, set = {}) {
  /** @type {{ rir: number | undefined, flag: "warmUp" | "drop" | undefined }} */
  const choice = {
    rir: set.rir,
    flag: set.warmUp ? "warmUp" : set.drop ? "drop" : undefined,
  };
  const reps = TYPE_RULES[type].effort;
  /** @type {{ value: "warmUp" | "drop", text: string }[]} */
  const flagOptions = [
    { value: "warmUp", text: "Warm-up" },
    ...(reps
      ? [{ value: /** @type {const} */ ("drop"), text: "Drop set" }]
      : []),
  ];
  return {
    nodes: [
      reps
        ? h(
            "div",
            { class: "rir" },
            h("span", { class: "label" }, "RIR"),
            choiceChips({
              label: "RIR, optional",
              options: [0, 1, 2, 3, 4].map((value) => ({
                value,
                text: rirLabel(value),
              })),
              selected: choice.rir,
              clearable: true,
              onChoose: (value) => {
                choice.rir = value;
              },
            }),
          )
        : null,
      choiceChips({
        label: "Set type",
        options: flagOptions,
        selected: choice.flag,
        clearable: true,
        onChoose: (value) => {
          choice.flag = value;
        },
      }),
    ],
    /** The choices as a set's fields. */
    read: () => ({
      rir: reps ? choice.rir : undefined,
      warmUp: choice.flag === "warmUp",
      drop: choice.flag === "drop",
    }),
  };
}

/**
 * The exercise's last workout on one line (spec #3, story 25), in DESIGN.md's
 * order (date, each working set, RIR) and the Slab prototype's coral-edged
 * card. Tapping it opens the full history (#13).
 * Supersetted then, it names the partners (#17).
 * @param {string} exerciseId
 * @param {ExerciseType} type
 * @param {NonNullable<Awaited<ReturnType<Forge["lastWorkoutLine"]>>>} last
 * @param {string[]} partners their names
 */
function lastWorkoutLine(exerciseId, type, { date, sets, rir }, partners) {
  return h(
    "a",
    {
      class: "last-workout",
      href: `#/log/history/${encodeURIComponent(exerciseId)}`,
    },
    h(
      "span",
      { class: "label last-head" },
      [
        `Last · ${monthDay(date)}`,
        ...(partners.length ? [`superset w/ ${partners.join(", ")}`] : []),
      ].join(" · "),
    ),
    h(
      "span",
      { class: "last-sets" },
      sets.length
        ? sets.map((s) => shortText(s, type)).join(", ")
        : "Warm-ups only",
      rir === undefined
        ? null
        : h("span", { class: "label" }, ` · RIR ${rirLabel(rir)}`),
    ),
    h("span", { class: "last-link" }, "History →"),
  );
}

/**
 * The suggested weight and why (#15), as "Suggested 140 lb · Up 5 lb"; for
 * assisted, "Suggested 35 lb assist · Less assist" (#19).
 * @param {SuggestedWeight} suggestion
 * @param {ExerciseType} type
 */
function suggestionLine(suggestion, type) {
  const by = `${suggestion.by} ${suggestion.unit}`;
  const assisted = TYPE_RULES[type].harder === "lighter";
  const why = {
    up: assisted ? "Less assist" : `Up ${by}`,
    hold: "Hold",
    down: assisted ? "More assist" : `Down ${by}`,
    comeback: assisted
      ? `Comeback, ${by} more`
      : `Comeback, ${suggestion.percent}%`,
  }[suggestion.reason];
  return h(
    "p",
    { class: "label targets" },
    `Suggested ${loadText(suggestion, type)} · ${why}`,
  );
}

/**
 * Looks up exercises' names, falling back to the id of one since deleted.
 * @param {Forge} forge
 */
const exerciseNamer = (forge) => async (/** @type {string} */ id) =>
  (await forge.getExercise(id))?.name ?? id;

/**
 * A set just logged, for the screen that follows it: the records it beat
 * (#13), and the exercise to log next (#17).
 * @typedef {{ exerciseId: string, set: WorkoutSet, records: RecordKind[], next: string }} Logged
 */

/**
 * A small celebration for a set that beat a record (spec #3, story 40):
 * a star and the record's name, so it isn't colour alone. When the screen
 * has moved on to a superset partner (#17), it names the exercise.
 * @param {Forge} forge
 * @param {Logged} logged
 * @param {string} onScreen the exercise now shown
 */
async function celebration(forge, { exerciseId, set, records }, onScreen) {
  const type = await forge.exerciseType(exerciseId);
  const names = records.map((r) => recordName(r, set, type)).join(", ");
  const which =
    exerciseId === onScreen
      ? ""
      : ` on ${await exerciseNamer(forge)(exerciseId)}`;
  return h(
    "p",
    { class: "record", role: "status" },
    h("span", { "aria-hidden": "true" }, "★ "),
    `New record${which}: ${names}`,
  );
}

/**
 * The superset line (#17): the partners and Unpair at the top when paired;
 * and `Superset with…`, or `Add to superset…` once paired, which opens a
 * chip per exercise it can take: two taps to pair. The button sits at the
 * end of the set-type row, where there's room (#104), and its chips open
 * below that row (pairing is once per exercise, so the top stays short:
 * #63).
 * @param {Forge} forge
 * @param {Workout} workout
 * @param {string} exerciseId
 * @param {() => void} changed
 */
async function supersetLine(forge, workout, exerciseId, changed) {
  const nameOf = exerciseNamer(forge);
  const members = forge.supersetOf(workout, exerciseId);
  const top = members
    ? h(
        "div",
        { class: "superset" },
        h(
          "span",
          { class: "label" },
          `Superset with ${(
            await Promise.all(
              members.filter((id) => id !== exerciseId).map(nameOf),
            )
          ).join(", ")}`,
        ),
        h(
          "button",
          {
            class: "chip",
            type: "button",
            onclick: async () => {
              await forge.unpairExercise(workout.id, exerciseId);
              changed();
            },
          },
          "Unpair",
        ),
      )
    : null;
  const candidates = forge.partnersFor(workout, exerciseId);
  if (!candidates.length) return { top, open: null, choices: null };
  const choices = h(
    "div",
    {
      class: "chips superset-choices",
      role: "group",
      "aria-label": "Superset with",
    },
    ...(await Promise.all(
      candidates.map(async (id) =>
        h(
          "button",
          {
            class: "chip",
            type: "button",
            onclick: async () => {
              await forge.pairExercises(workout.id, exerciseId, id);
              changed();
            },
          },
          await nameOf(id),
        ),
      ),
    )),
  );
  choices.hidden = true;
  const open = h(
    "button",
    {
      class: "chip",
      type: "button",
      "aria-expanded": "false",
      onclick: () => {
        choices.hidden = !choices.hidden;
        open.setAttribute("aria-expanded", String(!choices.hidden));
      },
    },
    members ? "Add to superset…" : "Superset with…",
  );
  return { top, open, choices };
}

/**
 * For a routine slot's exercise this gym doesn't have, or one swapped in
 * (#16): says so, with a chip per swap candidate, best first. One tap swaps
 * it for this workout and opens the one swapped in. Before its first set.
 * @param {Forge} forge
 * @param {Workout} workout
 * @param {string} exerciseId
 * @param {string} gymName
 * @param {(swappedIn: string) => void} swapped
 */
async function swapLine(forge, workout, exerciseId, gymName, swapped) {
  const offer = await forge.swapOffer(workout, exerciseId);
  if (!offer) return null;
  const nameOf = exerciseNamer(forge);
  const { candidates, swappedFor } = offer;
  const why = swappedFor
    ? `Swapped for ${await nameOf(swappedFor)}`
    : `Not at ${gymName}`;
  // Missing is a warning; swapped is just so, and needs no "nothing here".
  const rest = candidates.length
    ? " · swap for"
    : swappedFor
      ? ""
      : " · nothing here to swap for";
  return h(
    "div",
    { class: swappedFor ? "swap swapped" : "swap" },
    h("p", { class: "label" }, `${why}${rest}`),
    candidates.length
      ? h(
          "div",
          { class: "chips", role: "group", "aria-label": "Swap for" },
          ...(await Promise.all(
            candidates.map(async (id) =>
              h(
                "button",
                {
                  class: "chip",
                  type: "button",
                  onclick: async () => {
                    await forge.swapExercise(workout.id, exerciseId, id);
                    swapped(id);
                  },
                },
                await nameOf(id),
              ),
            ),
          )),
        )
      : null,
  );
}

/**
 * The logging screen for one exercise of the workout in progress.
 * @param {{ forge: Forge, workout: Workout, exerciseId: string, gymName: string, logged?: Logged, onLogged: (logged?: Logged | { back: string }) => void }} screen
 *   `logged` is the set just logged, if any, to celebrate.
 */
export async function workoutScreen({
  forge,
  workout,
  exerciseId,
  gymName,
  logged: justLogged,
  onLogged,
}) {
  const live = workout.entries.filter((e) => !e.skipped);
  const index = live.findIndex((e) => e.exerciseId === exerciseId);
  const entry = live[index];
  const exercise = await forge.getExercise(exerciseId);
  const type = await forge.exerciseType(exerciseId);
  const sets = entry?.sets ?? [];
  const prefill = await forge.nextSet(workout, exerciseId);
  const settings = await forge.exerciseSettings(exerciseId);
  const fields = fieldsFor(type, settings.unit, settings.increment);
  const inputs = fields.map((field) =>
    h("input", {
      class: "big-number",
      type: "text",
      inputmode: field.mode,
      placeholder: field.optional ? "0" : "—",
      "aria-label": field.name,
      value: prefill ? field.show(prefill) : "",
    }),
  );
  const status = h("p", { class: "lede", role: "status" });

  /**
   * −/+ for a number field: by `by`, never below `min`; from empty, + starts
   * at `by`. Sums round to 0.01, so 0.1 steps don't drift.
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
            if (value - by >= min) field.value = String(round(value - by));
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
            field.value = String(Number.isNaN(value) ? by : round(value + by));
          },
        },
        "+",
      ),
    );

  const choices = setChoices(type);

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
            ...readFields(fields, inputs.map(typed)),
            ...choices.read(),
          });
          // A rest default of Off, or a set within a superset's round,
          // starts no rest (#52, #17), and clears any still running.
          const rest = await forge.restAfterSet(exerciseId, logged);
          if (rest === undefined) endRest();
          else startRest(rest);
          const set = /** @type {WorkoutSet} */ (
            logged.entries.find((e) => e.exerciseId === exerciseId)?.sets.at(-1)
          );
          onLogged({
            exerciseId,
            set,
            records: await forge.recordsSetBy(logged, exerciseId),
            next: await forge.nextExercise(logged, exerciseId),
          });
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
  const nameOf = exerciseNamer(forge);
  // In a superset, undo takes back the members' latest set, which may be
  // the partner's just logged (#17), and goes back to it.
  const undoFrom = forge.undoTarget(workout, exerciseId);
  const undoing = workout.entries
    .find((e) => e.exerciseId === undoFrom)
    ?.sets.at(-1);
  const undoType = await forge.exerciseType(undoFrom);
  let armed = false;
  const undo = h(
    "button",
    {
      class: "chip undo",
      type: "button",
      hidden: !undoing,
      onclick: async () => {
        if (!undoing || undo.disabled) return;
        if (!armed) {
          armed = true;
          // Name it when it's the partner's (#17).
          const whose =
            undoFrom === exerciseId ? "" : `${await nameOf(undoFrom)} `;
          undo.textContent = `Tap again to undo ${whose}${setText(undoing, undoType)}`;
          return;
        }
        undo.disabled = true;
        status.textContent = "";
        try {
          await forge.undoLastSet(workout.id, undoFrom);
          // The rest was for that set: it goes with it.
          endRest();
          onLogged(undoFrom === exerciseId ? undefined : { back: undoFrom });
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
  const superset = await supersetLine(forge, workout, exerciseId, () =>
    onLogged(),
  );
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
  const partners = await Promise.all((lastWorkout?.partners ?? []).map(nameOf));
  const targets = await forge.targets(workout, exerciseId);
  const suggested = await forge.suggestedWeight(workout, exerciseId);
  const primary = exercise && muscleGroup(exercise.primary[0]);
  return h(
    "section",
    {},
    ...workoutHeader({
      workout,
      title: await forge.workoutTitle(workout),
      gymName,
      backDated: forge.isBackDated(workout),
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
    superset.top,
    await swapLine(forge, workout, exerciseId, gymName, (id) =>
      onLogged({ back: id }),
    ),
    suggested ? suggestionLine(suggested, type) : null,
    // The pinned note, every time the exercise is logged (#21).
    settings.note
      ? h(
          "p",
          { class: "pinned-note" },
          h("span", { class: "label" }, "Note "),
          settings.note,
        )
      : null,
    lastWorkout
      ? lastWorkoutLine(exerciseId, type, lastWorkout, partners)
      : null,
    h(
      "ol",
      { class: "sets", "aria-label": "Sets logged" },
      ...sets.map((set, i) => setRow(set, i, type)),
      // Undo on the Now row, where there's room (#104).
      h(
        "li",
        { class: "set-now" },
        h("span", { class: "set-no" }, pad2(sets.length + 1)),
        h("span", { class: "set-what" }, "Now"),
        undo,
      ),
    ),
    justLogged?.records.length
      ? await celebration(forge, justLogged, exerciseId)
      : null,
    restBar(),
    h(
      "div",
      { class: "entry" },
      ...fields.map((field, i) =>
        h(
          "div",
          { class: "entry-half" },
          inputs[i],
          h("span", { class: "label" }, field.label),
          steppers(inputs[i], field.step, field.min, field.what),
        ),
      ),
    ),
    ...choices.nodes.slice(0, -1),
    // The set type, with the superset button at the end of its row (#104).
    h(
      "div",
      { class: "set-type-row" },
      choices.nodes.at(-1) ?? null,
      superset.open,
    ),
    superset.choices,
    logButton,
    status,
    nav,
  );
}
