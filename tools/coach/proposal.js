// Coach proposals (#193; spec #191): `preview` and `apply` on the coach
// command. A proposal is a draft in the coach notes' drafts/ holding a list
// of changes to the user's set-up, each with a kind and a reason:
//
//   { "changes": [{ "kind": "new-routine", "reason": "…", "name": "…",
//                   "days": [{ "name": "…", "slots": [{ "exerciseId": "…",
//                     "sets": 3, "repMin": 8, "repMax": 12, "rir": 2 }] }] }] }
//
// Each kind's rules are in change-kinds.js. `preview` makes every change
// through the core over an in-memory copy of the set-up, so nothing reaches
// the store, and prints what would change and a fingerprint. `apply` makes
// the changes for real only while that fingerprint still matches, after
// backing up every existing document they change (backup.js, #195).
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createForge } from "../../app/js/core/forge.js";
import { SEED_LIBRARY } from "../../app/js/core/seed-library.js";
import { createMemoryStore } from "../../app/js/store/memory-store.js";
import { backUp } from "./backup.js";
import { CHANGE_KINDS } from "./change-kinds.js";
import { savedWhen } from "./insight-file.js";

/** @import { Doc, Store } from "../../app/js/core/types.js" */
/** @import { Change, Description, DocRef } from "./change-kinds.js" */

/**
 * @typedef {object} Deps
 * @property {Store} store
 * @property {() => Date} now
 * @property {string} folder The private folder for coach notes; a proposal
 *   named without a folder is in its drafts/.
 * @property {string} home The maintainer's home folder, where `apply`
 *   backs up the documents it changes (#195); tests pass a temporary one.
 * @property {(text: string) => void} print
 */

/** The collections a proposal can change: the user's set-up. */
const SET_UP = ["routines", "gyms", "customExercises", "exerciseSettings"];

/**
 * Prints what the proposal would change, each change with its reason, then
 * its fingerprint. Writes nothing to the store or the coach notes.
 * @param {string} draft
 * @param {Deps} deps
 * @returns {Promise<number>} the exit code
 */
export async function preview(draft, deps) {
  const loaded = await load(draft, deps);
  if (!loaded) return 1;
  const { text, changes } = loaded;
  const state = await readState(changes, deps);
  if (!state) return 1;
  const made = await dryRun(changes, state.copy, deps);
  if (!made) return 1;
  deps.print(
    [
      `Proposal ${basename(draft)}, ${count(changes)}. Nothing is applied yet.`,
      "",
      ...made.flatMap(({ change, description }, i) =>
        previewLines(i + 1, change, description),
      ),
      "",
      `Fingerprint: ${fingerprint(text, state.documents)}`,
    ].join("\n"),
  );
  return 0;
}

/**
 * Makes the proposal's changes in Forge, in order, if its fingerprint is
 * still the one given: neither the file nor the documents it depends on
 * have changed since the preview. It's checked whole over a copy first, so
 * a change the core refuses leaves the store untouched, and every existing
 * document it changes is backed up before the first write. Then it writes
 * the record of the proposal to proposals/ and removes the draft, so it
 * can't be applied twice. If a write fails, it stops there and says which
 * changes landed, keeping the draft (#196).
 * @param {string} draft
 * @param {string} given the fingerprint `preview` printed
 * @param {Deps} deps
 * @returns {Promise<number>} the exit code
 */
export async function apply(draft, given, deps) {
  const { folder, now, print } = deps;
  const loaded = await load(draft, deps);
  if (!loaded) return 1;
  const { path, text, changes } = loaded;
  const state = await readState(changes, deps);
  if (!state) return 1;
  if (fingerprint(text, state.documents) !== given) {
    print("Not applied: changed since the preview.");
    return 1;
  }
  // The dry run describes what `apply` reports and records, so describing
  // a change never reads the store after it's written: a read failing then
  // can't make a change that landed look as if it didn't (#196).
  const previewed = await dryRun(changes, state.copy, deps);
  if (!previewed) return 1;
  // The documents as fingerprinted, so the backup is what the user saw.
  const existing = state.documents.filter(
    (d) => d.doc !== null && state.written.has(key(d)),
  );
  /** @type {string[]} */
  let backedUp;
  try {
    const where = await backUp(
      /** @type {{ collection: string, id: string, doc: Doc }[]} */ (existing),
      { home: deps.home, name: proposalName(draft) },
    );
    backedUp = where
      ? [`Backed up ${count(existing, "document")} to ${where}.`]
      : [];
  } catch (error) {
    print(
      `Not applied: couldn't back up the documents it changes (${errorText(error)}), so nothing is written.`,
    );
    return 1;
  }
  const stopped = await writeAll(changes, deps.store, now);
  if (stopped) {
    print(
      [
        ...backedUp,
        ...stoppedLines(previewed, stopped.failed, stopped.error),
        `The draft is kept, and no record is written to proposals/: ${path}`,
      ].join("\n"),
    );
    return 1;
  }
  const applied = [
    ...backedUp,
    `Applied ${basename(draft)}, ${count(changes)}:`,
    ...headings(previewed),
  ];
  /** @type {string} */
  let record;
  try {
    record = await writeRecord(
      folder,
      recordName(draft),
      recordMarkdown(draft, previewed, now()),
    );
  } catch (error) {
    print(
      [
        ...applied,
        `Couldn't write its record to proposals/ (${errorText(error)}), so the draft is kept for its reasons: ${path}. It's applied: don't apply it again.`,
      ].join("\n"),
    );
    return 1;
  }
  try {
    await rm(path);
  } catch (error) {
    print(
      [
        ...applied,
        `Wrote ${record}, but couldn't remove the draft (${errorText(error)}). Delete ${path}: it's applied.`,
      ].join("\n"),
    );
    return 1;
  }
  print([...applied, `Wrote ${record} and removed the draft.`].join("\n"));
  return 0;
}

/**
 * "1 change", "2 changes".
 * @param {unknown[]} items
 * @param {string} [word]
 */
const count = (items, word = "change") =>
  `${items.length} ${word}${items.length === 1 ? "" : "s"}`;

/** @param {{ collection: string, id: string }} ref */
const key = ({ collection, id }) => `${collection}/${id}`;

/**
 * Reads and parses a proposal draft and checks its shape, printing why
 * when it can't be used.
 * @param {string} draft
 * @param {Deps} deps
 * @returns {Promise<{ path: string, text: string, changes: Change[] } | undefined>}
 */
async function load(draft, { folder, print }) {
  // Only a draft in drafts/: apply removes the file once applied, and auto
  // mode's grant passes any argument (#192), so no path may reach past it.
  if (basename(draft) !== draft || draft === "." || draft === "..") {
    print(
      `Not applied: name a proposal by its file name in drafts/, not ${draft}.`,
    );
    return undefined;
  }
  const path = resolve(folder, "drafts", draft);
  /** @type {string} */
  let text;
  try {
    text = await readFile(path, "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT")
      throw error;
    print(`Not applied: there's no proposal at ${path}.`);
    return undefined;
  }
  /** @type {unknown} */
  let proposal;
  try {
    proposal = JSON.parse(text);
  } catch (error) {
    print(`Not applied: the proposal isn't JSON (${errorText(error)}).`);
    return undefined;
  }
  try {
    return { path, text, changes: checked(proposal) };
  } catch (error) {
    print(`Not applied: ${errorText(error)}.`);
    return undefined;
  }
}

/**
 * A proposal's changes, once each is shaped as its kind's.
 * @param {unknown} proposal
 * @returns {Change[]}
 */
function checked(proposal) {
  const changes = /** @type {{ changes?: unknown }} */ (proposal)?.changes;
  if (!Array.isArray(changes) || !changes.length)
    throw new Error("A proposal is a JSON object with a list of changes");
  changes.forEach((change, i) => {
    const which = `change ${i + 1}`;
    if (typeof change?.reason !== "string" || !change.reason.trim())
      throw new Error(`Each change has a reason (${which})`);
    // Own keys only, so "constructor" and the like aren't kinds.
    if (!Object.hasOwn(CHANGE_KINDS, change.kind))
      throw new Error(
        `${JSON.stringify(change.kind)} isn't a kind of change a proposal can make (${which})`,
      );
    try {
      CHANGE_KINDS[change.kind].check(change);
    } catch (error) {
      throw new Error(`${errorText(error)} (${which})`, { cause: error });
    }
  });
  return changes;
}

/**
 * Reads what the proposal works on: a copy of the set-up for the dry run,
 * and the documents its changes depend on or write over, for the
 * fingerprint and the backup. `written` keys the ones they write over.
 * @param {Change[]} changes
 * @param {Deps} deps
 */
async function readState(changes, { store, print }) {
  /** @type {Map<string, DocRef>} */
  const unique = new Map();
  /** @type {Set<string>} */
  const written = new Set();
  for (const c of changes) {
    const kind = CHANGE_KINDS[c.kind];
    for (const ref of kind.dependsOn(c)) unique.set(key(ref), ref);
    for (const ref of kind.writes(c)) {
      unique.set(key(ref), ref);
      written.add(key(ref));
    }
  }
  const refs = [...unique.values()];
  try {
    const seed = Object.fromEntries(
      await Promise.all(SET_UP.map(async (c) => [c, await store.list(c)])),
    );
    const documents = await Promise.all(
      refs.map(async ({ collection, id }) => ({
        collection,
        id,
        doc: (await store.get(collection, id)) ?? null,
      })),
    );
    return { copy: createMemoryStore(seed), documents, written };
  } catch (error) {
    print(
      `Couldn't read the data: ${errorText(error)}. Is the Firebase CLI logged in (npx firebase login)?`,
    );
    return undefined;
  }
}

/**
 * @typedef {{ change: Change, description: Description }} Made
 */

/**
 * Makes every change, in order, through the core over the copy of the
 * set-up, describing each, and prints the core's reason for the first it
 * refuses.
 * @param {Change[]} changes
 * @param {Store} copy
 * @param {Deps} deps
 * @returns {Promise<Made[] | undefined>}
 */
async function dryRun(changes, copy, { now, print }) {
  const forge = createForge({ store: copy, library: SEED_LIBRARY, now });
  /** @type {Made[]} */
  const made = [];
  for (const [i, change] of changes.entries()) {
    const kind = CHANGE_KINDS[change.kind];
    try {
      const result = await kind.make(change, forge);
      made.push({ change, description: await kind.describe(result, forge) });
    } catch (error) {
      print(`Not applied: ${errorText(error)} (change ${i + 1}).`);
      return undefined;
    }
  }
  return made;
}

/**
 * Makes every change for real, in order, through the core over the store,
 * stopping at the first write that fails: nothing more is written after
 * it. A change has landed once its kind's `make` resolves. Every kind so
 * far makes one write, so a change whose `make` throws wrote nothing; a
 * kind that makes several (#197's new gym) must also say when its change
 * landed partly.
 * @param {Change[]} changes
 * @param {Store} store
 * @param {() => Date} now
 * @returns {Promise<{ failed: number, error: unknown } | undefined>}
 *   `failed` numbers the change it stopped at, from 1; nothing when every
 *   change landed
 */
async function writeAll(changes, store, now) {
  const forge = createForge({ store, library: SEED_LIBRARY, now });
  for (const [i, change] of changes.entries()) {
    try {
      await CHANGE_KINDS[change.kind].make(change, forge);
    } catch (error) {
      return { failed: i + 1, error };
    }
  }
  return undefined;
}

/**
 * Each change's heading, numbered: "1. New routine: Upper Lower, version 1".
 * @param {Made[]} made
 */
const headings = (made) =>
  made.map(({ description }, i) => `${i + 1}. ${description.heading}`);

/**
 * What `apply` says when a write fails partway: the change it stopped at
 * and why, then each change under whether it landed. The changes before
 * it landed; it and every change after it didn't, since nothing more is
 * written once one fails. The headings are the dry run's, as previewed.
 * @param {Made[]} previewed every change, as the dry run made it
 * @param {number} failed the change that stopped it, from 1
 * @param {unknown} error
 */
function stoppedLines(previewed, failed, error) {
  const numbered = headings(previewed);
  const landed = numbered.slice(0, failed - 1);
  return [
    `Applying stopped at change ${failed}: ${errorText(error)}.`,
    ...(landed.length ? ["Landed:", ...landed] : ["Landed: nothing."]),
    "Didn't land:",
    ...numbered.slice(failed - 1),
  ];
}

/**
 * The proposal's name: its draft's, without ".json". Its record and its
 * backup are named after it.
 * @param {string} draft
 */
const proposalName = (draft) => basename(draft).replace(/\.json$/i, "");

/**
 * The record's file name: the proposal's, as Markdown.
 * @param {string} draft
 */
const recordName = (draft) => `${proposalName(draft)}.md`;

/**
 * Writes the record to proposals/, making the folder when missing. An
 * earlier record of the same name is never overwritten: this one gets the
 * next free number, "-2" and on.
 * @param {string} folder
 * @param {string} name
 * @param {string} markdown
 * @returns {Promise<string>} its path in the coach notes
 */
async function writeRecord(folder, name, markdown) {
  await mkdir(join(folder, "proposals"), { recursive: true });
  for (let n = 1; ; n++) {
    const file = n === 1 ? name : name.replace(/\.md$/, `-${n}.md`);
    try {
      await writeFile(join(folder, "proposals", file), markdown, {
        flag: "wx",
      });
      return `proposals/${file}`;
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "EEXIST")
        throw error;
    }
  }
}

/**
 * The record of an applied proposal: when, from which draft, and each
 * change with its reason.
 * @param {string} draft
 * @param {Made[]} made
 * @param {Date} at
 */
function recordMarkdown(draft, made, at) {
  /** @type {string[][]} */
  const blocks = [
    [`# Proposal applied · ${savedWhen(at.toISOString())}`],
    [`From drafts/${basename(draft)}.`],
  ];
  for (const { change, description } of made) {
    blocks.push([`## ${description.heading}`], [change.reason.trim()]);
    for (const { title, lines } of description.groups) {
      if (title !== undefined) blocks.push([`### ${title}`]);
      // A routine day can have no slots, which is no list at all.
      if (lines.length) blocks.push(lines.map((line) => `- ${line}`));
    }
  }
  return blocks.map((lines) => lines.join("\n")).join("\n\n") + "\n";
}

/**
 * The fingerprint of a proposal: its file as written, and the documents
 * its changes depend on or write over as they stand. Each document's keys
 * are sorted first, since Firestore's REST API returns map fields in no
 * stable order.
 * @param {string} text
 * @param {{ collection: string, id: string, doc: Doc | null }[]} documents
 */
function fingerprint(text, documents) {
  const keyed = new Map(
    documents.map((document) => [key(document), canonical(document.doc)]),
  );
  const sorted = [...keyed].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return createHash("sha256")
    .update(JSON.stringify({ proposal: text, documents: sorted }))
    .digest("hex")
    .slice(0, 12);
}

/**
 * A value with every object's keys in sorted order, so two copies of a
 * document compare equal whatever order their fields came in.
 * @param {unknown} value
 * @returns {unknown}
 */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, canonical(/** @type {any} */ (value)[key])]),
  );
}

/**
 * One change in the dry run, numbered, with its reason.
 * @param {number} number
 * @param {Change} change
 * @param {Description} description
 */
function previewLines(number, change, { heading, groups }) {
  return [
    `${number}. ${heading}`,
    `   Why: ${change.reason.trim()}`,
    ...groups.flatMap(({ title, lines }) => [
      ...(title === undefined ? [] : [`   ${title}`]),
      ...lines.map((line) => `   - ${line}`),
    ]),
  ];
}

/** @param {unknown} error */
const errorText = (error) =>
  error instanceof Error ? error.message : String(error);
