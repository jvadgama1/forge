import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Firebase SDK version", () => {
  it("loads the same version from the CDN as the npm package the types and tests use", () => {
    const sdk = readFileSync(
      new URL("../../app/js/firebase-sdk.js", import.meta.url),
      "utf8",
    );
    const pkg = JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf8"),
    );
    const cdnVersions = [
      ...sdk.matchAll(/gstatic\.com\/firebasejs\/([\d.]+)\//g),
    ].map((m) => m[1]);
    expect(cdnVersions.length).toBeGreaterThan(0);
    expect(new Set(cdnVersions)).toEqual(
      new Set([pkg.devDependencies.firebase]),
    );
  });
});
