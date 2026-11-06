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

  it("leaves test code free to read the server", async () => {
    const messages = await lint(
      "export const read = (sdk, ref) => sdk.getDoc(ref);\n",
      "tests/store/firestore-store.emulator.test.js",
    );
    expect(messages).toEqual([]);
  });
});
