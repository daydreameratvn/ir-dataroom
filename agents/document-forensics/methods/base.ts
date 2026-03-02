/**
 * Base types and interfaces for forensic image analysis methods.
 */

export interface BenchmarkOutput {
  /** Probability heatmap, flattened (H*W), values normalized 0-1. */
  heatmap: Float32Array | null;
  /** Binary mask, flattened (H*W), values 0 or 1. */
  mask: Uint8Array | null;
  /** Detection score between 0 and 1 (1 = forged). */
  detection: number | null;
  /** Dimensions of the heatmap/mask. */
  width: number;
  height: number;
  /** Any extra method-specific outputs. */
  extraOutputs?: Record<string, unknown>;
}

export interface MethodInput {
  /** Image pixel data. Format depends on method. */
  image: Buffer | Float32Array | Uint8Array;
  /** Image width in pixels. */
  width: number;
  /** Image height in pixels. */
  height: number;
  /** Number of channels (typically 3). */
  channels: number;
  /** Original file path (some methods need it for JPEG data). */
  imagePath?: string;
}

export type MethodType = 'traditional' | 'deep_learning';

export interface ForensicMethod {
  /** Method identifier (e.g. 'ela', 'blocking'). */
  readonly name: string;
  /** Whether this is a traditional or deep learning method. */
  readonly type: MethodType;
  /** Human-readable description of what this method does. */
  readonly description: string;
  /** Run analysis and return standardized output. */
  benchmark(input: MethodInput): Promise<BenchmarkOutput>;
}

/**
 * Creates an empty BenchmarkOutput with given dimensions.
 */
export function emptyBenchmarkOutput(
  width: number,
  height: number,
): BenchmarkOutput {
  return {
    heatmap: null,
    mask: null,
    detection: null,
    width,
    height,
  };
}
