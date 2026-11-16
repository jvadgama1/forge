// What `npm run coach` does (#174), with the store, clock and private folder
// passed in, so tests run it over a stand-in store and a temporary folder
// and never the live project. It reads and saves through the Forge core,
// with the rules the app uses (spec #170). Saving only ever adds a coaching
// session: it has no way to change or delete one (story 46). Proposals,
// which change the user's set-up but never delete, are in proposal.js
// (#193; spec #191).
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createForge } from "../../app/js/core/forge.js";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { fileNames, insightMarkdown, savedWhen } from "./insight-file.js";
import { apply, preview } from "./proposal.js";

/** @import { CoachingSession, CoachingSessionDraft, Store } from "../../app/js/core/types.js" */
/** @import { Forge } from "../../app/js/core/forge.js" */

const USAGE = [
  "Usage: npm run coach -- read            print all Forge data as JSON, then",
  "                                        refresh the insight files",
  "       npm run coach -- save <draft>    save one coaching session from a",
  "                                        draft in drafts/, then remove it",
  "       npm run coach -- preview <proposal>",
  "                                        show what a proposal in drafts/",
  "                                        would change, and its fingerprint",
  "       npm run coach -- apply <proposal> <fingerprint>",
  "                                        make the proposal's changes if",
  "                                        nothing changed since its preview,",
  "                                        record it in proposals/, then",
  "                                        remove it",
].join("\n");

/**
 * @typedef {object} Deps
 * @property {Store} store
 * @property {() => Date} now
 * @property {string} folder The private folder for coach notes; a draft
 *   named without a folder is in its drafts/.
 * @property {string} home The maintainer's home folder, where `apply`
 *   backs up the documents it changes (#195); tests pass a temporary one.
 * @property {(text: string) => void} print
 */

/**
 * @param {string[]} args What followed `npm run coach --`.
 * @param {Deps} deps
 * @returns {Promise<number>} the exit code
 */
export async function runCoach(args, deps) {
  const [command, draft, ...rest] = args;
  const forge = createForge({
    store: deps.store,
    library: SEED_LIBRARY,
    now: deps.now,
  });
  if (command === "read" && args.length === 1) return read(forge, deps);
  if (command === "save" && draft && !rest.length)
    return save(draft, forge, deps);
  if (command === "preview" && draft && !rest.length)
    return preview(draft, deps);
  if (command === "apply" && draft && rest.length === 1 && rest[0])
    return apply(draft, rest[0], deps);
  deps.print(USAGE);
  return 1;
}

/**
 * Prints all the data as JSON, then makes insights/ hold each saved
 * coaching session's file as it stands in Firestore, so a save whose file
 * write failed is mended by the next run (spec #170, story 65). Matching
 * files are left untouched, and files that are no coaching session's are
 * left alone. The data itself is only printed, never saved (ADR-0005).
 * @param {Forge} forge
 * @param {Deps} deps
 */
async function read(forge, { folder, print }) {
  /** @type {Awaited<ReturnType<Forge["exportJson"]>>} */
  let data;
  try {
    data = await forge.exportJson();
  } catch (error) {
    print(
      `Couldn't read the data: ${errorText(error)}. Is the Firebase CLI logged in (npx firebase login)?`,
    );
    return 1;
  }
  print(JSON.stringify(data, null, 2));
  const sessions = data.coachingSessions;
  const names = fileNames(sessions);
  const insights = join(folder, "insights");
  await mkdir(insights, { recursive: true });
  let written = 0;
  for (const session of sessions) {
    const file = join(insights, /** @type {string} */ (names.get(session.id)));
    const markdown = insightMarkdown(session, sessions);
    const current = await readFile(file, "utf8").catch(() => undefined);
    if (current === markdown) continue;
    await writeFile(file, markdown);
    written++;
  }
  print(
    `Insight files: ${written} written, ${sessions.length - written} up to date.`,
  );
  return 0;
}

/**
 * Saves one coaching session from a draft, writes its insight file and
 * removes the draft. A relative draft path is in the folder's drafts/.
 * @param {string} draftPath
 * @param {Forge} forge
 * @param {Deps} deps
 */
async function save(draftPath, forge, { folder, print }) {
  const path = resolve(folder, "drafts", draftPath);
  /** @type {string} */
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT")
      throw error;
    print(`Not saved: there's no draft at ${path}.`);
    return 1;
  }
  /** @param {string} why */
  const refused = (why) => {
    print(`Not saved: ${why}. The draft is kept: ${path}`);
    return 1;
  };
  /** @type {unknown} */
  let draft;
  try {
    draft = JSON.parse(text);
  } catch (error) {
    return refused(`the draft isn't JSON (${errorText(error)})`);
  }
  if (typeof draft !== "object" || draft === null || Array.isArray(draft))
    return refused("A draft is a JSON object");
  // The command gives each coaching session a fresh random id, like the
  // app's; a draft naming one, say a copy of an earlier entry, is refused
  // rather than saved again under a new one.
  if ("id" in draft)
    return refused(
      "A draft has no id: saving gives the coaching session its own",
    );
  /** @type {CoachingSession} */
  let session;
  try {
    session = await forge.saveCoachingSession(
      /** @type {CoachingSessionDraft} */ ({
        ...draft,
        id: randomUUID(),
      }),
    );
  } catch (error) {
    return refused(errorText(error));
  }
  const savedLine = `Saved the coaching session of ${savedWhen(session.savedAt)}`;
  // The draft goes before anything else can fail: saving it a second time
  // would add a second coaching session. A missing insight file is mended
  // by the next read.
  try {
    await rm(path);
  } catch (error) {
    print(
      `${savedLine}, but couldn't remove the draft (${errorText(error)}). Delete ${path}: saving it again would add it twice. npm run coach -- read writes its insight file.`,
    );
    return 1;
  }
  let insightPath = "its insight file";
  try {
    const sessions = await forge.listCoachingSessions();
    insightPath = `insights/${fileNames(sessions).get(session.id)}`;
    await mkdir(join(folder, "insights"), { recursive: true });
    await writeFile(
      join(folder, insightPath),
      insightMarkdown(session, sessions),
    );
  } catch (error) {
    print(
      `${savedLine} and removed the draft, but couldn't write ${insightPath} (${errorText(error)}). npm run coach -- read writes it.`,
    );
    return 1;
  }
  print(`${savedLine}, wrote ${insightPath} and removed the draft.`);
  return 0;
}

/** @param {unknown} error */
const errorText = (error) =>
  error instanceof Error ? error.message : String(error);
