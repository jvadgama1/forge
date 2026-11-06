// Publishes shots for a pull request body (#109):
// `npm run shots:publish -- <pr> <label> <shot…>` copies the named shots
// from .shots/<label>/ to pr/<pr>/ on the `screenshots` branch, through a
// worktree it removes afterwards, pushes, and prints the image tags.
import { execFileSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { BRANCH, publishPlan, repoOf } from "./publish-plan.js";
import { runDir } from "./run-dir.js";

/** @param {string[]} args @param {string} [cwd] */
const git = (args, cwd) =>
  execFileSync("git", cwd ? ["-C", cwd, ...args] : args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  }).trim();

const [pr = "", label = "", ...shots] = process.argv.slice(2);
/** @type {ReturnType<typeof publishPlan>} */
let plan;
try {
  plan = publishPlan({
    repo: repoOf(git(["remote", "get-url", "origin"])),
    pr,
    label,
    shots,
  });
} catch (error) {
  console.error(/** @type {Error} */ (error).message);
  console.error("Usage: npm run shots:publish -- <pr> <label> <shot…>");
  process.exit(1);
}

// Every shot must be there before anything touches git.
const files = plan.files.map((file) => ({
  ...file,
  source: join(runDir(label), `${file.shot}.png`),
}));
for (const { source } of files)
  await access(source).catch(() => {
    console.error(`No shot at ${source}: run \`npm run shots -- ${label}\``);
    process.exit(1);
  });

// Only the push publishes: if anything fails first, including a push
// rejected because another landed meanwhile, the commit goes with the
// worktree. The commit runs no hook: husky's hooks path is relative, and
// its hooks are generated, never on the branch. Lint and tests have no
// place on a branch of images.
const worktree = await mkdtemp(join(tmpdir(), "forge-shots-"));
let added = false;
try {
  const remote = `refs/remotes/origin/${BRANCH}`;
  git(["fetch", "--quiet", "origin", `+refs/heads/${BRANCH}:${remote}`]);
  git(["worktree", "add", "--quiet", "--detach", worktree, remote]);
  added = true;
  for (const { path, source } of files) {
    const target = join(worktree, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(source, target);
  }
  git(["add", ...files.map((f) => f.path)], worktree);
  if (git(["status", "--porcelain"], worktree)) {
    git(["commit", "--quiet", "-m", plan.message], worktree);
    git(["push", "--quiet", "origin", `HEAD:${BRANCH}`], worktree);
  } else console.error("Already published, unchanged.");
  console.log(plan.tags.join("\n"));
} catch (error) {
  console.error(/** @type {Error} */ (error).message.split("\n")[0]);
  console.error("Nothing was published.");
  process.exitCode = 1;
} finally {
  await removeWorktree();
}

// A worktree left registered is what #109 set out to stop. If git can't
// remove it (a file held open, say), the folder goes and prune drops the
// registration; failing that, it says how to finish, without undoing a
// publish that worked.
async function removeWorktree() {
  if (added)
    try {
      git(["worktree", "remove", "--force", worktree]);
      return;
    } catch {
      // Removed below instead.
    }
  await rm(worktree, { recursive: true, force: true }).catch(() => {});
  try {
    git(["worktree", "prune"]);
  } catch {
    // Said below, if the folder is still there.
  }
  if (
    await access(worktree).then(
      () => true,
      () => false,
    )
  )
    console.error(
      `Couldn't remove ${worktree}: delete it, then run \`git worktree prune\`.`,
    );
}
