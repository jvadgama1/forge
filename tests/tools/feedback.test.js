import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { runFeedback } from "../../tools/feedback/run.js";

// Where the owner's feedback lives in the live project's REST API.
const COLLECTION =
  "https://firestore.googleapis.com/v1/projects/forge-eb613/databases/(default)/documents/users/x98Yvmbfj6eBxKbsluJOC3HkcBJ3/feedback";

/**
 * A made-up feedback document as Firestore's REST API returns it.
 * @param {string} id
 * @param {Record<string, object>} fields
 */
const restDoc = (id, fields) => ({
  name: `projects/forge-eb613/databases/(default)/documents/users/x98Yvmbfj6eBxKbsluJOC3HkcBJ3/feedback/${id}`,
  fields,
});

const version = (/** @type {string} */ commit) => ({
  mapValue: {
    fields: {
      commit: { stringValue: commit },
      date: { stringValue: "2026-11-08T12:00:00.000Z" },
    },
  },
});

/**
 * Runs the command against a stand-in for Firestore's REST API that answers
 * each request with the next of `answers`, recording what was asked.
 * @param {string[]} args
 * @param {{ status?: number, body: object }[]} answers
 */
async function run(args, answers) {
  /** @type {{ url: string, method: string, headers: Record<string, string>, body?: unknown }[]} */
  const requests = [];
  /** @type {string[]} */
  const printed = [];
  const code = await runFeedback(args, {
    token: async () => "test-token",
    fetch: async (url, init = {}) => {
      requests.push({
        url: String(url),
        method: init.method ?? "GET",
        headers: /** @type {Record<string, string>} */ (init.headers),
        ...(init.body !== undefined && {
          body: JSON.parse(String(init.body)),
        }),
      });
      const answer = answers.shift();
      if (!answer) throw new Error("An unexpected request");
      return new Response(JSON.stringify(answer.body), {
        status: answer.status ?? 200,
      });
    },
    print: (text) => printed.push(text),
  });
  return { code, requests, output: printed.join("\n") };
}

describe("npm run feedback (#124)", () => {
  it("prints the unfiled items, oldest first, with when, the version and any workout", async () => {
    const { code, requests, output } = await run(
      [],
      [
        {
          body: {
            documents: [
              restDoc("fb-2", {
                id: { stringValue: "fb-2" },
                text: { stringValue: "Made-up second\n\nwith a gap" },
                sentAt: { stringValue: "2026-11-08T19:05:00.000Z" },
                appVersion: version("0a1b2c3"),
              }),
              restDoc("fb-filed", {
                id: { stringValue: "fb-filed" },
                text: { stringValue: "Made-up, already filed" },
                sentAt: { stringValue: "2026-11-07T09:00:00.000Z" },
                appVersion: version("0a1b2c3"),
                filed: { integerValue: "131" },
              }),
            ],
            nextPageToken: "page-2",
          },
        },
        {
          body: {
            documents: [
              restDoc("fb-1", {
                id: { stringValue: "fb-1" },
                text: { stringValue: "Made-up first" },
                sentAt: { stringValue: "2026-11-08T18:32:14.000Z" },
                workoutId: { stringValue: "w-1" },
                appVersion: {
                  mapValue: {
                    fields: {
                      commit: { stringValue: "dev" },
                      date: { stringValue: "" },
                    },
                  },
                },
              }),
            ],
          },
        },
      ],
    );
    expect(code).toBe(0);
    expect(requests).toEqual([
      {
        url: `${COLLECTION}?pageSize=300`,
        method: "GET",
        headers: { Authorization: "Bearer test-token" },
      },
      {
        url: `${COLLECTION}?pageSize=300&pageToken=page-2`,
        method: "GET",
        headers: { Authorization: "Bearer test-token" },
      },
    ]);
    expect(output).toBe(
      [
        "2 unfiled feedback items, oldest first.",
        "",
        "fb-1 · 2026-11-08T18:32:14.000Z · version dev · during workout w-1",
        "  Made-up first",
        "",
        "fb-2 · 2026-11-08T19:05:00.000Z · version 0a1b2c3",
        "  Made-up second",
        "  ",
        "  with a gap",
        "",
        "Mark one filed: npm run feedback -- --filed <itemId> <issueNumber>",
      ].join("\n"),
    );
  });

  it("says so when there's nothing unfiled", async () => {
    const { code, output } = await run([], [{ body: {} }]);
    expect(code).toBe(0);
    expect(output).toBe("No unfiled feedback.");
  });

  it("with --filed, changes only that item's filed field, and only if it exists", async () => {
    const { code, requests, output } = await run(
      ["--filed", "fb-1", "131"],
      [{ body: restDoc("fb-1", { filed: { integerValue: "131" } }) }],
    );
    expect(code).toBe(0);
    expect(requests).toEqual([
      {
        url: `${COLLECTION}/fb-1?updateMask.fieldPaths=filed&mask.fieldPaths=filed&currentDocument.exists=true`,
        method: "PATCH",
        headers: {
          Authorization: "Bearer test-token",
          "Content-Type": "application/json",
        },
        body: { fields: { filed: { integerValue: "131" } } },
      },
    ]);
    expect(output).toBe("Marked fb-1 filed as #131.");
  });

  it("with --filed, says so when there's no such item", async () => {
    const { code, output } = await run(
      ["--filed", "fb-gone", "131"],
      [{ status: 404, body: { error: { code: 404, message: "No document" } } }],
    );
    expect(code).toBe(1);
    expect(output).toBe("No feedback item fb-gone.");
  });

  it("reports a refusal from Firestore without its body", async () => {
    const { code, output } = await run(
      [],
      [{ status: 401, body: { error: { message: "Bad token" } } }],
    );
    expect(code).toBe(1);
    expect(output).toBe(
      "Firestore answered 401: Bad token. Is the Firebase CLI logged in (npx firebase login)?",
    );
  });

  it.each([
    [["--filed"]],
    [["--filed", "fb-1"]],
    [["--filed", "fb-1", "abc"]],
    [["--filed", "fb-1", "0"]],
    [["--filed", "fb-1", "12.5"]],
    [["--filed", "../settings/user", "12"]],
    [["--filed", "fb-1", "12", "extra"]],
    [["--list"]],
  ])("refuses %j with the usage, asking nothing", async (args) => {
    const { code, requests, output } = await run(args, []);
    expect(code).toBe(1);
    expect(requests).toEqual([]);
    expect(output).toBe(
      [
        "Usage: npm run feedback                      print unfiled feedback",
        "       npm run feedback -- --filed <itemId> <issueNumber>",
        "                                             mark one item filed",
      ].join("\n"),
    );
  });

  it("never writes to a file: feedback text stays out of the repo (ADR-0005)", () => {
    for (const file of ["run.js", "feedback.js"]) {
      const source = readFileSync(
        new URL(`../../tools/feedback/${file}`, import.meta.url),
        "utf8",
      );
      expect(source).not.toMatch(/node:fs|writeFile|appendFile|WriteStream/);
    }
  });
});
