# Image Forensic Backend

Self-contained document fraud detection service at `agents/document-forensics/`. Takes document images, runs deep-learning forgery detection (TruFor) combined with OCR field extraction, and returns a per-field tampering verdict.

## Architecture

```
                  ┌─────────────────────────────────────────────┐
                  │              handler.ts                      │
                  │  handleAnalyze · handleBatch · handleExtract │
                  └──────────────────┬──────────────────────────┘
                                     │
                  ┌──────────────────▼──────────────────────────┐
                  │            forensics.ts                      │
                  │  Orchestrates OCR + TruFor + scoring         │
                  └──┬──────────────┬──────────────────┬────────┘
                     │              │                  │
          ┌──────────▼───┐  ┌──────▼──────┐  ┌───────▼────────┐
          │ Gemini OCR   │  │ TruFor      │  │ Field Scorer   │
          │ (TypeScript) │  │ (Python     │  │ (TypeScript)   │
          │ gemini-      │  │  subprocess)│  │ field-scorer.ts│
          │ extractor.ts │  │             │  │                │
          └──────────────┘  └──────┬──────┘  └────────────────┘
                                   │
                            ┌──────▼──────┐
                            │ uv run      │
                            │ python -c   │
                            │ TruFor      │
                            │ predictor   │
                            └─────────────┘
```

**Pipeline (per image):**

1. **Gemini Vision OCR** — extracts fields (patient_name, amount, date, etc.) with bounding boxes
2. **TruFor heatmap** — deep-learning model produces a pixel-level tampering probability map
3. **Field scoring** — overlays bounding boxes on the heatmap; computes per-field anomaly scores
4. **Verdict** — aggregates key-field scores into NORMAL / SUSPICIOUS / TAMPERED

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Bun | ≥1.0 | TypeScript runtime |
| uv | ≥0.4 | Python package manager |
| Python | ≥3.10 | TruFor inference |
| AWS CLI | ≥2.0 | Download weights from S3 |

## Setup

```bash
# 1. Install TypeScript dependencies (from repo root)
bun install

# 2. Install Python dependencies + download TruFor weights (~281 MB)
bash agents/document-forensics/setup.sh
```

The setup script:
- Runs `uv sync` inside `agents/document-forensics/python/`
- Downloads TruFor weights from S3 (`s3://banyan-ml-weights/trufor/trufor.pth.tar`) to `python/weights/trufor/trufor.pth.tar`
- Requires valid AWS credentials (run `aws sso login` first if using SSO)

### Environment Variables

| Variable | Required | Default | Purpose |
|----------|----------|---------|---------|
| `GEMINI_API_KEY` | Yes | — | Google Generative AI key for OCR |
| `PYTHON_BRIDGE_TIMEOUT` | No | `120000` | TruFor subprocess timeout (ms) |
| `TRUFOR_WEIGHTS_PATH` | No | `python/weights/trufor/trufor.pth.tar` | Override weights path |

Store secrets in AWS SSM (see root `CLAUDE.md`), not in `.env` files.

## Folder Structure

```
agents/document-forensics/
├── handler.ts                   # Entry point — three handler functions
├── forensics.ts                 # Orchestration (Gemini + TruFor + scoring)
├── config.ts                    # Paths, timeouts, env vars
├── types.ts                     # Result types (FieldResult, DocumentForensicsResult, etc.)
├── core/
│   ├── image-loader.ts          # Sharp-based image loading (CHW/HWC)
│   └── result-formatter.ts      # Heatmap → PNG + scores
├── extraction/
│   ├── types.ts                 # ExtractedField, RISK_WEIGHTS, KEY_FIELDS
│   ├── field-scorer.ts          # Per-field anomaly scoring + verdict
│   ├── gemini-extractor.ts      # Gemini Vision OCR (default)
│   └── easyocr-extractor.ts     # EasyOCR via Python subprocess (alternative)
├── bridge/
│   └── python-bridge.ts         # Generic Python subprocess bridge
├── methods/
│   ├── base.ts                  # ForensicMethod interface
│   └── ela.ts                   # Error Level Analysis (pure TypeScript)
├── utils/
│   ├── math-utils.ts            # mean, max, std, median, clamp, etc.
│   ├── heatmap.ts               # JET colormap
│   ├── image-utils.ts           # RGB/YCrCb, CHW/HWC conversions
│   └── forensics-visualizer.ts  # Summary PNG generation
├── tests/                       # Vitest unit tests
├── setup.sh                     # One-time setup script
└── python/                      # Bundled Python package
    ├── pyproject.toml
    ├── config.py                # resolve_device() (cpu/cuda/mps/auto)
    ├── base.py                  # BaseTorchMethod
    ├── preprocessing/           # Image preprocessing pipeline
    ├── utils/                   # Image I/O helpers
    └── methods/
        ├── trufor/              # TruFor model (SegFormer-B2 + Noiseprint++)
        │   ├── predictor.py     # Entry point called by TypeScript
        │   ├── method.py        # TruFor forward pass
        │   ├── config.py        # Architecture configs + weight loading
        │   └── models/          # DnCNN, CMX encoder/decoder
        └── easyocr_extract.py   # EasyOCR field extraction
```

## Usage

### From TypeScript

```typescript
import { handleAnalyze, handleBatch, handleExtractFields } from './agents/document-forensics/handler.ts';
```

### Analyze a Single Document

```typescript
const result = await handleAnalyze({
  image_path: '/path/to/medical-receipt.jpg',
  ocr_engine: 'gemini',   // 'gemini' (default) or 'easyocr'
  device: 'cpu',           // 'auto' | 'cpu' | 'mps' (Mac) | 'cuda' (GPU)
});

console.log(result.verdict);          // 'NORMAL' | 'SUSPICIOUS' | 'TAMPERED' | 'ERROR'
console.log(result.overall_score);    // 0.0 – 1.0
console.log(result.risk_level);       // 'low' | 'medium' | 'high'
console.log(result.fields);           // Per-field breakdown with anomaly scores
console.log(result.heatmap_b64);      // Base64 PNG of the TruFor heatmap
```

### Batch Analysis

```typescript
const batch = await handleBatch({
  image_paths: ['/path/a.jpg', '/path/b.jpg', '/path/c.jpg'],
  device: 'auto',
  concurrency: 3,       // parallel workers (default: 3)
});

console.log(batch.summary.verdicts);  // { NORMAL: 2, SUSPICIOUS: 1, TAMPERED: 0, ERROR: 0 }
console.log(batch.summary.avg_score); // 0.15
```

### Extract Fields Only (no TruFor)

Useful when you only need OCR results without tampering analysis:

```typescript
const fields = await handleExtractFields({
  image_path: '/path/to/document.jpg',
  ocr_engine: 'gemini',
});

console.log(fields.fields);
// [
//   { label: 'patient_name', text: 'Nguyen Van A', confidence: 0.95, bbox: { x: 120, y: 45, width: 200, height: 30 } },
//   { label: 'amount', text: '1,500,000', confidence: 0.92, bbox: { x: 300, y: 180, width: 150, height: 28 } },
//   ...
// ]
```

### Quick CLI Test

```bash
GEMINI_API_KEY=your-key bun -e "
  import { handleAnalyze } from './agents/document-forensics/handler.ts';
  const r = await handleAnalyze({ image_path: process.argv[1] });
  console.log(JSON.stringify(r, null, 2));
" /path/to/test-image.jpg
```

## Response Types

### `DocumentForensicsResult`

```typescript
{
  success: boolean;
  verdict: 'NORMAL' | 'SUSPICIOUS' | 'TAMPERED' | 'ERROR';
  overall_score: number;          // 0.0 – 1.0
  risk_level: 'low' | 'medium' | 'high';
  trufor: {
    global_score: number;         // TruFor's global confidence
    detection_score: number | null;
  };
  image: { path: string; width: number; height: number };
  ocr_analysis: {
    total_fields: number;
    field_types_found: string[];  // ['patient_name', 'amount', 'date', ...]
  };
  highest_risk_field: {           // Field with the highest anomaly score
    type: string;
    risk_weight: number;
    text: string;
    scores: { anomaly: number; heatmap_mean: number; heatmap_max: number };
  } | null;
  fields: FieldResult[];          // All scored fields
  heatmap_b64: string | null;     // Base64-encoded PNG heatmap
  visualization_path: string | null;
  notes: string[];
  error?: string;
}
```

### `FieldResult`

Each extracted field scored against the TruFor heatmap:

```typescript
{
  type: string;         // 'patient_name', 'amount', 'date', etc.
  risk_weight: number;  // 0.0 – 1.0 (higher = more suspicious if tampered)
  text: string;         // OCR'd text value
  confidence: number;   // OCR confidence 0–1
  bbox: { x: number; y: number; width: number; height: number } | null;
  scores: {
    anomaly: number;      // Composite anomaly score (0–1)
    heatmap_mean: number; // Mean heatmap value within the bounding box
    heatmap_max: number;  // Max heatmap value within the bounding box
  };
}
```

### `BatchForensicsResult`

```typescript
{
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
    visualization: string | null;
    error?: string;
  }>;
  output_dir: string | null;
}
```

## How Scoring Works

### Field Risk Weights

Each field type has a static risk weight reflecting how valuable it is to a fraudster:

| Field | Weight | Key Field? |
|-------|--------|------------|
| `patient_name` | 1.0 | Yes |
| `total` | 0.95 | Yes |
| `insurance_id` | 0.9 | Yes |
| `amount` | 0.9 | Yes |
| `price` | 0.85 | Yes |
| `diagnosis` | 0.8 | Yes |
| `id_number` | 0.8 | Yes |
| `date` | 0.7 | Yes |
| `item_name` | 0.7 | No |
| `doctor_name` | 0.7 | No |
| `quantity` | 0.6 | No |
| `stamp` | 0.6 | No |
| `hospital_name` | 0.5 | No |

### Per-Field Anomaly Score

For each field with a bounding box, the scorer extracts heatmap statistics within that region:

```
anomaly = (heatmap_mean × 0.3 + heatmap_max × 0.5 + heatmap_std × 0.2) × risk_weight
```

### Verdict Computation

Only **key fields** (patient_name, amount, total, price, insurance_id, date, id_number, diagnosis) drive the verdict:

```
overall_score = max(key_anomaly_scores) × 0.6 + mean(key_anomaly_scores) × 0.4
```

| Overall Score | Verdict | Risk Level |
|---------------|---------|------------|
| < 0.35 | NORMAL | low |
| 0.35 – 0.55 | SUSPICIOUS | medium |
| > 0.55 | TAMPERED | high |

If no key fields are found, the overall score is the mean of all field scores.

## OCR Engines

### Gemini Vision (default)

- Uses Google Generative AI SDK (`@google/genai`)
- Sends the document image to `gemini-2.5-flash`
- Returns structured fields with bounding boxes via Zod schema validation
- Requires `GEMINI_API_KEY`
- Bounding boxes are normalized 0–1000 coordinates converted to absolute pixels

### EasyOCR (alternative)

- Runs via Python subprocess
- Supports Vietnamese + English (`vi,en`)
- No API key required — fully local
- Uses heuristic field classification (regex patterns for dates, amounts, IDs)
- Lower accuracy for field type classification compared to Gemini

## TruFor Deep Learning Model

[TruFor](https://grip-unina.github.io/TruFor/) is a forgery detection model from the University of Naples that produces:

- **Heatmap**: pixel-level tampering probability (0.0 = authentic, 1.0 = forged)
- **Global score**: overall document manipulation confidence
- **Detection score**: binary forgery detection confidence

Architecture:
- **Encoder**: SegFormer-B2 dual-stream (RGB + Noiseprint++ features)
- **Noiseprint++**: 17-layer DnCNN extracting camera-model noise patterns
- **Decoder**: MLP decoder with Feature Rectification and Fusion modules
- **Weights**: ~268 MB, stored in S3 (`s3://banyan-ml-weights/trufor/trufor.pth.tar`), downloaded during setup

The TypeScript bridge calls TruFor via `uv run python -c "..."` subprocess, passing the image path and receiving the heatmap as a base64-encoded float32 buffer.

## Calling from Other Agents

This service is designed to be called as a tool by other Banyan agents (overseer, claim-assessor). Wrap `handleAnalyze` as an agent tool:

```typescript
import { Type } from "@mariozechner/pi-ai";
import type { AgentTool } from "@mariozechner/pi-agent-core";
import { handleAnalyze } from "../document-forensics/handler.ts";

export const documentForensicsTool: AgentTool = {
  name: "analyze_document_forgery",
  label: "Document Forgery Analysis",
  description: "Analyze a document image for tampering using TruFor + OCR field scoring",
  parameters: Type.Object({
    image_path: Type.String({ description: "Absolute path to the document image" }),
    device: Type.Optional(Type.String({ description: "Inference device: auto, cpu, mps, cuda" })),
  }),
  async execute(_toolCallId, params) {
    const result = await handleAnalyze({
      image_path: params.image_path,
      device: params.device ?? 'auto',
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      details: {
        verdict: result.verdict,
        score: result.overall_score,
        fields: result.ocr_analysis.total_fields,
      },
    };
  },
};
```

## Running Tests

```bash
# Unit tests (pure TypeScript, no Python/API required)
bunx vitest run agents/document-forensics/tests/

# Typecheck
bunx tsgo --noEmit
```

Tests cover: math utilities, heatmap colormap, image format conversions, field scoring, and verdict computation.

## Deployment (ECS Fargate)

The service runs as an ECS Fargate task behind the shared ALB at `prod.banyan.services.papaya.asia`.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/forensics/health` | Readiness probe (503 until warmup completes) |
| POST | `/forensics/analyze` | Single document analysis (accepts `image_path` or `image_base64`) |
| POST | `/forensics/batch` | Parallel batch analysis |
| POST | `/forensics/extract` | OCR-only field extraction |

Base URL: `https://prod.banyan.services.papaya.asia`

### ECS Configuration

| Setting | Value |
|---------|-------|
| Cluster | `banyan-prod-cluster` |
| Service | `banyan-prod-forensics-service` |
| CPU / Memory | 2 vCPU / 8 GB |
| Platform | Linux x86_64 |
| Port | 4001 |
| Desired count | 1 |
| Health check | `GET /forensics/health` (interval 30s, unhealthy threshold 5) |
| Deregistration delay | 120s |
| Log group | `/ecs/banyan-prod/forensics` (30-day retention) |

### SSM Parameters

| Parameter | Type | Purpose |
|-----------|------|---------|
| `/banyan/forensics/gemini-api-key` | SecureString | Google Generative AI key for OCR |

The server loads the Gemini key from SSM on startup. In local dev, set `GEMINI_API_KEY` env var directly.

### Deploying

```bash
# Deploy only the forensics service
AWS_PROFILE=banyan bash scripts/deploy.sh forensics

# The deploy script:
# 1. Logs into ECR
# 2. Downloads TruFor weights from S3 if not present locally
# 3. Builds the Docker image (linux/amd64) — ~1.5-2 GB
# 4. Pushes to ECR (banyan-document-forensics:latest)
# 5. Forces ECS redeployment
```

### Cost Estimate

| Component | Monthly |
|-----------|---------|
| Fargate 1 task (2 vCPU / 8 GB, x86_64) | ~$85 |
| CloudWatch Logs | ~$2.50 |
| ECR storage (~2 GB) | ~$0.20 |
| **Total** | **~$88** |

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `uv not found` | Install: `curl -LsSf https://astral.sh/uv/install.sh \| sh` |
| `Gemini extraction failed` | Check `GEMINI_API_KEY` is set and valid |
| TruFor timeout | Increase `PYTHON_BRIDGE_TIMEOUT` (default 120s). First run is slow (model loading). |
| `weights not found` | Run `bash agents/document-forensics/setup.sh` (needs AWS credentials) |
| S3 access denied | Run `aws sso login` or check IAM permissions for `s3://banyan-ml-weights` |
| TruFor on Mac | Uses MPS by default (`device: 'auto'`). Pass `device: 'cpu'` if MPS causes issues. |
| `No JSON output` from TruFor | Check Python logs — likely a torch/numpy import error. Run `cd agents/document-forensics/python && uv run python -c "import torch; print(torch.__version__)"` |
