// Backups of the existing documents a coach proposal changes (#195; spec
// #191), taken before `apply` writes anything, so one can be restored if a
// change turns out wrong. They go in the maintainer's home folder, outside
// the repo and the coach notes, as docs/agents/live-data.md (step 5) puts
// backups: live data is personal (ADR-0005). Each document is saved as the
// store returned it, one JSON file per document.
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** @import { Doc } from "../../app/js/core/types.js" */

/**
 * Saves each document in `<home>/forge-backups/coach/<name>/`, as
 * `<collection>/<id>.json`. An earlier backup of the same name, say from an
 * apply that stopped partway, is never overwritten: this one gets the next
 * free folder, "-2" and on.
 * @param {{ collection: string, id: string, doc: Doc }[]} documents
 * @param {{ home: string, name: string }} where `home` is the maintainer's
 *   home folder; tests pass a temporary one.
 * @returns {Promise<string | undefined>} the backup's folder; none when
 *   there's nothing to back up
 */
export async function backUp(documents, { home, name }) {
  if (!documents.length) return undefined;
  const parent = join(home, "forge-backups", "coach");
  await mkdir(parent, { recursive: true });
  const folder = await freshFolder(parent, name);
  for (const { collection, id, doc } of documents) {
    await mkdir(join(folder, collection), { recursive: true });
    // Ids come from the store, but encoded all the same so none can reach
    // outside the backup's folder.
    await writeFile(
      join(folder, collection, `${encodeURIComponent(id)}.json`),
      JSON.stringify(doc, null, 2) + "\n",
      { flag: "wx" },
    );
  }
  return folder;
}

/**
 * Makes the first free folder of `name` in `parent`: `name`, then
 * `name-2` and on.
 * @param {string} parent
 * @param {string} name
 */
async function freshFolder(parent, name) {
  for (let n = 1; ; n++) {
    const folder = join(parent, n === 1 ? name : `${name}-${n}`);
    try {
      await mkdir(folder);
      return folder;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST")
        throw error;
    }
  }
}
