/**
 * Shows that a change didn't reach the server, so a lost set never goes unnoticed.
 * @param {unknown} error
 */
export function showSaveError(error) {
  console.error("Forge: a change failed to save", error);
  const alert = /** @type {HTMLElement} */ (document.getElementById("alert"));
  alert.textContent =
    "⚠ A change didn't save. Check you're signed in, then try again.";
  alert.hidden = false;
}
