// The update bar (#129): once a new app version is waiting, a slim bar above
// every screen says so. It pushes the screen down rather than covering it,
// so Log set is never hidden, and has no dismiss: it stays until Update.
import { h } from "./dom.js";

/** @import { Updates } from "./updates.js" */

/**
 * The Update button, here and under More: switches to the new version and
 * reloads.
 * @param {Updates} updates
 */
export function updateButton(updates) {
  const button = h(
    "button",
    {
      class: "chip primary",
      type: "button",
      onclick: () => {
        button.disabled = true;
        button.textContent = "Updating…";
        updates.update();
      },
    },
    "Update",
  );
  return button;
}

/** @param {Updates} updates */
export function showUpdateBar(updates) {
  if (document.getElementById("update")) return;
  document.body.prepend(
    h(
      "div",
      { id: "update", class: "update-bar", role: "status" },
      h("span", { class: "label" }, "New version ready"),
      updateButton(updates),
    ),
  );
}
