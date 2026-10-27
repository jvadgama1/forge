import { h } from "../dom.js";
import { choiceChips } from "./exercise-list.js";
import { monthDay, pad2, screen } from "./screen.js";

/** @import { BodyWeight } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/** Today where the user is, as YYYY-MM-DD: the date field's default. */
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * The fields of an entry: date, load and unit.
 * @param {{ date: string, load?: number, unit: "lb" | "kg" }} start
 */
function entryFields({ date, load, unit }) {
  const chosen = { unit };
  const dateField = h("input", {
    class: "search",
    type: "date",
    value: date,
    max: today(),
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
      load: Number(loadField.value.trim().replace(",", ".") || Number.NaN),
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
    const fields = entryFields({
      date: today(),
      unit: entries[0]?.unit ?? "lb",
    });
    const status = h("p", { class: "lede", role: "status" });
    const list = h(
      "ul",
      { class: "list weights" },
      ...entries.map((entry) => entryRow(entry)),
    );
    root.replaceChildren(
      screen(
        "Body weight",
        h(
          "form",
          {
            class: "add-form",
            onsubmit: async (e) => {
              e.preventDefault();
              status.textContent = "";
              try {
                await forge.addBodyWeight(fields.read());
                show();
              } catch (error) {
                status.textContent = /** @type {Error} */ (error).message;
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
        entries.length ? list : h("p", { class: "lede" }, "No entries yet."),
      ),
    );
  }

  /**
   * One entry: its date and weight, with Edit and Delete (two taps).
   * @param {BodyWeight} entry
   */
  function entryRow(entry) {
    const row = h("li", { class: "weight-row" });
    let armed = false;
    const remove = h(
      "button",
      {
        class: "chip",
        type: "button",
        onclick: async () => {
          if (!armed) {
            armed = true;
            remove.textContent = "Tap again to delete";
            return;
          }
          await forge.deleteBodyWeight(entry.id);
          show();
        },
      },
      "Delete",
    );
    const view = () =>
      row.replaceChildren(
        h(
          "div",
          { class: "workout-row-main" },
          h("span", { class: "name" }, `${entry.load} ${entry.unit}`),
          h("span", { class: "label" }, monthDay(entry.date)),
        ),
        h(
          "div",
          { class: "workout-row-actions" },
          h("button", { class: "chip", type: "button", onclick: edit }, "Edit"),
          remove,
        ),
      );
    function edit() {
      const fields = entryFields(entry);
      const status = h("p", { class: "lede", role: "status" });
      row.replaceChildren(
        h(
          "form",
          {
            class: "add-form weight-edit",
            onsubmit: async (e) => {
              e.preventDefault();
              try {
                await forge.updateBodyWeight(entry.id, fields.read());
                show();
              } catch (error) {
                status.textContent = /** @type {Error} */ (error).message;
              }
            },
          },
          ...fields.nodes,
          h(
            "div",
            { class: "workout-row-actions" },
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
