// View pieces every screen shares.
import { h } from "../dom.js";

/** @import { User } from "firebase/auth" */
/** @import { Forge } from "../core/forge.js" */

/**
 * What a signed-in screen is built from; `id` is the last segment of a /:id
 * route.
 * @typedef {{ user: User, forge: Forge, signOut: () => Promise<void>, id: string | undefined }} ScreenContext
 */

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
