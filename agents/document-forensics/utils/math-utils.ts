/**
 * Mathematical utility functions for image forensics.
 */

/** Compute the mean of a Float32Array. */
export function mean(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < arr.length; i++) {
    sum += arr[i]!;
  }
  return sum / arr.length;
}

/** Compute the max of a Float32Array. */
export function max(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  let m = -Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! > m) m = arr[i]!;
  }
  return m;
}

/** Compute the min of a Float32Array. */
export function min(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  let m = Infinity;
  for (let i = 0; i < arr.length; i++) {
    if (arr[i]! < m) m = arr[i]!;
  }
  return m;
}

/** Compute standard deviation. */
export function std(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  const m = mean(arr);
  let sumSq = 0;
  for (let i = 0; i < arr.length; i++) {
    const d = arr[i]! - m;
    sumSq += d * d;
  }
  return Math.sqrt(sumSq / arr.length);
}

/** Compute the median of an array of numbers. */
export function median(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  const sorted = Array.from(arr).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1]! + sorted[mid]!) / 2;
  }
  return sorted[mid]!;
}

/**
 * Compute Median Absolute Deviation.
 * MAD = median(|x - median(x)|) / 0.6745
 */
export function mad(arr: Float32Array): number {
  if (arr.length === 0) return 0;
  const med = median(arr);
  const deviations = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    deviations[i] = Math.abs(arr[i]! - med);
  }
  return median(deviations) / 0.6745;
}

/** Build a histogram of values in the given range. */
export function histogram(
  arr: Float32Array,
  bins: number,
  minVal: number,
  maxVal: number,
): Uint32Array {
  const hist = new Uint32Array(bins);
  const range = maxVal - minVal;
  if (range <= 0) return hist;
  const scale = bins / range;
  for (let i = 0; i < arr.length; i++) {
    const idx = Math.min(
      Math.floor((arr[i]! - minVal) * scale),
      bins - 1,
    );
    if (idx >= 0) hist[idx]!++;
  }
  return hist;
}

/** Clamp a value between min and max. */
export function clamp(val: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, val));
}
