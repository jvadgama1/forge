import { h } from "../dom.js";
import { exercisesView } from "./exercises.js";
import { monthDay, screen } from "./screen.js";

/** @import { RoutineDayDraft } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * The text a number field holds; blank or not a whole number gives NaN,
 * which the core refuses with a message.
 * @param {HTMLInputElement} field
 */
const whole = (field) =>
  /^\d+$/.test(field.value.trim()) ? Number(field.value) : Number.NaN;

/**
 * One routine (#14): its name and its days, each with ordered slots of an
 * exercise, target sets, a rep range and an optional target RIR. Changes
 * are a draft until Save, which makes a new routine version; past workouts
 * keep the version they followed.
 * @param {Pick<ScreenContext, "forge" | "id">} context
 */
export function routineView({ forge, id }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const routine = id === undefined ? undefined : await forge.getRoutine(id);
    if (!routine) {
      root.replaceChildren(
        screen(
          "Routine not found",
          h(
            "a",
            { class: "button", href: "#/routines" },
            "Routines",
            h("span", { "aria-hidden": "true" }, "→"),
          ),
        ),
      );
      return;
    }
    const routineId = routine.id;
    const latest = routine.versions.at(-1);
    /** @type {RoutineDayDraft[]} */
    const days = structuredClone(latest?.days ?? []);
    const names = new Map(
      (await forge.searchExercises({})).map((e) => [e.id, e.name]),
    );

    const name = h("input", {
      class: "search",
      type: "text",
      value: routine.name,
      "aria-label": "Routine name",
      autocomplete: "off",
    });
    const version = h(
      "p",
      { class: "label" },
      latest
        ? `Version ${latest.number} · saved ${monthDay(latest.savedAt.slice(0, 10))}`
        : "Not saved yet",
    );
    const body = h("div", { class: "routine-days" });
    const status = h("p", { class: "lede", role: "status" });
    const page = screen(
      routine.name,
      h("p", { class: "label field" }, "Name"),
      name,
      version,
      body,
      h(
        "button",
        {
          class: "button secondary",
          type: "button",
          onclick: () => {
            days.push({ name: `Day ${days.length + 1}`, slots: [] });
            draw();
          },
        },
        "Add day",
        h("span", { "aria-hidden": "true" }, "+"),
      ),
      h(
        "button",
        {
          class: "button save-routine",
          type: "button",
          onclick: async () => {
            status.textContent = "";
            try {
              const saved = await forge.saveRoutine({
                id: routineId,
                name: name.value,
                days,
              });
              const now = saved.versions.at(-1);
              status.textContent = `Saved as version ${now?.number}`;
              const title = page.querySelector(".title");
              if (title) title.textContent = saved.name;
              version.textContent = `Version ${now?.number} · saved ${monthDay(now?.savedAt.slice(0, 10) ?? "")}`;
              // New days now have ids: keep editing the saved version.
              days.splice(0, days.length, ...structuredClone(now?.days ?? []));
              draw();
            } catch (error) {
              status.textContent = /** @type {Error} */ (error).message;
            }
          },
        },
        "Save",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      status,
    );

    /**
     * Moves item `i` of `list` by `by` places, if there's room.
     * @template T @param {T[]} list @param {number} i @param {number} by
     */
    const move = (list, i, by) => {
      const to = i + by;
      if (to < 0 || to >= list.length) return;
      const [item] = list.splice(i, 1);
      list.splice(to, 0, item);
      draw();
    };

    /** @param {string} text @param {string} label @param {() => void} act */
    const action = (text, label, act) =>
      h(
        "button",
        { class: "chip", type: "button", "aria-label": label, onclick: act },
        text,
      );

    /**
     * A small number field that writes into the draft as it's typed.
     * @param {string} label
     * @param {number} value
     * @param {(n: number) => void} set
     */
    const numberField = (label, value, set) => {
      const field = h("input", {
        class: "small-number",
        type: "text",
        inputmode: "numeric",
        "aria-label": label,
        value: String(value),
        oninput: () => set(whole(field)),
      });
      return field;
    };

    function draw() {
      body.replaceChildren(
        ...days.map((day, d) => {
          const dayName = h("input", {
            class: "search day-name",
            type: "text",
            value: day.name,
            "aria-label": `Day ${d + 1} name`,
            autocomplete: "off",
            oninput: () => {
              day.name = dayName.value;
            },
          });
          return h(
            "section",
            { class: "routine-day" },
            h(
              "div",
              { class: "routine-day-head" },
              dayName,
              action("↑", `Move ${day.name} up`, () => move(days, d, -1)),
              action("↓", `Move ${day.name} down`, () => move(days, d, 1)),
              action("✕", `Remove ${day.name}`, () => {
                days.splice(d, 1);
                draw();
              }),
            ),
            h(
              "ol",
              { class: "slots" },
              ...day.slots.map((slot, i) => {
                const exercise = names.get(slot.exerciseId) ?? slot.exerciseId;
                const rir = h(
                  "select",
                  {
                    class: "small-number",
                    "aria-label": `Target RIR for ${exercise}`,
                    onchange: () => {
                      slot.rir =
                        rir.value === "" ? undefined : Number(rir.value);
                    },
                  },
                  ...["", "0", "1", "2", "3", "4"].map((v) =>
                    h(
                      "option",
                      { value: v, selected: String(slot.rir ?? "") === v },
                      v === "" ? "—" : v === "4" ? "4+" : v,
                    ),
                  ),
                );
                return h(
                  "li",
                  { class: "slot" },
                  h(
                    "div",
                    { class: "slot-head" },
                    h("span", { class: "name" }, exercise),
                    action("↑", `Move ${exercise} up`, () =>
                      move(day.slots, i, -1),
                    ),
                    action("↓", `Move ${exercise} down`, () =>
                      move(day.slots, i, 1),
                    ),
                    action("✕", `Remove ${exercise}`, () => {
                      day.slots.splice(i, 1);
                      draw();
                    }),
                  ),
                  h(
                    "div",
                    { class: "slot-targets" },
                    h("span", { class: "label" }, "Sets"),
                    numberField(
                      `Target sets for ${exercise}`,
                      slot.sets,
                      (n) => {
                        slot.sets = n;
                      },
                    ),
                    h("span", { class: "label" }, "Reps"),
                    numberField(
                      `Fewest reps for ${exercise}`,
                      slot.repMin,
                      (n) => {
                        slot.repMin = n;
                      },
                    ),
                    h("span", { class: "label" }, "–"),
                    numberField(
                      `Most reps for ${exercise}`,
                      slot.repMax,
                      (n) => {
                        slot.repMax = n;
                      },
                    ),
                    h("span", { class: "label" }, "RIR"),
                    rir,
                  ),
                );
              }),
            ),
            h(
              "button",
              {
                class: "chip add-slot",
                type: "button",
                onclick: () => pick(day),
              },
              `Add exercise to ${day.name || `day ${d + 1}`} →`,
            ),
          );
        }),
      );
      if (!days.length)
        body.replaceChildren(
          h("p", { class: "lede" }, "No days yet. Add one, such as Push A."),
        );
    }

    /**
     * The exercise picker in place of the editor, so the draft stays put.
     * @param {RoutineDayDraft} day
     */
    function pick(day) {
      const back = () => {
        root.replaceChildren(page);
        draw();
      };
      const picker = exercisesView({
        forge,
        title: `Add to ${day.name}`,
        onPick: (exercise) => {
          if (!day.slots.some((s) => s.exerciseId === exercise.id))
            day.slots.push({
              exerciseId: exercise.id,
              sets: 3,
              repMin: 8,
              repMax: 12,
            });
          back();
        },
      });
      picker.insertBefore(
        h(
          "button",
          { class: "chip back", type: "button", onclick: back },
          "← Back",
        ),
        picker.children[3] ?? null,
      );
      root.replaceChildren(picker);
      window.scrollTo(0, 0);
    }

    draw();
    root.replaceChildren(page);
  }
}
