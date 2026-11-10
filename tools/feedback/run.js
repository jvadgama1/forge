// What `npm run feedback` does (#124), with Firestore's REST API and the
// sign-in passed in, so tests run it against a stand-in and never the live
// project. It reads the owner's feedback and prints it; with --filed it
// changes one item's filed field, the only write it makes. Feedback text is
// only ever printed, never saved to a file: it is personal (ADR-0005).
import { FIREBASE_CONFIG, OWNER_UID } from "../../app/js/firebase-config.js";

/** @import { FeedbackItem } from "../../app/js/core/types.js" */

const COLLECTION = `https://firestore.googleapis.com/v1/projects/${FIREBASE_CONFIG.projectId}/databases/(default)/documents/users/${OWNER_UID}/feedback`;

const USAGE = [
  "Usage: npm run feedback                      print unfiled feedback",
  "       npm run feedback -- --filed <itemId> <issueNumber>",
  "                                             mark one item filed",
].join("\n");

// An item id is the app's random UUID; nothing else may reach the URL.
const ITEM_ID = /^[\w-]+$/;
const ISSUE = /^[1-9]\d*$/;

/**
 * @typedef {object} Deps
 * @property {() => Promise<string>} token An access token for the
 *   maintainer's Firebase CLI login.
 * @property {typeof fetch} fetch
 * @property {(text: string) => void} print
 */

/**
 * @param {string[]} args What followed `npm run feedback --`.
 * @param {Deps} deps
 * @returns {Promise<number>} the exit code
 */
export async function runFeedback(args, deps) {
  if (args.length === 0) return printUnfiled(deps);
  const [flag, id = "", issue = "", ...rest] = args;
  if (
    flag === "--filed" &&
    ITEM_ID.test(id) &&
    ISSUE.test(issue) &&
    !rest.length
  )
    return markFiled(id, Number(issue), deps);
  deps.print(USAGE);
  return 1;
}

/** @param {Deps} deps */
async function printUnfiled(deps) {
  /** @type {FeedbackItem[]} */
  const items = [];
  let page = "";
  do {
    const answer = await request(
      `${COLLECTION}?pageSize=300${page && `&pageToken=${encodeURIComponent(page)}`}`,
      {},
      deps,
    );
    if (!answer.ok) return refused(answer, deps);
    const body = await answer.json();
    for (const doc of body.documents ?? [])
      items.push(/** @type {FeedbackItem} */ (fromFields(doc.fields ?? {})));
    page = body.nextPageToken ?? "";
  } while (page);

  const unfiled = items
    .filter((item) => item.filed === undefined)
    .sort((a, b) => (a.sentAt < b.sentAt ? -1 : a.sentAt > b.sentAt ? 1 : 0));
  if (!unfiled.length) {
    deps.print("No unfiled feedback.");
    return 0;
  }
  deps.print(
    [
      `${unfiled.length} unfiled feedback ${unfiled.length === 1 ? "item" : "items"}, oldest first.`,
      "",
      ...unfiled.flatMap((item) => [...itemLines(item), ""]),
      "Mark one filed: npm run feedback -- --filed <itemId> <issueNumber>",
    ].join("\n"),
  );
  return 0;
}

/**
 * One item: a heading line, then its text indented, so where one ends reads
 * plainly even when the text has blank lines.
 * @param {FeedbackItem} item
 */
function itemLines({ id, sentAt, appVersion, workoutId, text }) {
  const heading = [id, sentAt, `version ${appVersion?.commit ?? "unknown"}`];
  if (workoutId) heading.push(`during workout ${workoutId}`);
  return [heading.join(" · "), ...text.split("\n").map((line) => `  ${line}`)];
}

/**
 * Sets one item's filed field and nothing else: the update mask names only
 * it, the response mask returns only it, and the precondition stops a
 * mistyped id from making a new document.
 * @param {string} id
 * @param {number} issue
 * @param {Deps} deps
 */
async function markFiled(id, issue, deps) {
  const answer = await request(
    `${COLLECTION}/${id}?updateMask.fieldPaths=filed&mask.fieldPaths=filed&currentDocument.exists=true`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        fields: { filed: { integerValue: String(issue) } },
      }),
    },
    deps,
  );
  if (answer.status === 404) {
    deps.print(`No feedback item ${id}.`);
    return 1;
  }
  if (!answer.ok) return refused(answer, deps);
  deps.print(`Marked ${id} filed as #${issue}.`);
  return 0;
}

/**
 * @param {string} url
 * @param {RequestInit & { headers?: Record<string, string> }} init
 * @param {Deps} deps
 */
async function request(url, init, deps) {
  return deps.fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${await deps.token()}`, ...init.headers },
  });
}

/**
 * Says what Firestore refused, from its error message alone.
 * @param {Response} answer
 * @param {Deps} deps
 */
async function refused(answer, deps) {
  const body = await answer.json().catch(() => ({}));
  deps.print(
    `Firestore answered ${answer.status}: ${body.error?.message ?? answer.statusText}. Is the Firebase CLI logged in (npx firebase login)?`,
  );
  return 1;
}

/**
 * A Firestore REST value as the plain data the app stored.
 * @param {any} value
 * @returns {unknown}
 */
function fromValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value)
    return (value.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in value) return fromFields(value.mapValue.fields ?? {});
  return undefined;
}

/** @param {Record<string, unknown>} fields */
function fromFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromValue(value)]),
  );
}
