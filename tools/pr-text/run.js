// The CI step for #153: fails a pull request whose title, body or commits
// would close an issue its body says it is only part of.
//
// The PR's text is written by whoever opens it, so it is read as data only:
// the title and body from the event file GitHub Actions writes
// (GITHUB_EVENT_PATH), the commit messages from git through execFileSync
// (no shell). None of it ever reaches a shell or a workflow expression.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { findClosingConflicts } from "./conflicts.js";

const { pull_request: pr } = JSON.parse(
  readFileSync(process.env.GITHUB_EVENT_PATH ?? "", "utf8"),
);

// Each commit as "<sha>\0<message>", records split by \x1e.
const log = execFileSync(
  "git",
  ["log", "--format=%H%x00%B%x1e", `${pr.base.sha}..${pr.head.sha}`],
  { encoding: "utf8" },
);
const commits = log
  .split("\x1e")
  .map((record) => record.trim())
  .filter(Boolean)
  .map((record) => {
    const [sha, message] = record.split("\0");
    return { sha, message };
  });

const conflicts = findClosingConflicts({
  title: pr.title ?? "",
  body: pr.body ?? "",
  commits,
});
for (const { issue, keyword, where } of conflicts)
  console.error(
    `${where}: "${keyword} #${issue}" would close #${issue}, which the body says this PR is only part of. Reword it, e.g. "only part of #${issue}".`,
  );
if (conflicts.length) process.exitCode = 1;
else console.log("No closing keyword for an issue this PR is only part of.");
