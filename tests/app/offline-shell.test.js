import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { appFiles, shellList } from "./worker-scope.js";

/** @param {string} file under app/ */
const source = (file) =>
  readFileSync(new URL(`../../app/${file}`, import.meta.url), "utf8");

describe("offline app shell", () => {
  it("lists every app file in the service worker's SHELL, so nothing is missing offline", () => {
    const missing = appFiles()
      .filter((file) => file !== "sw.js")
      .filter((file) => !shellList().includes(file));
    expect(missing).toEqual([]);
  });

  it("lists the stamp the service worker loads, so a version's stamp is its own (#129)", () => {
    const imported = [
      ...source("sw.js").matchAll(/importScripts\("([^"]+)"\)/g),
    ].map((m) => m[1]);
    expect(imported).toEqual(["version.js"]);
    expect(shellList()).toContain("version.js");
  });

  it("lists the Firebase SDK the app loads, so a version installs whole (#129)", () => {
    const sdk = [
      ...source("js/firebase-sdk.js").matchAll(/from "(https:[^"]+)"/g),
    ].map((m) => m[1]);
    expect(sdk).toHaveLength(3);
    expect(shellList().filter((entry) => entry.startsWith("https:"))).toEqual(
      sdk,
    );
  });
});
