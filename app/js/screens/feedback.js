import { h } from "../dom.js";
import { clockTime, listDate, pad2, screen } from "./screen.js";

/** @import { Feedback } from "../core/types.js" */
/** @import { ScreenContext } from "./screen.js" */

/**
 * When an item was sent, in local time: "Nov 8 · 7:42 pm", with the year
 * when it isn't this year's.
 * @param {string} sentAt ISO 8601
 * @param {string} today YYYY-MM-DD
 */
function sentWhen(sentAt, today) {
  const time = new Date(sentAt);
  const date = `${time.getFullYear()}-${pad2(time.getMonth() + 1)}-${pad2(time.getDate())}`;
  return `${listDate(date, today)} · ${clockTime(time)}`;
}

/**
 * Feedback (#124): send a note about the app, and see what's been sent,
 * newest first, each marked once it's been filed as an issue. Sending is
 * kept with no signal, like logging a set.
 * @param {Pick<ScreenContext, "forge">} context
 */
export function feedbackView({ forge }) {
  const root = h("div");
  show("");
  return root;

  /** @param {string} said what the status line says, once drawn */
  async function show(said) {
    const items = await forge.listFeedback();
    const today = forge.today();
    const text = h("textarea", {
      class: "search note feedback-text",
      rows: "5",
      placeholder: "What works, what doesn't, what's missing…",
      "aria-label": "Feedback",
    });
    const status = h(
      "p",
      { class: "lede", role: "status", hidden: !said },
      said,
    );
    const send = h(
      "button",
      { class: "button", type: "submit" },
      "Send",
      h("span", { "aria-hidden": "true" }, "→"),
    );
    root.replaceChildren(
      screen(
        "Feedback",
        h(
          "form",
          {
            class: "add-form",
            onsubmit: async (e) => {
              e.preventDefault();
              send.disabled = true;
              try {
                await forge.sendFeedback(text.value);
                await show("Sent.");
              } catch (error) {
                send.disabled = false;
                status.textContent = /** @type {Error} */ (error).message;
                status.hidden = false;
              }
            },
          },
          text,
          send,
        ),
        status,
        h("h2", { class: "label section" }, "Sent"),
        items.length
          ? h(
              "ul",
              { class: "list" },
              ...items.map((item) => itemRow(item, today)),
            )
          : h("p", { class: "lede" }, "Nothing sent yet."),
      ),
    );
  }
}

/**
 * One item: when it was sent, "Filed #N" once it's an issue, and its text.
 * @param {Feedback} item
 * @param {string} today
 */
function itemRow({ sentAt, filed, text }, today) {
  return h(
    "li",
    { class: "feedback-item" },
    h(
      "div",
      { class: "row-main" },
      h("span", { class: "label" }, sentWhen(sentAt, today)),
      filed !== undefined &&
        h("span", { class: "label filed" }, `Filed #${filed}`),
    ),
    h("p", { class: "feedback-body" }, text),
  );
}
