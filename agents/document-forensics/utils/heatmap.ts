/**
 * JET colormap and heatmap utilities.
 *
 * Generates a 256-entry JET colormap lookup table matching OpenCV's COLORMAP_JET.
 */

/**
 * JET colormap LUT: 256 entries, each [R, G, B] in 0-255.
 * Generated to match OpenCV's COLORMAP_JET.
 */
function generateJetLUT(): Uint8Array {
  // 256 * 3 = 768 bytes: [R0,G0,B0, R1,G1,B1, ...]
  const lut = new Uint8Array(256 * 3);

  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    let r: number, g: number, b: number;

    if (t < 0.125) {
      r = 0;
      g = 0;
      b = 0.5 + t * 4;
    } else if (t < 0.375) {
      r = 0;
      g = (t - 0.125) * 4;
      b = 1;
    } else if (t < 0.625) {
      r = (t - 0.375) * 4;
      g = 1;
      b = 1 - (t - 0.375) * 4;
    } else if (t < 0.875) {
      r = 1;
      g = 1 - (t - 0.625) * 4;
      b = 0;
    } else {
      r = 1 - (t - 0.875) * 4;
      g = 0;
      b = 0;
    }

    const idx = i * 3;
    lut[idx] = Math.round(Math.max(0, Math.min(1, r)) * 255);
    lut[idx + 1] = Math.round(Math.max(0, Math.min(1, g)) * 255);
    lut[idx + 2] = Math.round(Math.max(0, Math.min(1, b)) * 255);
  }

  return lut;
}

const JET_LUT = generateJetLUT();

/**
 * Apply JET colormap to a grayscale heatmap.
 *
 * @param heatmap - Flattened grayscale values (H*W), range 0-1.
 * @param width - Image width.
 * @param height - Image height.
 * @returns RGB buffer (H*W*3) with JET colormap applied.
 */
export function applyJetColormap(
  heatmap: Float32Array,
  width: number,
  height: number,
): Uint8Array {
  const size = width * height;
  const rgb = new Uint8Array(size * 3);

  // Normalize to 0-255 range
  let hmin = Infinity;
  let hmax = -Infinity;
  for (let i = 0; i < size; i++) {
    if (heatmap[i]! < hmin) hmin = heatmap[i]!;
    if (heatmap[i]! > hmax) hmax = heatmap[i]!;
  }

  const range = hmax - hmin;

  for (let i = 0; i < size; i++) {
    let idx: number;
    if (range > 1e-6) {
      idx = Math.round(((heatmap[i]! - hmin) / range) * 255);
    } else {
      idx = 0;
    }
    idx = Math.max(0, Math.min(255, idx));

    const lutIdx = idx * 3;
    const outIdx = i * 3;
    rgb[outIdx] = JET_LUT[lutIdx]!;
    rgb[outIdx + 1] = JET_LUT[lutIdx + 1]!;
    rgb[outIdx + 2] = JET_LUT[lutIdx + 2]!;
  }

  return rgb;
}
