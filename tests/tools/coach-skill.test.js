// The /coach skill's grant (#186, #198): while the skill runs, Claude Code
// may read and write the coach notes without /add-dir or a prompt, and run
// exactly the coach command's two live writes, `apply` and `save`, from the
// deployed checkout, and nothing else. The folder comes from the coach
// command, so the grant can't drift from the folder the command uses.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { COACH_NOTES_FOLDER } from "../../tools/coach/coach-notes.js";
import { DEPLOYED_CHECKOUT } from "../../tools/coach/deployed-checkout.js";

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

// The two write rules, word for word as the #192 probe pinned them in auto
// mode (ADR-0009). A Bash rule is a prefix match on the whole command, so
// any looser spelling would let through more than these two commands.
const WRITE_RULES = [
  "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply *)",
  "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- save *)",
];

/**
 * The rules among `rules` that the grant doesn't allow: anything but
 * reading and writing inside the coach notes, and the two write rules.
 * @param {string[]} rules
 */
function ungranted(rules) {
  return rules.filter((rule) => {
    if (WRITE_RULES.includes(rule)) return false;
    const path = rule.match(/^(?:Read|Edit|Write)\((.*)\)$/)?.[1];
    return !path?.startsWith(`${folder}/`) || path.split("/").includes("..");
  });
}

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

  it("grants the coach command's apply and save from the deployed checkout", () => {
    expect(allowedTools().filter((rule) => rule.startsWith("Bash"))).toEqual(
      WRITE_RULES,
    );
  });

  it("names the checkout that npm run coach:ready keeps at origin/main", () => {
    const checkout = DEPLOYED_CHECKOUT.replaceAll("\\", "/");
    for (const rule of WRITE_RULES)
      expect(rule).toContain(`npm --prefix ${checkout} run coach -- `);
  });

  it("grants nothing else", () => {
    expect(ungranted(allowedTools())).toEqual([]);
  });

  // Each is refused by the test above, were the skill to hold it.
  it.each([
    ["every Bash command", "Bash"],
    ["every Bash command, by wildcard", "Bash(*)"],
    ["every npm command", "Bash(npm *)"],
    [
      "every coach command",
      "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach *)",
    ],
    [
      "every coach command, in the legacy form",
      "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach:*)",
    ],
    [
      "every coach subcommand",
      "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- *)",
    ],
    [
      "apply in the legacy form",
      "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply:*)",
    ],
    [
      "anything starting apply, such as apply-everything",
      "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run coach -- apply*)",
    ],
    [
      "apply from the working tree",
      "Bash(npm --prefix C:/Projects/Health/Exercise run coach -- apply *)",
    ],
    ["apply from whatever folder it runs in", "Bash(npm run coach -- apply *)"],
    [
      "apply from the checkout spelled with backslashes",
      "Bash(npm --prefix C:\\Projects\\Health\\Exercise-deployed run coach -- apply *)",
    ],
    [
      "another write from the checkout",
      "Bash(npm --prefix C:/Projects/Health/Exercise-deployed run deploy:rules)",
    ],
    ["the coach notes as a Bash command", `Bash(${folder}/**)`],
    ["a folder above the coach notes", "Read(//c/Projects/Health/**)"],
    ["a way out of the coach notes", `Edit(${folder}/../Exercise/**)`],
  ])("a rule granting %s isn't in the grant", (_, rule) => {
    expect(ungranted([rule])).toEqual([rule]);
  });
});
