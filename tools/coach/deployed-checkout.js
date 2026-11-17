// Getting the /coach skill's checkout ready (#175): a detached checkout of
// origin/main beside the repo, so the coach command reads and writes with
// reviewed code only, never whatever branch the maintainer's folder has
// checked out (spec #170, story 7; ADR-0008). It's a worktree of the repo,
// as docs/agents/live-data.md step 4 makes one, moved to origin/main each
// time. The maintainer's own folder and branches are never touched: a fetch
// only moves origin's refs, and the checkout has no branch of its own.
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { existsSync } from "node:fs";

// Beside the repo, outside it and outside the coach notes, so nothing the
// coach writes lands in a git folder. The /coach skill's grant names it
// (#198), so the coach's writes run only from here.
export const DEPLOYED_CHECKOUT = "C:\\Projects\\Health\\Exercise-deployed";

/**
 * @typedef {object} Deps
 * @property {string} repo Any folder of the repo; only fetched from.
 * @property {string} checkout Where the detached checkout lives.
 * @property {(cwd: string, args: string[]) => string} git Runs git in `cwd`
 *   and returns its output trimmed; throws if git fails.
 * @property {(cwd: string) => Promise<void>} npmCi Throws if it fails.
 * @property {(text: string) => void} print
 */

/**
 * Brings the checkout to origin/main, making it if there is none, and runs
 * npm ci there only when the lockfile changed since its last good install.
 * @param {Deps} deps
 * @returns {Promise<number>} the exit code
 */
export async function getReady({ repo, checkout, git, npmCi, print }) {
  git(repo, ["fetch", "--quiet", "origin"]);
  if (!existsSync(checkout)) {
    git(repo, [
      "worktree",
      "add",
      "--quiet",
      "--detach",
      checkout,
      "origin/main",
    ]);
  } else {
    if (!isWorktreeOf(repo, checkout, git)) {
      print(
        `${checkout} isn't a checkout of this repo. Move it away and run this again.`,
      );
      return 1;
    }
    // Anything changed there is someone's work, so it's kept, not
    // overwritten.
    const changes = git(checkout, ["status", "--porcelain"]);
    if (changes) {
      print(
        `${checkout} has changes, so it was left where it is:\n${changes}\nKeep what you need elsewhere, then run git -C "${checkout}" checkout -- . and run this again.`,
      );
      return 1;
    }
    git(checkout, ["checkout", "--quiet", "--detach", "origin/main"]);
  }
  // npm ci empties node_modules first, so a failed install leaves no
  // marker and the next run installs again.
  const lockfileId = git(checkout, ["rev-parse", "HEAD:package-lock.json"]);
  const marker = join(checkout, "node_modules", ".forge-lockfile");
  const installedId = await readFile(marker, "utf8").catch(() => undefined);
  const install = installedId !== lockfileId;
  if (install) {
    await npmCi(checkout);
    await mkdir(join(checkout, "node_modules"), { recursive: true });
    await writeFile(marker, lockfileId);
  }
  const commit = git(checkout, ["log", "-1", "--format=%h %s"]);
  print(
    `Deployed checkout ready at ${commit} in ${checkout} (npm ci ${install ? "ran" : "not needed: the lockfile is unchanged"}).`,
  );
  return 0;
}

/**
 * Whether `folder` is the top of a worktree of the same repo as `repo`, so
 * a folder that only happens to have the name is never moved.
 * @param {string} repo
 * @param {string} folder
 * @param {Deps["git"]} git
 */
function isWorktreeOf(repo, folder, git) {
  /** @param {string} cwd */
  const commonDir = (cwd) =>
    resolve(cwd, git(cwd, ["rev-parse", "--git-common-dir"]));
  try {
    const top = git(folder, ["rev-parse", "--show-toplevel"]);
    return (
      resolve(top) === resolve(folder) && commonDir(folder) === commonDir(repo)
    );
  } catch {
    return false;
  }
}
