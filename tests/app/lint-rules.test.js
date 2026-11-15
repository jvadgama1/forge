import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

// Rules in eslint.config.js that guard a decision, checked on snippets so a
// config edit can't quietly drop one.

const eslint = new ESLint();

/**
 * The messages ESLint reports for `code` as if it were the file at `path`.
 * @param {string} code
 * @param {string} path relative to the repo root
 */
async function lint(code, path) {
  const [result] = await eslint.lintText(code, { filePath: path });
  return result.messages.map(({ ruleId, message }) => ({ ruleId, message }));
}

describe("ADR-0007: reads come from a live copy", () => {
  const oneOffReads = [
    "getDoc",
    "getDocs",
    "getDocFromServer",
    "getDocsFromServer",
    "getDocFromCache",
    "getDocsFromCache",
  ];

  it.each(oneOffReads)(
    "fails app code that makes a one-off read with %s",
    async (read) => {
      const messages = await lint(
        `export const read = (sdk, ref) => sdk.${read}(ref);\n`,
        "app/js/store/firestore-store.js",
      );
      expect(messages).toEqual([
        {
          ruleId: "no-restricted-properties",
          message: expect.stringContaining("ADR-0007"),
        },
      ]);
    },
  );

  it("fails a one-off read taken off the SDK by destructuring", async () => {
    const messages = await lint(
      "export const read = ({ getDoc }, ref) => getDoc(ref);\n",
      "app/js/store/firestore-store.js",
    );
    expect(messages.map((m) => m.ruleId)).toEqual(["no-restricted-properties"]);
  });

  it.each([
    "https://www.gstatic.com/firebasejs/13.0.0/firebase-firestore.js",
    "firebase/firestore",
  ])("fails app code that imports a one-off read from %s", async (from) => {
    const messages = await lint(
      `import { getDocs } from "${from}";\nexport const read = getDocs;\n`,
      "app/js/store/firestore-store.js",
    );
    expect(messages).toEqual([
      {
        ruleId: "no-restricted-imports",
        message: expect.stringContaining("ADR-0007"),
      },
    ]);
  });

  it("leaves test code free to read the server", async () => {
    const messages = await lint(
      "export const read = (sdk, ref) => sdk.getDoc(ref);\n",
      "tests/store/firestore-store.emulator.test.js",
    );
    expect(messages).toEqual([]);
  });
});

// A test's git, run inside the pre-commit hook, inherits GIT_DIR and
// friends unless the git sandbox strips them (#163, #166).
describe("#166: tests run processes only through the git sandbox", () => {
  /** @param {string} from */
  const importsChildProcess = (from) =>
    `import { spawnSync } from "${from}";\nexport const run = spawnSync;\n`;

  it.each([
    ["node:child_process", "tests/tools/pr-text-run.test.js"],
    ["child_process", "tests/tools/pr-text-run.test.js"],
    ["node:child_process", "tests/rules/firestore.rules.emulator.test.js"],
  ])("fails a test that imports %s itself (%s)", async (from, path) => {
    const messages = await lint(importsChildProcess(from), path);
    expect(messages).toEqual([
      {
        ruleId: "no-restricted-imports",
        message: expect.stringMatching(/git-sandbox\.js.*#163/),
      },
    ]);
  });

  it("lets the sandbox itself import child_process", async () => {
    const messages = await lint(
      importsChildProcess("node:child_process"),
      "tests/tools/git-sandbox.js",
    );
    expect(messages).toEqual([]);
  });

  it("leaves tools free to run git in the real repo", async () => {
    const messages = await lint(
      importsChildProcess("node:child_process"),
      "tools/pr-text/pr-text.js",
    );
    expect(messages).toEqual([]);
  });
});
