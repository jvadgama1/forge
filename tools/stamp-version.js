// Stamps the app version (#129): `node tools/stamp-version.js <commit>`
// rewrites app/version.js with the commit, short, and the time now. Only the
// deploy runs it (job `deploy`), on the copy it uploads to Pages: the repo's
// copy stays the "dev" placeholder. It's the one file the deploy writes
// (ADR-0002).
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * The stamp file's source. A plain script, not a module, since the service
 * worker loads it with importScripts; the app imports it for its side effect.
 * @param {string} commit a commit hash, or "dev" for the placeholder
 * @param {string} date when the deploy ran (ISO 8601), or "" for the placeholder
 */
export function stampSource(commit, date) {
  if (commit !== "dev" && !/^[0-9a-f]{7,40}$/.test(commit))
    throw new Error(`Not a commit: "${commit}"`);
  if (date !== "" && Number.isNaN(Date.parse(date)))
    throw new Error(`Not a date: "${date}"`);
  const version = { commit: commit.slice(0, 7), date };
  return `// The app version (#129): the deploy rewrites this file with its commit
// and date (tools/stamp-version.js); the repo's copy reads "dev".
Object.assign(globalThis, {
  forgeAppVersion: { commit: ${JSON.stringify(version.commit)}, date: ${JSON.stringify(version.date)} },
});
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const commit = process.argv[2] ?? "";
  const file = fileURLToPath(new URL("../app/version.js", import.meta.url));
  writeFileSync(file, stampSource(commit, new Date().toISOString()));
  console.log(`Stamped app version ${commit.slice(0, 7)}`);
}
