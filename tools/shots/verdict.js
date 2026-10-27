// How one shot compares between two runs (#37). Glyph-edge noise differs by
// a few grey levels; a real change by far more. Saying how many pixels
// differ and by how much tells them apart without hiding either.
import { PNG } from "pngjs";

/**
 * @param {Buffer | undefined} a The shot in run `labelA`, if it has one.
 * @param {Buffer | undefined} b The shot in run `labelB`, if it has one.
 * @param {string} labelA
 * @param {string} labelB
 * @returns {string} "identical", "only in <label>", or "DIFFERENT" with the
 *   size of the difference
 */
export function verdict(a, b, labelA, labelB) {
  if (!a || !b) return `only in ${a ? labelA : labelB}`;
  if (a.equals(b)) return "identical";
  const [imageA, imageB] = [PNG.sync.read(a), PNG.sync.read(b)];
  if (imageA.width !== imageB.width || imageA.height !== imageB.height)
    return `DIFFERENT  size ${imageA.width}×${imageA.height} vs ${imageB.width}×${imageB.height}`;
  let pixels = 0;
  let maxDelta = 0;
  for (let i = 0; i < imageA.data.length; i += 4) {
    let delta = 0;
    for (let channel = i; channel < i + 4; channel++)
      delta = Math.max(
        delta,
        Math.abs(imageA.data[channel] - imageB.data[channel]),
      );
    if (delta) pixels++;
    maxDelta = Math.max(maxDelta, delta);
  }
  return `DIFFERENT  ${pixels} px, max Δ ${maxDelta}`;
}
