/**
 * Python subprocess bridge for TruFor deep learning method.
 *
 * Spawns `uv run --project ./python/ python -c "..."` to invoke TruFor
 * from the bundled Python package.
 */

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';

import { PYTHON_PROJECT_PATH, PYTHON_BRIDGE_TIMEOUT } from '../config.ts';
import type { MethodResult } from '../core/result-formatter.ts';

const execFileAsync = promisify(execFile);

/**
 * Check if the Python environment is available.
 */
export async function checkPythonAvailable(): Promise<boolean> {
  try {
    await execFileAsync('uv', ['--version'], { timeout: 5000 });
    return existsSync(PYTHON_PROJECT_PATH);
  } catch {
    return false;
  }
}

/**
 * Check if TruFor weights are available.
 */
export function checkTruForWeights(): boolean {
  const weightsPath = `${PYTHON_PROJECT_PATH}/weights/trufor`;
  return existsSync(weightsPath);
}

/**
 * Run TruFor via the Python bridge.
 */
export async function runPythonMethod(
  methodName: string,
  imagePath: string,
): Promise<MethodResult> {
  const pythonAvailable = await checkPythonAvailable();
  if (!pythonAvailable) {
    return {
      success: false,
      method: methodName,
      image_path: imagePath,
      scores: { mean: null, max: null, detection: null },
      error:
        'Python environment not available. Install with: cd agents/document-forensics/python && uv sync',
    };
  }

  // Run from the parent of python/ so that `python/` is a proper top-level package.
  // This allows 3-level relative imports inside methods/trufor/ to resolve correctly.
  const parentDir = PYTHON_PROJECT_PATH.replace(/\/python\/?$/, '');
  try {
    const { stdout } = await execFileAsync(
      'uv',
      [
        'run',
        '--project',
        PYTHON_PROJECT_PATH,
        'python',
        '-c',
        `
import sys, json
from python.methods.trufor.predictor import TruForPredictor
from python.config import resolve_device

device = resolve_device('auto')
pred = TruForPredictor(device=device)
out = pred.predict('${imagePath}')

print(json.dumps({
    'success': True,
    'method': '${methodName}',
    'image_path': '${imagePath}',
    'scores': {
        'mean': float(out.score),
        'max': float(out.heatmap.max()),
        'detection': float(out.detection) if out.detection is not None else None,
    },
}))
`.trim(),
      ],
      {
        timeout: PYTHON_BRIDGE_TIMEOUT,
        maxBuffer: 50 * 1024 * 1024,
        cwd: parentDir,
      },
    );

    return JSON.parse(stdout.trim()) as MethodResult;
  } catch (error: unknown) {
    const msg =
      error instanceof Error ? error.message : String(error);
    return {
      success: false,
      method: methodName,
      image_path: imagePath,
      scores: { mean: null, max: null, detection: null },
      error: `Python bridge error: ${msg}`,
    };
  }
}
