// What publishing shots to a pull request does (#109), apart from git: where
// each shot goes on the `screenshots` branch and the image tags for the
// body. A shot is named for its run, so a before and an after sit side by
// side in one folder.
import { LABEL } from "./run-dir.js";

/** The branch the images live on, linked from pull request bodies. */
export const BRANCH = "screenshots";

/**
 * @param {{ repo: string, pr: string, label: string, shots: string[] }} args
 *   `repo` as owner/name; `pr` the pull request number; `label` the run in
 *   .shots/; `shots` the shot names, with or without `.png`
 */
export function publishPlan({ repo, pr, label, shots }) {
  if (!/^[1-9]\d*$/.test(pr))
    throw new Error(`Not a pull request number: "${pr}"`);
  if (!LABEL.test(label)) throw new Error(`Not a shots label: "${label}"`);
  if (!shots.length) throw new Error("Name at least one shot to publish");
  const names = shots.map((shot) => shot.replace(/\.png$/, ""));
  for (const name of names)
    if (!LABEL.test(name)) throw new Error(`Not a shot name: "${name}"`);

  const files = names.map((shot) => ({
    shot,
    path: `pr/${pr}/${label}-${shot}.png`,
  }));
  return {
    files,
    message: `chore: screenshots for PR #${pr}`,
    tags: files.map(
      ({ shot, path }) =>
        `<img src="https://raw.githubusercontent.com/${repo}/${BRANCH}/${path}" width="200" alt="${label}: ${shot}">`,
    ),
  };
}

/**
 * The owner/name of the GitHub repository at a remote URL.
 * @param {string} url
 */
export function repoOf(url) {
  const repo = url.match(
    /^(?:https:\/\/github\.com\/|git@github\.com:)([\w.-]+\/[\w.-]+?)(?:\.git)?$/,
  )?.[1];
  if (!repo) throw new Error(`Not a GitHub remote: ${url}`);
  return repo;
}
