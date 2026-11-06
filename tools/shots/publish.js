// Publishes shots for a pull request body (#109):
// `npm run shots:publish -- <pr> <label> <shot…>` copies the named shots
// from .shots/<label>/ to pr/<pr>/ on the `screenshots` branch, through a
// worktree it removes afterwards, pushes, and prints the image tags.
import { execFileSync } from "node:child_process";
import { access, copyFile, mkdir, mkdtemp } from "node:fs/promises";
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
const sources = plan.files.map(({ shot }) =>
  join(runDir(label), `${shot}.png`),
);
for (const source of sources)
  await access(source).catch(() => {
    console.error(`No shot at ${source}: run \`npm run shots -- ${label}\``);
    process.exit(1);
  });

const worktree = await mkdtemp(join(tmpdir(), "forge-shots-"));
git(["fetch", "--quiet", "origin", BRANCH]);
git(["worktree", "add", "--quiet", "--detach", worktree, `origin/${BRANCH}`]);
try {
  for (const [i, { path }] of plan.files.entries()) {
    const target = join(worktree, path);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(sources[i], target);
  }
  git(["add", ...plan.files.map((f) => f.path)], worktree);
  if (git(["status", "--porcelain"], worktree)) {
    git(["commit", "--quiet", "-m", plan.message], worktree);
    git(["push", "--quiet", "origin", `HEAD:${BRANCH}`], worktree);
  } else console.error("Already published, unchanged.");
} finally {
  git(["worktree", "remove", "--force", worktree]);
}
console.log(plan.tags.join("\n"));
