import { h } from "../dom.js";
import { choiceChips } from "./exercise-list.js";
import { listDate, screen, twoTapButton, typedNumber } from "./screen.js";

/** @import { BodyWeightEntry } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * A line for a refusal from the core, hidden until there is one.
 * @returns {HTMLParagraphElement & { say: (message: string) => void }}
 */
function statusLine() {
  const line = h("p", { class: "lede", role: "status", hidden: true });
  return Object.assign(line, {
    /** @param {string} message */
    say: (message) => {
      line.textContent = message;
      line.hidden = message === "";
    },
  });
}

/**
 * The fields of an entry: date (no later than `today`), load and unit.
 * @param {{ date: string, load?: number, unit: "lb" | "kg" }} start
 * @param {string} today YYYY-MM-DD
 */
function entryFields({ date, load, unit }, today) {
  const chosen = { unit };
  const dateField = h("input", {
    class: "search",
    type: "date",
    value: date,
    max: today,
    "aria-label": "Date",
  });
  const loadField = h("input", {
    class: "search",
    type: "text",
    inputmode: "decimal",
    placeholder: "Body weight",
    "aria-label": "Body weight",
    value: load === undefined ? "" : String(load),
  });
  const units = choiceChips({
    label: "Unit",
    options: [
      { value: "lb", text: "lb" },
      { value: "kg", text: "kg" },
    ],
    selected: unit,
    onChoose: (value) => {
      if (value) chosen.unit = value;
    },
  });
  return {
    nodes: [dateField, h("div", { class: "weight-load" }, loadField, units)],
    /** The entry as typed; the core says what's wrong with it. */
    read: () => ({
      date: dateField.value,
      load: typedNumber(loadField),
      unit: chosen.unit,
    }),
  };
}

/**
 * Body weight (#18): add an entry for any date up to today, and see, edit
 * or delete the entries, newest first.
 * @param {Pick<ScreenContext, "forge">} context
 */
export function bodyWeightView({ forge }) {
  const root = h("div");
  show();
  return root;

  async function show() {
    const entries = await forge.listBodyWeights();
    const today = forge.today();
    const fields = entryFields(
      { date: today, unit: entries[0]?.unit ?? "lb" },
      today,
    );
    const status = statusLine();
    root.replaceChildren(
      screen(
        "Body weight",
        h(
          "form",
          {
            class: "add-form",
            onsubmit: async (e) => {
              e.preventDefault();
              status.say("");
              try {
                await forge.addBodyWeight(fields.read());
                show();
              } catch (error) {
                status.say(/** @type {Error} */ (error).message);
              }
            },
          },
          ...fields.nodes,
          h(
            "button",
            { class: "button", type: "submit" },
            "Add",
            h("span", { "aria-hidden": "true" }, "→"),
          ),
        ),
        status,
        entries.length
          ? h(
              "ul",
              { class: "list" },
              ...entries.map((entry) => entryRow(entry, today)),
            )
          : h("p", { class: "lede" }, "No entries yet."),
      ),
    );
  }

  /**
   * One entry: its weight and date, with Edit and a two-tap Delete.
   * @param {BodyWeightEntry} entry
   * @param {string} today
   */
  function entryRow(entry, today) {
    const row = h("li", { class: "weight-row" });
    const view = () =>
      row.replaceChildren(
        h(
          "div",
          { class: "weight-main" },
          h("span", { class: "name" }, `${entry.load} ${entry.unit}`),
          h("span", { class: "label" }, listDate(entry.date, today)),
        ),
        h(
          "div",
          { class: "weight-actions" },
          h("button", { class: "chip", type: "button", onclick: edit }, "Edit"),
          twoTapButton({
            className: "chip",
            text: "Delete",
            again: () => "Tap again to delete",
            act: async () => {
              await forge.deleteBodyWeight(entry.id);
              show();
            },
          }),
        ),
      );
    function edit() {
      const fields = entryFields(entry, today);
      const status = statusLine();
      row.replaceChildren(
        h(
          "form",
          {
            class: "add-form weight-edit",
            onsubmit: async (e) => {
              e.preventDefault();
              status.say("");
              try {
                await forge.updateBodyWeight(entry.id, fields.read());
                show();
              } catch (error) {
                status.say(/** @type {Error} */ (error).message);
              }
            },
          },
          ...fields.nodes,
          h(
            "div",
            { class: "weight-actions" },
            h("button", { class: "chip", type: "submit" }, "Save"),
            h(
              "button",
              { class: "chip", type: "button", onclick: view },
              "Cancel",
            ),
          ),
          status,
        ),
      );
    }
    view();
    return row;
  }
}
