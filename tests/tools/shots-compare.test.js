import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { verdict } from "../../tools/shots/verdict.js";

/**
 * A PNG of the given size, every pixel the given RGBA, with changes applied.
 * @param {number} width
 * @param {number} height
 * @param {Array<[x: number, y: number, rgba: number[]]>} [changes]
 */
function png(width, height, changes = []) {
  const image = new PNG({ width, height });
  for (let i = 0; i < width * height; i++)
    image.data.set([0x12, 0x12, 0x12, 0xff], i * 4);
  for (const [x, y, rgba] of changes) image.data.set(rgba, (y * width + x) * 4);
  return PNG.sync.write(image);
}

describe("verdict (#37)", () => {
  it("calls byte-identical shots identical", () => {
    expect(verdict(png(4, 4), png(4, 4), "a", "b")).toBe("identical");
  });

  it("says how many pixels differ and by how much at most", () => {
    const noise = png(4, 4, [
      [0, 0, [0x14, 0x12, 0x12, 0xff]], // 2 levels in red
      [3, 2, [0x12, 0x12, 0x16, 0xff]], // 4 levels in blue
    ]);
    expect(verdict(png(4, 4), noise, "a", "b")).toBe(
      "DIFFERENT  2 px, max Δ 4",
    );
  });

  it("counts a real change as large", () => {
    const lime = png(4, 4, [[1, 1, [0xe6, 0xff, 0x3a, 0xff]]]);
    expect(verdict(png(4, 4), lime, "a", "b")).toBe(
      "DIFFERENT  1 px, max Δ 237",
    );
  });

  it("names both sizes when they differ", () => {
    expect(verdict(png(4, 4), png(4, 5), "a", "b")).toBe(
      "DIFFERENT  size 4×4 vs 4×5",
    );
  });

  it("names the run a shot is only in", () => {
    expect(verdict(png(4, 4), undefined, "before", "after")).toBe(
      "only in before",
    );
    expect(verdict(undefined, png(4, 4), "before", "after")).toBe(
      "only in after",
    );
  });
});
