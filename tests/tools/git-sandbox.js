// For tests that run git or sh in a throwaway repo (#163).
//
// The pre-commit hook runs the tests, and inside a hook git exports
// GIT_DIR, GIT_INDEX_FILE and others. Inherited by a test's git, they point
// it at the real repository: in a worktree, a test's commits land on the
// session's own branch, and a `git init` can rewrite the shared config.
import { execFileSync } from "node:child_process";
import { join } from "node:path";

/** This process's environment without any GIT_* variable. */
export const gitFreeEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.toUpperCase().startsWith("GIT_"),
    ),
  );

/**
 * A POSIX sh: on Windows, Git's own (PowerShell has none on PATH; Git's
 * exec path is <Git>/mingw64/libexec/git-core, its sh is <Git>/bin/sh.exe).
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
    : "sh";
