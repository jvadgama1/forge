// A Store over Firestore's REST API (#173), for Node tools such as the coach
// command, so they run the real Forge core against Firestore without the
// browser SDK. It lives under tools/, not app/, since the app never loads it.
/** @import { Doc, Store } from "../../app/js/core/types.js" */

/**
 * A Store backed by Firestore's REST API: every collection lives under
 * users/{uid}, as with the Firestore store. Unlike that store, every call
 * waits for the server, and a request Firestore refuses rejects with an
 * error saying what it answered.
 *
 * It is given where Firestore is and how to sign in, so tests point it at the
 * emulator and never the live project.
 *
 * @param {{
 *   baseUrl: string,
 *   uid: string,
 *   token: () => Promise<string>,
 *   fetch?: typeof globalThis.fetch,
 *   pageSize?: number,
 * }} options
 *   - `baseUrl`: the database's documents root, e.g.
 *     `https://firestore.googleapis.com/v1/projects/<project>/databases/(default)/documents`.
 *   - `uid`: the account whose data this is.
 *   - `token`: an access token for each request, sent as a bearer token and
 *     never printed; refreshing an expired one is the source's job.
 *   - `pageSize`: how many documents `list` asks for at a time.
 * @returns {Store}
 */
export function createRestStore({
  baseUrl,
  uid,
  token,
  fetch: send = globalThis.fetch,
  pageSize = 300,
}) {
  const root = `${baseUrl.replace(/\/+$/, "")}/users/${encodeURIComponent(uid)}`;

  /**
   * One request for a path under users/{uid}. It resolves with the answer
   * when Firestore accepts it, or with undefined for a 404 when `missing` is
   * allowed, and otherwise rejects with what Firestore answered.
   * @param {string} method
   * @param {string[]} path the collection, then any document id
   * @param {{ query?: string, body?: object, missing?: boolean }} [options]
   * @returns {Promise<Response | undefined>}
   */
  async function request(method, path, { query, body, missing } = {}) {
    const target = [root, ...path.map(encodeURIComponent)].join("/");
    const answer = await send(query ? `${target}?${query}` : target, {
      method,
      headers: {
        Authorization: `Bearer ${await token()}`,
        ...(body && { "Content-Type": "application/json" }),
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    if (missing && answer.status === 404) return undefined;
    if (!answer.ok) throw await refusal(answer, `${method} ${path.join("/")}`);
    return answer;
  }

  return {
    async get(collection, id) {
      const answer = await request("GET", [collection, id], { missing: true });
      return answer && toDoc(await answer.json());
    },
    async list(collection) {
      /** @type {Doc[]} */
      const docs = [];
      let pageToken = "";
      do {
        const query = `pageSize=${pageSize}${pageToken && `&pageToken=${encodeURIComponent(pageToken)}`}`;
        const answer = await request("GET", [collection], { query });
        const body = await /** @type {Response} */ (answer).json();
        for (const doc of body.documents ?? []) docs.push(toDoc(doc));
        pageToken = body.nextPageToken ?? "";
      } while (pageToken);
      return docs;
    },
    async put(collection, doc) {
      // A PATCH with no update mask replaces the whole document, or makes it.
      await request("PATCH", [collection, doc.id], {
        body: { fields: toFields(plain(doc)) },
      });
    },
    async remove(collection, id) {
      // Deleting a missing document succeeds.
      await request("DELETE", [collection, id]);
    },
  };
}

/**
 * Says what Firestore refused, from its status and error message alone: the
 * request, and so the token, is never part of it.
 * @param {Response} answer
 * @param {string} what
 */
async function refusal(answer, what) {
  const body = await answer.json().catch(() => ({}));
  const status = [answer.status, body.error?.status].filter(Boolean).join(" ");
  const message = (body.error?.message ?? answer.statusText).trim();
  return new Error(`Firestore answered ${status} to ${what}: ${message}`);
}

/**
 * Copies a document as plain data: fields set to undefined are dropped, as
 * the other stores do.
 * @param {Doc} doc
 * @returns {Doc}
 */
const plain = (doc) => JSON.parse(JSON.stringify(doc));

/**
 * A plain value in Firestore's REST form. Numbers are typed as the app's
 * Firestore SDK types them: a safe whole number is an integer, anything else
 * a double. Sending every number as a double would turn the app's integers
 * into doubles (docs/agents/live-data.md, step 7).
 * @param {unknown} value
 * @returns {object}
 */
function toValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number")
    return Number.isSafeInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value };
  if (Array.isArray(value))
    return { arrayValue: { values: value.map(toValue) } };
  return {
    mapValue: {
      fields: toFields(/** @type {Record<string, unknown>} */ (value)),
    },
  };
}

/** @param {Record<string, unknown>} data */
const toFields = (data) =>
  Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toValue(v)]));

/**
 * A Firestore REST value as the plain data that was stored. A type the app
 * never stores is an error rather than a field quietly dropped, which a later
 * put would then delete.
 * @param {any} value
 * @returns {unknown}
 */
function fromValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return Number(value.doubleValue);
  if ("booleanValue" in value) return value.booleanValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value)
    return (value.arrayValue.values ?? []).map(fromValue);
  if ("mapValue" in value) return fromFields(value.mapValue.fields ?? {});
  throw new Error(
    `Firestore returned a value the Forge store doesn't keep: ${Object.keys(value).join(", ")}`,
  );
}

/** @param {Record<string, unknown>} fields */
const fromFields = (fields) =>
  Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromValue(value)]),
  );

/**
 * @param {{ fields?: Record<string, unknown> }} restDoc
 * @returns {Doc}
 */
const toDoc = (restDoc) =>
  /** @type {Doc} */ (fromFields(restDoc.fields ?? {}));
