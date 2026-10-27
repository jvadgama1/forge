// View pieces every screen shares.
import { h } from "../dom.js";

/** @import { User } from "firebase/auth" */
/** @import { Forge } from "../core/forge.js" */

/**
 * What a signed-in screen is built from; `id` is the last segment of a /:id
 * route.
 * @typedef {{ user: User, forge: Forge, signOut: () => Promise<void>, id: string | undefined }} ScreenContext
 */

export const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/**
 * A workout date as DESIGN.md writes it: "2026-10-14" → "Oct 14".
 * @param {string} date YYYY-MM-DD
 */
export function monthDay(date) {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/**
 * Two digits: 3 → "03", for set numbers and clock times.
 * @param {number} n
 */
export const pad2 = (n) => String(n).padStart(2, "0");

/**
 * A typed number, forgiving a decimal comma ("2,5"); blank is no number, so
 * the core refuses it with a message.
 * @param {HTMLInputElement} field
 */
export function typedNumber(field) {
  const text = field.value.trim().replace(",", ".");
  return text === "" ? Number.NaN : Number(text);
}

/**
 * A date as a list shows it: "Oct 25", with the year when it isn't this
 * year's ("Dec 28, 2025"), so a list across New Year reads right.
 * @param {string} date YYYY-MM-DD
 * @param {string} today YYYY-MM-DD
 */
export const listDate = (date, today) =>
  date.slice(0, 4) === today.slice(0, 4)
    ? monthDay(date)
    : `${monthDay(date)}, ${date.slice(0, 4)}`;

/**
 * A button that acts on its second tap, since what it does can't be undone
 * (#10, #18): the first tap says, in words, what a second tap will do.
 * @param {{ className: string, text: string, again: () => string, act: () => unknown }} button
 */
export function twoTapButton({ className, text, again, act }) {
  let armed = false;
  const button = h(
    "button",
    {
      class: className,
      type: "button",
      onclick: async () => {
        if (!armed) {
          armed = true;
          button.textContent = again();
          return;
        }
        button.disabled = true;
        await act();
      },
    },
    text,
  );
  return button;
}

/**
 * A count with its noun: "1 set", "3 sets".
 * @param {number} n
 * @param {string} one
 * @param {string} [many]
 */
export const countOf = (n, one, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

/**
 * A screen: the wordmark, a big title and a rule, then its content.
 * @param {string} title
 * @param {(Node | string)[]} content
 */
export function screen(title, ...content) {
  return h(
    "section",
    {},
    h("p", { class: "wordmark" }, "Forge"),
    h("h1", { class: "title" }, title),
    h("hr", { class: "rule" }),
    ...content,
  );
}

/**
 * The signed-in account's uid with a Copy button: what the owner allowlist
 * holds, so it stays visible even to an account that isn't on it (#9).
 * @param {User} account
 */
export function accountId(account) {
  const copied = h("span", { class: "label", "aria-live": "polite" });
  return [
    h("p", { class: "label" }, "Account ID"),
    h(
      "p",
      { class: "account-id" },
      h("code", {}, account.uid),
      h(
        "button",
        {
          class: "chip",
          type: "button",
          onclick: async () => {
            await navigator.clipboard.writeText(account.uid);
            copied.textContent = "Copied";
          },
        },
        "Copy",
      ),
      copied,
    ),
  ];
}
