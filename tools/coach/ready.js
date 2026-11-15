// `npm run coach:ready` (#175): the first step of every /coach session.
// Brings the deployed checkout beside the repo to origin/main, so the
// coach command runs only reviewed code (ADR-0008). What it does is in
// deployed-checkout.js.
import { execFileSync, spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { getReady } from "./deployed-checkout.js";

// Beside the repo, outside it and outside the coach notes, so nothing the
// coach writes lands in a git folder.
const CHECKOUT = "C:\\Projects\\Health\\Exercise-deployed";

try {
  process.exitCode = await getReady({
    repo: resolve(import.meta.dirname, "..", ".."),
    checkout: CHECKOUT,
    git: (cwd, args) =>
      execFileSync("git", args, { cwd, encoding: "utf8" }).trim(),
    npmCi: async (cwd) => {
      // npm is npm.cmd on Windows, which only a shell can start; one
      // command string, as Node wants with a shell.
      const result = spawnSync("npm ci", {
        cwd,
        stdio: "inherit",
        shell: true,
      });
      if (result.status !== 0) throw new Error(`npm ci failed in ${cwd}`);
    },
    print: (text) => console.log(text),
  });
} catch (error) {
  console.error(/** @type {Error} */ (error).message);
  process.exitCode = 1;
}
