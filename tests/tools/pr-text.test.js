import { describe, expect, it } from "vitest";
import { findClosingConflicts } from "../../tools/pr-text/conflicts.js";

describe("Part of #N against closing keywords (#153)", () => {
  it("passes a PR that says Part of and no closing keyword for it", () => {
    expect(
      findClosingConflicts({
        title: "feat: add curl-bar exercises",
        body: "Part of #142\n\nLive writes come after merge.",
        commits: [],
      }),
    ).toEqual([]);
  });

  it("fails a body that says Part of #142 and also 'doesn't close #142'", () => {
    expect(
      findClosingConflicts({
        title: "feat: add curl-bar exercises",
        body: "Part of #142\n\nThis PR doesn't close #142.",
        commits: [],
      }),
    ).toEqual([{ issue: 142, keyword: "close", where: "body" }]);
  });

  it("passes a closing keyword for a different issue", () => {
    expect(
      findClosingConflicts({
        title: "fix: keep RIR whole",
        body: "Part of #142\n\nCloses #141",
        commits: [],
      }),
    ).toEqual([]);
  });

  it("fails a closing keyword in the title or a commit message", () => {
    expect(
      findClosingConflicts({
        title: "fix: curl bar, fixes #142",
        body: "Part of #142",
        commits: [
          {
            sha: "0123456789abcdef",
            message: "feat: add bars\n\nResolves #142",
          },
          { sha: "fedcba9876543210", message: "test: cover bars" },
        ],
      }),
    ).toEqual([
      { issue: 142, keyword: "fixes", where: "title" },
      { issue: 142, keyword: "resolves", where: "commit 0123456" },
    ]);
  });

  it("matches any case, and a colon after the keyword, spaced or not", () => {
    expect(
      findClosingConflicts({
        title: "",
        body: "part of #142\n\nFIXES: #142\nClosed #142\nresolve:#142",
        commits: [],
      }),
    ).toEqual([
      { issue: 142, keyword: "fixes", where: "body" },
      { issue: 142, keyword: "closed", where: "body" },
      { issue: 142, keyword: "resolve", where: "body" },
    ]);
  });

  it("doesn't read #1420 as #142, or 'disclose' as 'close'", () => {
    expect(
      findClosingConflicts({
        title: "",
        body: "Part of #142\n\nCloses #1420\nWe disclose #142 later.",
        commits: [],
      }),
    ).toEqual([]);
  });

  it("matches hostile text like any other text", () => {
    const hostile = '$(touch pwned) `rm -rf ~` "; exit 0; " closes #7';
    expect(
      findClosingConflicts({
        title: hostile,
        body: `Part of #7\n${hostile}`,
        commits: [{ sha: "aaaaaaa1", message: hostile }],
      }),
    ).toEqual([
      { issue: 7, keyword: "closes", where: "title" },
      { issue: 7, keyword: "closes", where: "body" },
      { issue: 7, keyword: "closes", where: "commit aaaaaaa" },
    ]);
  });
});
