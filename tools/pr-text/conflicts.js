// A pull request that is only part of an issue must not close it (#153).
// GitHub closes an issue on a closing keyword before its number anywhere in
// the PR's title, body or (once squash-merged) commit messages, even in a
// sentence like "doesn't close #142". This finds those, for every issue the
// body names with `Part of #N`.

/**
 * @typedef {object} PrText
 * @property {string} title
 * @property {string} body
 * @property {{ sha: string, message: string }[]} commits
 */

/**
 * @typedef {object} Conflict
 * @property {number} issue
 * @property {string} keyword as written, lower-cased
 * @property {string} where "title", "body" or "commit <short sha>"
 */

const PART_OF = /\bpart of #(\d+)/gi;
const CLOSING =
  /\b(close|closes|closed|fix|fixes|fixed|resolve|resolves|resolved):?\s*#(\d+)/gi;

/**
 * Every closing keyword aimed at an issue the body says the PR is only part
 * of.
 * @param {PrText} pr
 * @returns {Conflict[]}
 */
export function findClosingConflicts({ title, body, commits }) {
  const partOf = new Set([...body.matchAll(PART_OF)].map((m) => Number(m[1])));
  const places = [
    { where: "title", text: title },
    { where: "body", text: body },
    ...commits.map((c) => ({
      where: `commit ${c.sha.slice(0, 7)}`,
      text: c.message,
    })),
  ];
  return places.flatMap(({ where, text }) =>
    [...text.matchAll(CLOSING)]
      .filter((m) => partOf.has(Number(m[2])))
      .map((m) => ({
        issue: Number(m[2]),
        keyword: m[1].toLowerCase(),
        where,
      })),
  );
}
