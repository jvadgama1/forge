import { appVersion } from "../app-version.js";
import { h } from "../dom.js";
import { READY, updateButton } from "../update-bar.js";
import { accountId, screen, versionDay } from "./screen.js";

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

/**
 * The app version this is, and a check for a newer one (#129): Update if one
 * is waiting, otherwise a check that says what it found.
 * @param {ScreenContext["updates"]} updates
 */
function versionSection(updates) {
  const { commit, date } = appVersion();
  const outcome = h("span", { class: "label", role: "status" });
  const offer = () =>
    row.replaceChildren(
      updateButton(updates),
      h("span", { class: "label" }, READY),
    );
  const checkButton = h(
    "button",
    {
      class: "chip",
      type: "button",
      onclick: async () => {
        checkButton.disabled = true;
        checkButton.textContent = "Checking…";
        outcome.textContent = "";
        const result = await updates.check();
        checkButton.disabled = false;
        checkButton.textContent = "Check for updates";
        if (result === "ready") offer();
        else
          outcome.textContent =
            result === "up-to-date" ? "Up to date" : "Couldn't check";
      },
    },
    "Check for updates",
  );
  const row = h("div", { class: "version-check" }, checkButton, outcome);
  if (updates.ready) offer();
  return [
    // The commit as written, lowercase; "dev" in capitals with the rest.
    h(
      "p",
      { class: "label section version" },
      "Version ",
      commit === "dev" ? "dev" : h("span", { class: "commit" }, commit),
      date && ` · ${versionDay(date)}`,
    ),
    row,
  ];
}

/** @param {Pick<ScreenContext, "user" | "signOut" | "forge" | "updates">} context */
export function moreView({ user, signOut, forge, updates }) {
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
      // First, so a thought about the app is one tap from More (#124).
      h(
        "a",
        { href: "#/feedback" },
        "Feedback",
        h("span", { "aria-hidden": "true" }, "→"),
      ),
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
    ...versionSection(updates),
  );
}
