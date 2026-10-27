// How one shot compares between two runs (#37). Glyph-edge noise differs by
// a few grey levels; a real change by far more. Saying how many pixels
// differ and by how much tells them apart without hiding either.
import { PNG } from "pngjs";

/**
 * @param {Buffer | undefined} a The shot in run `labelA`, if it has one.
 * @param {Buffer | undefined} b The shot in run `labelB`, if it has one.
 * @param {string} labelA
 * @param {string} labelB
 * @returns {{ same: boolean, text: string }} `same` only when the files are
 *   byte for byte identical; `text` says how they differ
 */
export function verdict(a, b, labelA, labelB) {
  if (!a || !b) return { same: false, text: `only in ${a ? labelA : labelB}` };
  if (a.equals(b)) return { same: true, text: "identical" };
  const [imageA, imageB] = [PNG.sync.read(a), PNG.sync.read(b)];
  if (imageA.width !== imageB.width || imageA.height !== imageB.height)
    return {
      same: false,
      text: `DIFFERENT  size ${imageA.width}×${imageA.height} vs ${imageB.width}×${imageB.height}`,
    };
  let pixels = 0;
  let maxDelta = 0;
  // Decoded data is 4 bytes per pixel: red, green, blue, alpha.
  for (let pixel = 0; pixel < imageA.data.length; pixel += 4) {
    let delta = 0;
    for (let byte = pixel; byte < pixel + 4; byte++)
      delta = Math.max(delta, Math.abs(imageA.data[byte] - imageB.data[byte]));
    if (delta) pixels++;
    maxDelta = Math.max(maxDelta, delta);
  }
  return {
    same: false,
    text: pixels
      ? `DIFFERENT  ${pixels} px, max Δ ${maxDelta}`
      : "DIFFERENT  encoding only, same pixels",
  };
}
