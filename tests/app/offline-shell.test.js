import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const appDir = fileURLToPath(new URL("../../app/", import.meta.url));

/** @param {string} dir @returns {string[]} */
function filesUnder(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(join(dir, entry.name))
      : [relative(appDir, join(dir, entry.name)).split(sep).join("/")],
  );
}

/** The SHELL list as written in the service worker. */
function shellList() {
  const source = readFileSync(join(appDir, "sw.js"), "utf8");
  const block = source.match(/const SHELL = \[([\s\S]*?)\];/);
  if (!block) throw new Error("SHELL list not found in sw.js");
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

describe("offline app shell", () => {
  it("lists every app file in the service worker's SHELL, so nothing is missing offline", () => {
    const missing = filesUnder(appDir)
      .filter((file) => file !== "sw.js")
      .filter((file) => !shellList().includes(file));
    expect(missing).toEqual([]);
  });
});
