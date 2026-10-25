import { h } from "../dom.js";
import { accountId, screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * Shown to a Google account that isn't the owner's (#9).
 * @param {Pick<ScreenContext, "user" | "signOut">} context
 */
export function notOwnerView({ user, signOut }) {
  return screen(
    "Not your Forge",
    h(
      "p",
      { class: "lede" },
      `This Forge belongs to someone else, so ${user.email ?? "this account"} can't see or save anything here. Sign out to use a different Google account.`,
    ),
    ...accountId(user),
    h(
      "button",
      { class: "button", type: "button", onclick: () => signOut() },
      "Sign out",
      h("span", { "aria-hidden": "true" }, "→"),
    ),
  );
}
