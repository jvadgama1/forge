// Where a shots run lives: .shots/<label>/, git-ignored (#33). A run's
// folder is deleted and rewritten, so a label is a plain name and can never
// reach outside .shots/.
import { fileURLToPath } from "node:url";

export const LABEL = /^[\w-]+$/;

/** @param {string} label */
export function runDir(label) {
  if (!LABEL.test(label)) throw new Error(`Not a shots label: "${label}"`);
  return fileURLToPath(new URL(`../../.shots/${label}/`, import.meta.url));
}
