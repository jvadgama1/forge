import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { verdict } from "../../tools/shots/verdict.js";

/**
 * A PNG of the given size, every pixel #121212, with changes applied.
 * @param {number} width
 * @param {number} height
 * @param {Array<[x: number, y: number, rgba: number[]]>} [changes]
 * @param {import("pngjs").PackerOptions} [encoding]
 */
function png(width, height, changes = [], encoding) {
  const image = new PNG({ width, height });
  for (let i = 0; i < width * height; i++)
    image.data.set([0x12, 0x12, 0x12, 0xff], i * 4);
  for (const [x, y, rgba] of changes) image.data.set(rgba, (y * width + x) * 4);
  return PNG.sync.write(image, encoding);
}

describe("verdict (#37)", () => {
  it("calls byte-identical shots identical", () => {
    expect(verdict(png(4, 4), png(4, 4), "a", "b")).toEqual({
      same: true,
      text: "identical",
    });
  });

  it("says how many pixels differ and by how much at most", () => {
    const noise = png(4, 4, [
      [0, 0, [0x14, 0x12, 0x12, 0xff]], // 2 levels in red
      [3, 2, [0x12, 0x12, 0x16, 0xff]], // 4 levels in blue
    ]);
    expect(verdict(png(4, 4), noise, "a", "b")).toEqual({
      same: false,
      text: "DIFFERENT  2 px, max Δ 4",
    });
  });

  it("counts a real change as large", () => {
    const lime = png(4, 4, [[1, 1, [0xe6, 0xff, 0x3a, 0xff]]]);
    expect(verdict(png(4, 4), lime, "a", "b").text).toBe(
      "DIFFERENT  1 px, max Δ 237",
    );
  });

  it("says when only the encoding differs", () => {
    const rgb = png(4, 4, [], { colorType: 2 });
    expect(verdict(png(4, 4), rgb, "a", "b")).toEqual({
      same: false,
      text: "DIFFERENT  encoding only, same pixels",
    });
  });

  it("names both sizes when they differ", () => {
    expect(verdict(png(4, 4), png(4, 5), "a", "b").text).toBe(
      "DIFFERENT  size 4×4 vs 4×5",
    );
  });

  it("names the run a shot is only in", () => {
    expect(verdict(png(4, 4), undefined, "before", "after")).toEqual({
      same: false,
      text: "only in before",
    });
    expect(verdict(undefined, png(4, 4), "before", "after").text).toBe(
      "only in after",
    );
  });
});
