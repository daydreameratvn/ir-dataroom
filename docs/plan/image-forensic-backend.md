# Advanced Document Forensics Backend

> **Status**: Implemented and deployed. GPU acceleration confirmed working (Tesla T4, CUDA 12.1).

## 1. Context & Goal

Self-contained document fraud detection backend service in Banyan:
- Accepts document images via HTTP multipart upload
- Runs deep learning forensic analysis (TruFor heatmap + OCR field extraction + anomaly scoring)
- Detects areas of tampering with per-field risk scores
- Generates heatmap visualizations highlighting fraud areas
- Returns structured JSON results with verdict, scores, and visualization images

Code originated from `/Volumes/work/git/papaya-org/image-detection-ts-mcp/` and is bundled as a self-contained service — no external project dependencies.

---

## 2. Architecture Overview

```
                        ┌─────────────────────────────────┐
                        │         server.ts                │
                        │   Bun.serve() — HTTP server      │
                        │   /forensics/health              │
                        │   /forensics/analyze             │
                        │   /forensics/batch               │
                        │   /forensics/extract             │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │        handler.ts                │
                        │   handleAnalyze()                │
                        │   handleBatch()                  │
                        │   handleExtractFields()          │
                        └──────────────┬──────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │        forensics.ts              │
                        │  advancedDocumentForensics()     │
                        │  batchDocumentForensics()        │
                        │  + inline TruFor Python bridge   │
                        └──────────────┬──────────────────┘
                                       │
               ┌───────────────────────┼───────────────────────┐
               │                       │                       │
    ┌──────────▼──────────┐ ┌─────────▼──────────┐ ┌─────────▼──────────┐
    │   OCR Extraction     │ │  TruFor Heatmap     │ │  Field Scoring      │
    │                      │ │                     │ │                     │
    │  gemini-extractor.ts │ │  python-bridge.ts   │ │  field-scorer.ts    │
    │  (Gemini Vision API) │ │       ↓             │ │  scoreFields()      │
    │       — OR —         │ │  python/methods/    │ │  computeVerdict()   │
    │  easyocr-extractor.ts│ │  trufor/predictor.py│ │                     │
    │  (Python subprocess) │ │  (PyTorch inference)│ │  NORMAL/SUSPICIOUS/ │
    │                      │ │                     │ │  TAMPERED            │
    └──────────┬──────────┘ └─────────┬──────────┘ └─────────┬──────────┘
               │                       │                       │
               └───────────────────────┼───────────────────────┘
                                       │
                        ┌──────────────▼──────────────────┐
                        │   forensics-visualizer.ts        │
                        │   generateForensicsSummary()     │
                        │                                  │
                        │   Left: doc + heatmap overlay    │
                        │   Right: verdict + field scores  │
                        └─────────────────────────────────┘
```

### Two OCR Pipelines (same output shape)

| Pipeline | Engine | Runtime | Pros | Cons |
|----------|--------|---------|------|------|
| **EasyOCR** (default) | EasyOCR library | Python subprocess | Free, offline, GPU-accelerated | Requires Python + EasyOCR install |
| **Gemini Hybrid** | Gemini Vision API | TypeScript-native | Structured output, no Python for OCR | Requires `GEMINI_API_KEY`, API cost |

Both produce `ExtractedField[]` → scored against TruFor heatmap → verdict. Production uses EasyOCR (default).

---

## 3. Folder Structure

```
agents/document-forensics/
│
├── config.ts                        # Service configuration (paths, timeouts, keys)
├── handler.ts                       # HTTP entry point (JSON request/response)
├── forensics.ts                     # Main orchestration
├── types.ts                         # Shared TS types (FieldResult, DocumentForensicsResult)
│
├── core/
│   ├── image-loader.ts              # Sharp-based image loading (CHW Float32Array)
│   └── result-formatter.ts          # Heatmap → PNG + base64 conversion
│
├── methods/
│   ├── base.ts                      # ForensicMethod interface, BenchmarkOutput, MethodInput
│   └── ela.ts                       # Error Level Analysis (JPEG recompression diff)
│
├── extraction/
│   ├── types.ts                     # Field types, risk weights (13 types), KEY_FIELDS set
│   ├── field-scorer.ts              # Per-field anomaly scoring + verdict computation
│   ├── gemini-extractor.ts          # Gemini Vision OCR (TypeScript, @google/genai)
│   └── easyocr-extractor.ts         # EasyOCR via Python subprocess
│
├── bridge/
│   └── python-bridge.ts             # Spawns local Python subprocess for TruFor
│
├── utils/
│   ├── heatmap.ts                   # JET colormap (float32 → RGB PNG)
│   ├── math-utils.ts                # mean, max, std, median, mad, clamp, histogram
│   ├── image-utils.ts               # rgbToGrayscale, rgbToYCrCb, chwToHwc, hwcToChw
│   └── forensics-visualizer.ts      # Summary PNG (doc + heatmap + bboxes + sidebar)
│
├── setup.sh                         # Setup script: uv sync + download weights
│
└── python/                          # Bundled Python package
    ├── pyproject.toml               # Python dependencies
    ├── __init__.py
    ├── base.py                      # BaseTorchMethod base class
    ├── config.py                    # resolve_device() — auto/cpu/cuda/mps
    │
    ├── preprocessing/
    │   ├── __init__.py
    │   ├── base.py                  # BasePreprocessing
    │   └── image.py                 # ZeroOneRange, Normalize, ToTensor transforms
    │
    ├── utils/
    │   ├── __init__.py
    │   └── image.py                 # tensor2numpy, read_image, ensure_hwc
    │
    ├── methods/
    │   ├── __init__.py
    │   ├── easyocr_extract.py       # EasyOCR field extraction + type classification
    │   └── trufor/                  # TruFor deep learning model
    │       ├── __init__.py
    │       ├── predictor.py         # TruForPredictor — entry point for TS bridge
    │       ├── method.py            # TruFor class (DnCNN + SegFormer + MLP)
    │       ├── preprocessing.py     # TruFor-specific image preprocessing
    │       ├── config.py            # Architecture configs + weight loading
    │       ├── config.yaml          # YAML architecture template
    │       └── models/
    │           ├── __init__.py
    │           ├── DnCNN.py         # Noiseprint++ (17-layer CNN, noise fingerprint)
    │           └── cmx/
    │               ├── __init__.py
    │               ├── decoders/
    │               │   ├── __init__.py
    │               │   └── MLPDecoder.py    # MLP-based segmentation decoder
    │               └── encoders/
    │                   ├── __init__.py
    │                   └── dual_segformer.py # SegFormer-B2 dual encoder
    │
    └── weights/                     # Gitignored, downloaded by setup.sh
        └── trufor/
            └── trufor.pth.tar       # ~281 MB model weights
```

---

## 4. Source File Mapping

### 4.1 TypeScript Files

Every TypeScript file is copied from `/Volumes/work/git/papaya-org/image-detection-ts-mcp/src/`. Import paths change from `.js` to `.ts` (Banyan uses `moduleResolution: "bundler"` + `allowImportingTsExtensions`).

| Source Path | Destination | Adaptation Required |
|-------------|-------------|---------------------|
| `config.ts` | `config.ts` | **Rewrite**: Remove MCP paths, point `PYTHON_PROJECT_PATH` to local `./python/`, remove manual `.env` parsing |
| `tools/advanced-forensics-tools.ts` | `forensics.ts` | **Major**: Extract types to `types.ts`, remove MCP tool registration, keep orchestration functions |
| `tools/advanced-forensics-tools.ts` (types) | `types.ts` | **Extract**: `FieldResult`, `DocumentForensicsResult`, `BatchForensicsResult` interfaces |
| `core/image-loader.ts` | `core/image-loader.ts` | Fix imports, add `noUncheckedIndexedAccess` null checks |
| `core/result-formatter.ts` | `core/result-formatter.ts` | Fix imports |
| `methods/base.ts` | `methods/base.ts` | None |
| `methods/ela/index.ts` | `methods/ela.ts` | Fix import path `../base.js` → `./base.ts` |
| `extraction/types.ts` | `extraction/types.ts` | None |
| `extraction/field-scorer.ts` | `extraction/field-scorer.ts` | **Fix circular dep**: Import `FieldResult` from `../types.ts` instead of `../tools/advanced-forensics-tools.js` |
| `extraction/gemini-extractor.ts` | `extraction/gemini-extractor.ts` | Fix imports |
| `extraction/easyocr-extractor.ts` | `extraction/easyocr-extractor.ts` | Fix imports, point Python calls to local `./python/` |
| `bridge/python-bridge.ts` | `bridge/python-bridge.ts` | **Simplify**: Keep only TruFor method, point to local `./python/` package |
| `utils/heatmap.ts` | `utils/heatmap.ts` | None (no imports) |
| `utils/math-utils.ts` | `utils/math-utils.ts` | None (no imports) |
| `utils/image-utils.ts` | `utils/image-utils.ts` | None (no imports) |
| `utils/forensics-visualizer.ts` | `utils/forensics-visualizer.ts` | None (only imports `sharp`) |
| — (new file) | `handler.ts` | **New**: HTTP entry point with `handleAnalyze`, `handleBatch`, `handleExtractFields` |

### 4.2 Python Files

Every Python file is copied from `/Volumes/work/git/papaya-org/image-detection-ts-mcp/python-bridge/`. Import paths change from absolute (`from python_bridge.methods...`) to relative within the local package.

| Source Path | Destination | Adaptation Required |
|-------------|-------------|---------------------|
| `base.py` | `python/base.py` | Fix imports to local relative paths |
| `mcp_server/config.py` | `python/config.py` | **Extract**: Only `resolve_device()` function |
| `preprocessing/base.py` | `python/preprocessing/base.py` | None |
| `preprocessing/image.py` | `python/preprocessing/image.py` | Fix imports |
| `utils/image.py` | `python/utils/image.py` | Fix imports |
| `methods/trufor/predictor.py` | `python/methods/trufor/predictor.py` | Fix imports, update default weights path to `./weights/trufor/trufor.pth.tar` |
| `methods/trufor/method.py` | `python/methods/trufor/method.py` | Fix imports |
| `methods/trufor/preprocessing.py` | `python/methods/trufor/preprocessing.py` | Fix imports |
| `methods/trufor/config.py` | `python/methods/trufor/config.py` | Fix imports, update weights path resolution |
| `methods/trufor/config.yaml` | `python/methods/trufor/config.yaml` | None |
| `methods/trufor/models/DnCNN.py` | `python/methods/trufor/models/DnCNN.py` | Fix imports |
| `methods/trufor/models/cmx/decoders/MLPDecoder.py` | `python/methods/trufor/models/cmx/decoders/MLPDecoder.py` | Fix imports |
| `methods/trufor/models/cmx/encoders/dual_segformer.py` | `python/methods/trufor/models/cmx/encoders/dual_segformer.py` | Fix imports |
| `methods/trufor/models/cmx/` utils (`init_func.py`, `layer.py`, `net.py`) | same structure | Fix imports |
| — (new/extracted) | `python/methods/easyocr_extract.py` | **Extract**: EasyOCR script from `easyocr-extractor.ts` inline Python string |
| — (new) | `python/pyproject.toml` | **New**: Dependencies config |
| — (new) | `python/__init__.py` + all subdirs | **New**: Package init files |

---

## 5. Detailed Component Specifications

### 5.1 `config.ts` — Service Configuration

Key exports:
- `PYTHON_PROJECT_PATH` — path to bundled Python package (`./python/`)
- `PYTHON_BRIDGE_TIMEOUT` — from `process.env.PYTHON_BRIDGE_TIMEOUT`, default 120s. Overridden to 300s by ECS task definition (first TruFor call loads model into VRAM).
- `getOcrEngine()` — returns `'easyocr'` (default) or `'gemini'`
- `getGeminiApiKey()` — lazy read from `process.env.GEMINI_API_KEY` (loaded from SSM at startup by `server.ts`)

### 5.2 `types.ts` — Shared Types (extracted from `advanced-forensics-tools.ts`)

```typescript
export interface FieldResult {
  type: string;
  risk_weight: number;
  text: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number } | null;
  scores: {
    anomaly: number;
    heatmap_mean: number;
    heatmap_max: number;
    heatmap_std?: number;
    percentile_95?: number;
  };
}

export interface DocumentForensicsResult {
  success: boolean;
  method: string;
  ocr_engine: string;
  device: string;
  verdict: "NORMAL" | "SUSPICIOUS" | "TAMPERED" | "ERROR";
  overall_score: number;
  risk_level: "low" | "medium" | "high";
  trufor: { global_score: number; detection_score: number | null };
  image: { path: string; width: number; height: number };
  ocr_analysis: { total_fields: number; field_types_found: string[] };
  highest_risk_field: FieldResult | null;
  fields: FieldResult[];
  visualization_path: string | null;
  heatmap_b64?: string | null;
  notes: string[];
  error?: string;
}

export interface BatchForensicsResult {
  success: boolean;
  total_images: number;
  summary: {
    verdicts: { NORMAL: number; SUSPICIOUS: number; TAMPERED: number; ERROR: number };
    avg_score: number;
    max_score: number;
    min_score: number;
  };
  results: Array<{
    image: string;
    verdict: string;
    score: number;
    fields: number;
    highest_risk: { type: string; score: number } | null;
    error?: string;
  }>;
}
```

### 5.3 `handler.ts` — HTTP Entry Point

```typescript
import { advancedDocumentForensics, batchDocumentForensics, extractDocumentFields } from "./forensics.ts";
import type { DocumentForensicsResult, BatchForensicsResult } from "./types.ts";

export interface AnalyzeRequest {
  image_path?: string;
  image_base64?: string;        // Base64-encoded image (written to temp file)
  ocr_engine?: "gemini" | "easyocr";
  device?: string;              // "auto" | "cpu" | "cuda" | "mps"
  output_dir?: string;
}

export interface BatchRequest {
  image_paths: string[];
  ocr_engine?: "gemini" | "easyocr";
  device?: string;
  concurrency?: number;
  output_dir?: string;
}

export interface ExtractFieldsRequest {
  image_path: string;
  ocr_engine?: "gemini";
  document_type?: string;
}

export async function handleAnalyze(request: AnalyzeRequest): Promise<DocumentForensicsResult> {
  // 1. Resolve image: if base64 provided, write to temp file via Sharp
  // 2. Call advancedDocumentForensics(imagePath, outputDir, device, ocrEngine)
  // 3. Return structured result (includes heatmap_b64, visualization_path)
  // 4. Clean up temp file if created
}

export async function handleBatch(request: BatchRequest): Promise<BatchForensicsResult> {
  return batchDocumentForensics(
    request.image_paths,
    request.output_dir,
    request.device ?? "auto",
    request.concurrency ?? 3,
  );
}

export async function handleExtractFields(request: ExtractFieldsRequest) {
  return extractDocumentFields(
    request.image_path,
    request.ocr_engine ?? "gemini",
    request.document_type ?? "auto",
  );
}
```

### 5.4 `bridge/python-bridge.ts` — Local Python Bridge

Key change from source: instead of `uv run --project ../image-detection-mcp`, use:

```typescript
import { execFile } from "node:child_process";
import { PYTHON_PROJECT_PATH, PYTHON_BRIDGE_TIMEOUT, WEIGHTS_DIR } from "../config.ts";

export async function runTruForRaw(imagePath: string, device = "auto"): Promise<TruForRawResult> {
  const script = `
import sys, json, base64, numpy as np
sys.path.insert(0, '${PYTHON_PROJECT_PATH}')
from methods.trufor.predictor import TruForPredictor
from config import resolve_device

device = resolve_device('${device}')
predictor = TruForPredictor(device=device, weights='${WEIGHTS_DIR}/trufor/trufor.pth.tar')
result = predictor.predict('${imagePath}')

heatmap_b64 = base64.b64encode(result.heatmap.astype(np.float32).tobytes()).decode()
print(json.dumps({
    'success': True,
    'global_score': float(result.score),
    'detection_score': float(result.detection) if result.detection is not None else None,
    'heatmap_b64': heatmap_b64,
    'width': result.heatmap.shape[1],
    'height': result.heatmap.shape[0],
}))
  `;

  return new Promise((resolve, reject) => {
    execFile("uv", ["run", "--project", PYTHON_PROJECT_PATH, "python", "-c", script], {
      timeout: PYTHON_BRIDGE_TIMEOUT,
    }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve(JSON.parse(stdout));
    });
  });
}
```

### 5.5 `python/pyproject.toml` — Python Dependencies

```toml
[project]
name = "document-forensics"
version = "0.1.0"
description = "Document forensics - TruFor deep learning + EasyOCR"
requires-python = ">=3.10"
dependencies = [
    "torch>=2.1.0",
    "torchvision>=0.16.0",
    "numpy>=1.24.0",
    "opencv-python>=4.8.0",
    "Pillow>=10.0.0",
    "scipy>=1.10.0",
    "pydantic>=2.0.0",
    "pyyaml>=6.0",
    "easyocr>=1.7.2",
    "timm>=0.9.0",
    "einops>=0.7.0",
]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"
```

### 5.6 `python/methods/trufor/predictor.py` — TruFor Entry Point

```python
"""
TruForPredictor — high-level interface called by TypeScript bridge.

Usage:
    predictor = TruForPredictor(device='auto', weights='./weights/trufor/trufor.pth.tar')
    result = predictor.predict('/path/to/document.jpg')
    # result.heatmap: H×W float32 array (0-1), per-pixel forgery probability
    # result.score: float, global anomaly score (mean of heatmap)
    # result.detection: float or None, binary detection confidence
"""
# Copied from image-detection-ts-mcp/python-bridge/methods/trufor/predictor.py
# Import paths changed to local relative paths
```

### 5.7 `setup.sh` — Setup Script

```bash
#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PYTHON_DIR="$SCRIPT_DIR/python"
WEIGHTS_DIR="$PYTHON_DIR/weights/trufor"

echo "=== Document Forensics Setup ==="

# 1. Install Python dependencies
echo "Installing Python dependencies..."
cd "$PYTHON_DIR"
uv sync

# 2. Download TruFor weights
if [ ! -f "$WEIGHTS_DIR/trufor.pth.tar" ]; then
  echo "Downloading TruFor weights (~281 MB)..."
  mkdir -p "$WEIGHTS_DIR"
  curl -L -o "$WEIGHTS_DIR/trufor.pth.tar" \
    "https://www.grip.unina.it/download/prog/TruFor/TruFor_weights.pth"
  echo "Weights downloaded."
else
  echo "TruFor weights already present."
fi

echo "=== Setup complete ==="
```

---

## 6. Scoring & Verdict Logic

### Per-Field Anomaly Score

```
anomaly_score = (heatmap_mean × 0.3 + heatmap_max × 0.5 + heatmap_std × 0.2) × risk_weight
```

### Field Risk Weights

| Field Type | Weight | Description |
|------------|--------|-------------|
| `patient_name` | **1.0** | Person/patient names — highest fraud target |
| `total` | **0.95** | Grand total amounts — highest financial risk |
| `insurance_id` | 0.9 | Social insurance numbers |
| `amount` | 0.9 | Monetary values |
| `price` | 0.85 | Individual item prices |
| `diagnosis` | 0.8 | Medical diagnosis codes |
| `id_number` | 0.8 | Document/citizen IDs |
| `item_name` | 0.7 | Receipt line items |
| `date` | 0.7 | Date fields |
| `doctor_name` | 0.7 | Physician names |
| `quantity` | 0.6 | Item quantities |
| `stamp` | 0.6 | Official stamps/seals |
| `hospital_name` | 0.5 | Institution names |
| `unknown` | 0.3 | Unclassified text |

### Verdict Computation

```
max_key_score = max(anomaly for KEY_FIELDS only)
mean_key_score = mean(anomaly for KEY_FIELDS only)
overall_score = max_key_score × 0.6 + mean_key_score × 0.4

Verdict:
  max_key_score >= 0.50  →  TAMPERED    (high likelihood of manipulation)
  max_key_score >= 0.45  →  SUSPICIOUS  (manual review recommended)
  max_key_score <  0.45  →  NORMAL      (likely authentic)

KEY_FIELDS = {patient_name, amount, total, price, insurance_id, date, id_number, diagnosis}
```

---

## 7. Visualization Output

`forensics-visualizer.ts` generates a summary PNG:

```
┌─────────────────────────────────┬──────────────────┐
│                                 │  VERDICT BADGE   │
│   Original Document             │  Overall Score   │
│   + TruFor Heatmap (55% opacity)│                  │
│   + Color-coded bounding boxes  │  Risk Legend:    │
│     (green/yellow/orange/red)   │  ■ Minimal <0.20 │
│                                 │  ■ Low 0.20-0.35 │
│                                 │  ■ Medium 0.35-50│
│                                 │  ■ High >0.50    │
│                                 │                  │
│                                 │  Detected Fields:│
│                                 │  1. patient_name │
│                                 │     score: 0.52  │
│                                 │  2. total        │
│                                 │     score: 0.38  │
│                                 │  ...             │
└─────────────────────────────────┴──────────────────┘
```

- Bounding boxes shown only for fields with anomaly score >= 0.30
- Color coding: green (<0.15), yellow (0.15-0.30), orange (0.30-0.50), red (>=0.50)
- Sidebar sorted by anomaly score (highest risk first)

---

## 8. TruFor Model Architecture

```
Input: RGB Document Image (H × W × 3)
         │
         ▼
┌─────────────────────┐
│  DnCNN (Noiseprint++)│  17-layer CNN → 1-channel noise fingerprint
│  Input: RGB          │  Detects camera/sensor-level noise patterns
│  Output: 1ch noise   │  Tiled to 3 channels for dual encoder
└────────┬────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Dual SegFormer-B2 Encoder              │
│                                         │
│  Stream 1: RGB image (3ch)              │
│  Stream 2: Noiseprint++ (3ch tiled)     │
│                                         │
│  4 stages:                              │
│  Stage 1: 64ch,  3 layers, 8× SR ratio │
│  Stage 2: 128ch, 4 layers, 4× SR ratio │
│  Stage 3: 320ch, 6 layers, 2× SR ratio │
│  Stage 4: 512ch, 3 layers, 1× SR ratio │
│                                         │
│  Feature Rectification (FRM) per stage  │
│  Feature Fusion (FFM) between streams   │
│                                         │
│  Output: 4 multi-scale feature maps     │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  MLP Decoder                            │
│  Project all 4 levels → 512 channels    │
│  Upsample to original resolution        │
│  Fuse → 2-class segmentation logits     │
│  softmax → heatmap[1] = forgery prob    │
└────────┬────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────┐
│  Output                                 │
│  heatmap: H×W float32 (0-1)            │
│  score: mean(heatmap) — global anomaly  │
│  detection: sigmoid(confpool) or None   │
└─────────────────────────────────────────┘
```

**Weights**: `trufor.pth.tar` (~281 MB), downloaded from GRIP Unina.

---

## 9. Dependencies

### 9.1 TypeScript (add to root `package.json`)

```json
{
  "sharp": "^0.33.5",
  "@google/genai": "^1.42.0",
  "zod": "^3.24.2",
  "zod-to-json-schema": "^3.25.1"
}
```

- `sharp` — Image loading, JPEG re-encoding (ELA), heatmap PNG encoding, visualization compositing
- `@google/genai` — Gemini Vision API for OCR field extraction
- `zod` + `zod-to-json-schema` — Gemini structured response schema validation

### 9.2 Python (`python/pyproject.toml`)

| Package | Version | Purpose |
|---------|---------|---------|
| `torch` | >=2.1.0 | PyTorch runtime for TruFor inference |
| `torchvision` | >=0.16.0 | Image transforms |
| `numpy` | >=1.24.0 | Array operations |
| `opencv-python` | >=4.8.0 | Image I/O |
| `Pillow` | >=10.0.0 | Image handling |
| `scipy` | >=1.10.0 | Scientific computing |
| `pydantic` | >=2.0.0 | Config validation |
| `pyyaml` | >=6.0 | YAML parsing |
| `easyocr` | >=1.7.2 | Vietnamese + English OCR |
| `timm` | >=0.9.0 | SegFormer backbone |
| `einops` | >=0.7.0 | Tensor reshaping |

---

## 10. Environment Variables

| Variable | Purpose | Default | ECS Override |
|----------|---------|---------|--------------|
| `PORT` | HTTP server port | `4001` | `4001` |
| `NODE_ENV` | Environment mode | — | `production` |
| `AWS_REGION` | AWS region for SSM | — | `ap-southeast-1` |
| `PYTHON_BRIDGE_TIMEOUT` | TruFor/EasyOCR subprocess timeout (ms) | `120000` | `300000` (both CPU and GPU) |
| `GEMINI_API_KEY` | Google Gemini API key for OCR extraction | — | Loaded from SSM `/banyan/gemini/api-key` at startup |
| `OCR_ENGINE` | OCR engine selection | `easyocr` | — |
| `EASYOCR_LANG` | EasyOCR language codes | `vi,en` | — |
| `NVIDIA_VISIBLE_DEVICES` | GPU visibility (GPU Dockerfile only) | — | `all` |

Per Banyan conventions, secrets stored in AWS SSM Parameter Store. `GEMINI_API_KEY` is loaded at server startup by `server.ts`.

---

## 11. Implementation Sequence

### Phase 1: Scaffold (Steps 1-3)
1. Create branch `feat/document-forensics`
2. Add TypeScript dependencies to root `package.json`, run `bun install`
3. Create folder structure: `agents/document-forensics/` with all subdirectories

### Phase 2: Python Package (Steps 4-5)
4. Copy all Python files from `python-bridge/` into `python/`, fix import paths
5. Create `pyproject.toml`, `__init__.py` files, `setup.sh`
6. **Checkpoint commit**: `chore(agents): scaffold document forensics Python package`

### Phase 3: TypeScript Utilities (Steps 6-8)
7. Copy pure utility files (math-utils, heatmap, image-utils, base, ela, extraction/types)
8. Create `config.ts` (adapted for local paths)
9. Create `types.ts` (extracted from advanced-forensics-tools.ts)
10. **Checkpoint commit**: `chore(agents): add document forensics utility files`

### Phase 4: TypeScript Core (Steps 9-11)
11. Copy core files (image-loader, result-formatter)
12. Copy extraction files (field-scorer, gemini-extractor, easyocr-extractor)
13. Copy + adapt bridge (python-bridge.ts → local Python)
14. Copy forensics-visualizer
15. **Checkpoint commit**: `chore(agents): add document forensics core modules`

### Phase 5: Orchestration + Handler (Steps 12-13)
16. Create `forensics.ts` — adapted from `advanced-forensics-tools.ts`
17. Create `handler.ts` — HTTP entry point
18. **Checkpoint commit**: `feat(agents): add document forensics orchestration and handler`

### Phase 6: Strict Mode + Typecheck (Steps 14-15)
19. Fix `verbatimModuleSyntax` issues (add `type` to type-only imports)
20. Fix `noUncheckedIndexedAccess` issues (null checks for array access)
21. Run typecheck: `bunx tsgo --noEmit`
22. **Final commit**: `feat(agents): add document forensics service with bundled Python`

---

## 12. TypeScript Strict Mode Fixes Required

Banyan's `tsconfig.json` has stricter settings than the source project:

| Setting | Impact | Fix |
|---------|--------|-----|
| `verbatimModuleSyntax: true` | `import { SomeType }` → `import type { SomeType }` when only used as type | Add `type` keyword to type-only imports |
| `noUncheckedIndexedAccess: true` | `arr[i]` returns `T \| undefined` | Add `!` assertion or `if` guard where safe |
| `allowImportingTsExtensions: true` | Import paths must use `.ts` | Change all `.js` → `.ts` in imports |
| `strict: true` | Enables all strict checks | Already handled by source (mostly strict) |

---

## 13. Verification Plan

### 13.1 Python Verification
```bash
cd agents/document-forensics
bash setup.sh                    # Install deps + download weights

# Test TruFor directly
cd python
uv run python -c "
from methods.trufor.predictor import TruForPredictor
from config import resolve_device
p = TruForPredictor(device=resolve_device('auto'))
r = p.predict('/path/to/test-image.jpg')
print(f'Score: {r.score}, Heatmap shape: {r.heatmap.shape}')
"
```

### 13.2 TypeScript Typecheck
```bash
cd /Volumes/work/git/papaya-org/banyan
bunx tsgo --noEmit
```

### 13.3 End-to-End Test
```typescript
// agents/document-forensics/test-forensics.ts
import { handleAnalyze } from "./handler.ts";

const result = await handleAnalyze({
  image_path: "/path/to/sample-document.jpg",
  ocr_engine: "gemini",
  device: "auto",
});

console.log(`Verdict: ${result.verdict}`);
console.log(`Score: ${result.overall_score}`);
console.log(`Fields: ${result.fields.length}`);
console.log(`Highest risk: ${result.highest_risk_field?.type} (${result.highest_risk_field?.scores.anomaly})`);
console.log(`Heatmap base64 length: ${result.heatmap_b64?.length}`);
console.log(`Visualization: ${result.visualization_path}`);
```

### 13.4 Batch Test
```typescript
import { handleBatch } from "./handler.ts";

const result = await handleBatch({
  image_paths: ["/doc1.jpg", "/doc2.jpg", "/doc3.jpg"],
  concurrency: 3,
});

console.log(`Summary:`, result.summary);
```

---

## 14. Future Integration

Once the service is working, it can be integrated as an `AgentTool` for other agents:

```typescript
// agents/shared/tools/document-forensics.ts (future)
import { handleAnalyze } from "../../document-forensics/handler.ts";
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";

export const documentForensicsTool: AgentTool = {
  name: "document_forensics",
  label: "Document Forensics",
  description: "Run forensic tampering analysis on a document image",
  parameters: Type.Object({
    imagePath: Type.String({ description: "Absolute path to document image" }),
    ocrEngine: Type.Optional(Type.String({ description: "OCR engine: gemini or easyocr" })),
  }),
  async execute(_toolCallId, params) {
    const result = await handleAnalyze({
      image_path: params.imagePath,
      ocr_engine: (params.ocrEngine as "gemini" | "easyocr") ?? "gemini",
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: { verdict: result.verdict, score: result.overall_score },
    };
  },
};
```

This allows claim-assessor, overseer, and other agents to call forensics analysis as a tool during their workflow.

---

## 15. Performance Characteristics (Measured)

| Operation | MPS (Apple Silicon) | CPU Fargate (2 vCPU) | GPU g4dn.xlarge (T4) |
|-----------|--------------------|--------------------|---------------------|
| EasyOCR (66 fields) | 2-5s | ~60s | **8.5s** |
| EasyOCR (423 fields) | 3-8s | ~55s | **12.7s** |
| TruFor heatmap | 4-6s | 120-200s | **7-8.5s** |
| Field scoring | <1s | <1s | <1s |
| Visualization | <1s | <1s | <1s |
| **Total (66 fields)** | **7-12s** | **~200s** | **18s** |
| **Total (423 fields)** | **8-15s** | **~130s** | **21s** |

GPU runtime: `torch=2.5.1+cu121`, `device=cuda`, `gpu=Tesla T4`.

### Deployment Variants

| Variant | Infra | Cost | Performance |
|---------|-------|------|-------------|
| CPU Fargate (always-on) | ECS Fargate, 2 vCPU / 8 GB | ~$85/mo | ~130-200s/image |
| GPU EC2 (on-demand) | ECS EC2, g4dn.xlarge (T4) | $0.63/hr when on, $0 when off | ~18-21s/image |

See `docs/plan/gpu-on-demand.md` for the GPU toggle architecture.
