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
