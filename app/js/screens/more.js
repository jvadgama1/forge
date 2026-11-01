import { h } from "../dom.js";
import { accountId, screen } from "./screen.js";

/** @import { ScreenContext } from "./screen.js" */

/**
 * Saves text as a file on the device (#22).
 * @param {string} name
 * @param {string} text
 * @param {string} type
 */
function download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = h("a", { href: url, download: name, hidden: true });
  // In the page, so a phone's installed app follows the click too.
  document.body.append(link);
  link.click();
  link.remove();
  // Released once the save has had time to read it; at once can cut it off.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** @param {Pick<ScreenContext, "user" | "signOut" | "forge">} context */
export function moreView({ user, signOut, forge }) {
  /**
   * A button that downloads an export, named with today's date.
   * @param {string} text
   * @param {string} file e.g. "forge-sets" (no date or extension)
   * @param {"json" | "csv"} kind
   * @param {() => Promise<string>} make
   */
  const exportButton = (text, file, kind, make) =>
    h(
      "button",
      {
        class: "chip",
        type: "button",
        onclick: async () =>
          download(
            `${file}-${forge.today()}.${kind}`,
            await make(),
            kind === "json" ? "application/json" : "text/csv",
          ),
      },
      text,
    );
  return screen(
    "More",
    h(
      "nav",
      { class: "menu" },
      h(
        "a",
        { href: "#/workouts" },
        "Workouts",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      h(
        "a",
        { href: "#/gyms" },
        "Gyms",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      h(
        "a",
        { href: "#/routines" },
        "Routines",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      h(
        "a",
        { href: "#/body-weight" },
        "Body weight",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
      h(
        "a",
        { href: "#/exercises" },
        "Exercises",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
    ),
    // Your own backup (#22): everything as JSON; sets and body weight as
    // CSV for a spreadsheet.
    h("h2", { class: "label section" }, "Export"),
    h(
      "div",
      { class: "export" },
      exportButton("All data · JSON", "forge", "json", async () =>
        JSON.stringify(await forge.exportJson(), null, 2),
      ),
      exportButton("Sets · CSV", "forge-sets", "csv", () =>
        forge.exportSetsCsv(),
      ),
      exportButton("Body weight · CSV", "forge-body-weight", "csv", () =>
        forge.exportBodyWeightCsv(),
      ),
    ),
    h("h2", { class: "label section" }, "Account"),
    h("p", { class: "account" }, user.email ?? "Signed in"),
    ...accountId(user),
    h(
      "button",
      { class: "button secondary", type: "button", onclick: () => signOut() },
      "Sign out",
    ),
  );
}
