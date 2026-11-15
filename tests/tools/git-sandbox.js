// The one way a test runs git, sh or any other process (#163, #166).
//
// The pre-commit hook runs the tests, and inside a hook git exports
// GIT_DIR, GIT_INDEX_FILE and others. Inherited by a test's git, they point
// it at the real repository: in a worktree, a test's commits land on the
// session's own branch, and a `git init` can rewrite the shared config.
// Lint keeps child_process out of every other file under tests/.
import { execFileSync, spawnSync } from "node:child_process";
import { join } from "node:path";

/** This process's environment without any GIT_* variable. */
export const gitFreeEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.toUpperCase().startsWith("GIT_"),
    ),
  );

/**
 * Runs git in `cwd` as a throwaway test identity, and returns its output
 * trimmed. Throws if git fails.
 * @param {string} cwd
 * @param {string[]} args
 */
export const git = (cwd, args) =>
  execFileSync(
    "git",
    ["-c", "user.name=Test", "-c", "user.email=test@example.com", ...args],
    { cwd, encoding: "utf8", env: gitFreeEnv() },
  ).trim();

/**
 * Runs `command` to completion and returns its status and output as text.
 * `env` adds to (or overrides) the GIT_*-free environment.
 * @param {string} command
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string> }} [options]
 */
export const run = (command, args, { cwd, env = {} } = {}) =>
  spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...gitFreeEnv(), ...env },
  });

/**
 * A POSIX sh by absolute path, so PATH never matters: on Windows, Git's own
 * (PowerShell has none on PATH; Git's exec path is
 * <Git>/mingw64/libexec/git-core, its sh is <Git>/bin/sh.exe); elsewhere
 * /bin/sh, which POSIX systems always have.
 */
export const SH =
  process.platform === "win32"
    ? join(
        execFileSync("git", ["--exec-path"], {
          encoding: "utf8",
          env: gitFreeEnv(),
        }).trim(),
        "..",
        "..",
        "..",
        "bin",
        "sh.exe",
      )
    : "/bin/sh";
