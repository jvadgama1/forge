// Compares two shots runs (#33): `npm run shots:compare -- <a> <b>` reports
// each shot as identical (byte for byte), different (with how much, #37), or
// only in one run. Like `diff`, it exits non-zero when anything differs.
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { LABEL, runDir } from "./run-dir.js";
import { verdict } from "./verdict.js";

const [a = "", b = ""] = process.argv.slice(2);
if (!LABEL.test(a) || !LABEL.test(b)) {
  console.error("Usage: npm run shots:compare -- <a> <b>  (two run labels)");
  process.exit(1);
}

/** @param {string} label @param {string} name */
const read = (label, name) =>
  readFile(join(runDir(label), name)).catch(() => undefined);

const names = [
  ...new Set([...(await readdir(runDir(a))), ...(await readdir(runDir(b)))]),
].sort();

let changed = 0;
for (const name of names) {
  const [inA, inB] = await Promise.all([read(a, name), read(b, name)]);
  const { same, text } = verdict(inA, inB, a, b);
  if (!same) changed++;
  console.log(`${name.replace(/\.png$/, "").padEnd(20)} ${text}`);
}
if (changed) process.exitCode = 1;
