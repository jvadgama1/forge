// The /coach skill's grant (#186): while the skill runs, Claude Code may
// read and write the coach notes without /add-dir or a prompt, and nothing
// else. The folder comes from the coach command, so the grant can't drift
// from the folder the command uses.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COACH_NOTES_FOLDER } from "../../tools/coach/coach-notes.js";

const skill = readFileSync(
  new URL("../../.claude/skills/coach/SKILL.md", import.meta.url),
  "utf8",
);

/** The rules in the skill's `allowed-tools`, as Claude Code splits them. */
function allowedTools() {
  const frontmatter = skill.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? "";
  const line = frontmatter.match(/^allowed-tools:\s*(.*)$/m)?.[1] ?? "";
  return line.match(/\w+\([^)]*\)|\S+/g) ?? [];
}

// A permission rule names an absolute Windows path as //<drive>/<path>: the
// form a headless probe proved in #186 (granted outside the project with the
// skill, refused without it).
const folder =
  "//" +
  COACH_NOTES_FOLDER.replace(/^([A-Za-z]):/, (_, drive) => drive.toLowerCase())
    .replaceAll("\\", "/")
    .replace(/\/+$/, "");

describe("the /coach skill's allowed-tools", () => {
  it("grants reading and writing anywhere in the coach notes", () => {
    expect(allowedTools()).toEqual(
      expect.arrayContaining([
        `Read(${folder}/**)`,
        `Edit(${folder}/**)`,
        `Write(${folder}/**)`,
      ]),
    );
  });

  it("grants nothing outside the coach notes", () => {
    const outside = allowedTools().filter((rule) => {
      const path = rule.match(/^\w+\((.*)\)$/)?.[1];
      return !path?.startsWith(`${folder}/`) || path.split("/").includes("..");
    });
    expect(outside).toEqual([]);
  });
});
