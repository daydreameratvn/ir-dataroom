# Deploy: Image Forensic Backend to AWS ECS Fargate

## Context

The document-forensics service (`agents/document-forensics/`) is implemented and tested locally. It needs to be deployed as a standalone ECS Fargate service behind the existing ALB at `prod.banyan.services.papaya.asia`, following the same pattern as the auth service (`rootstock/resources/ecs-auth.ts`).

The service requires both **Bun** (TypeScript runtime) and **Python 3.10+** (TruFor deep learning), making the Docker image larger than auth. TruFor model weights (268 MB) are stored in S3 at `s3://banyan-ml-weights/trufor/trufor.pth.tar` and baked into the Docker image at build time.

## Architecture

```
                          Internet
                             │
                     ┌───────▼────────┐
                     │  ALB (HTTPS)   │
                     │  prod.banyan.  │
                     │  services.     │
                     │  papaya.asia   │
                     └──┬──────────┬──┘
                        │          │
              /auth/*   │          │  /forensics/*
                        │          │
               ┌────────▼──┐   ┌──▼──────────┐
               │ Auth ECS  │   │ Forensics   │
               │ 256 CPU   │   │ ECS         │
               │ 512 MB    │   │ 2048 CPU    │
               │ Port 4000 │   │ 8192 MB     │
               └───────────┘   │ Port 4001   │
                               └──────┬──────┘
                                      │
                             ┌────────▼────────┐
                             │  Python subprocess
                             │  (uv run)       │
                             │  TruFor model   │
                             │  + EasyOCR      │
                             └────────┬────────┘
                                      │
                              ┌───────▼───────┐
                              │ Gemini API    │
                              │ (OCR fields)  │
                              └───────────────┘
```

## What We're Building

| Component | Details |
|-----------|---------|
| **Runtime** | Bun (TypeScript) + Python 3.10 (TruFor, EasyOCR) |
| **Compute** | ECS Fargate, 2 vCPU / 8 GB RAM, x86_64, CPU-only (no GPU) |
| **Networking** | Private subnets, ALB path `/forensics/*`, port 4001 |
| **Image** | ~1.5-2 GB (PyTorch CPU + weights baked in) |
| **Scaling** | 1 task initially, scale up later |
| **Cost** | ~$88/month increment |

## Files to Create

| File | Purpose |
|------|---------|
| `agents/document-forensics/server.ts` | Bun HTTP server wrapping existing handler functions |
| `agents/document-forensics/Dockerfile` | Multi-stage Docker build (Python base + Bun) |
| `rootstock/resources/ecs-forensics.ts` | Pulumi: ECR, security group, logs, target group, ALB rule, task def, ECS service |

## Files to Modify

| File | Change |
|------|--------|
| `rootstock/resources/index.ts` | Add `export * from "./ecs-forensics.ts"` |
| `rootstock/index.ts` | Add `ForensicsEcrRepoUrl` to stack outputs |
| `scripts/deploy.sh` | Add `forensics` deploy target |
| `docs/image-forensic-backend.md` | Add deployment section |

---

## Step 1: Create HTTP Server (`server.ts`)

**File**: `agents/document-forensics/server.ts`

A minimal Bun HTTP server wrapping the three existing handler functions. This is the Docker `CMD` entry point.

### Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/forensics/health` | ALB health check |
| POST | `/forensics/analyze` | Analyze single document |
| POST | `/forensics/batch` | Analyze multiple documents |
| POST | `/forensics/extract` | Extract fields only (no TruFor) |

### Startup Sequence

1. Start HTTP server on `PORT` (default 4001)
2. If `GEMINI_API_KEY` is not set, fetch from SSM at `/banyan/forensics/gemini-api-key` (requires `@aws-sdk/client-ssm`)
3. Run warmup: `checkPythonAvailable()` + `checkTruForWeights()` from `bridge/python-bridge.ts`
4. Health endpoint returns `503 degraded` until warmup completes, then `200 healthy`

### Base64 Input Handling

When `image_base64` is provided (no `image_path`), the server:
1. Decodes base64 to a Buffer
2. Writes to a temp file in `/tmp/forensics-<uuid>.jpg`
3. Passes the temp file path to the handler
4. Cleans up the temp file after response

### Example Request

```bash
curl -X POST https://prod.banyan.services.papaya.asia/forensics/analyze \
  -H 'Content-Type: application/json' \
  -d '{
    "image_base64": "<base64-encoded-image>",
    "ocr_engine": "gemini",
    "device": "cpu"
  }'
```

---

## Step 2: Create Dockerfile

**File**: `agents/document-forensics/Dockerfile`

Multi-stage build with Python as the base (Python + PyTorch is the heavyweight dependency; Bun is a single binary on top).

### Stage 1: Python Dependencies

```dockerfile
FROM python:3.10-slim AS python-builder
RUN pip install uv
WORKDIR /app/python
COPY agents/document-forensics/python/pyproject.toml .
RUN uv sync --no-dev
COPY agents/document-forensics/python/ .
```

### Stage 2: Bun + TypeScript Dependencies

```dockerfile
FROM oven/bun:1 AS bun-builder
WORKDIR /repo
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production
COPY agents/document-forensics/ ./agents/document-forensics/
COPY tsconfig.json ./
```

### Stage 3: Final Runtime

```dockerfile
FROM python:3.10-slim AS runtime

# System deps for sharp (libvips) + Bun install
RUN apt-get update && apt-get install -y --no-install-recommends \
    libvips42 ca-certificates curl unzip && \
    curl -fsSL https://bun.sh/install | bash && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun && \
    apt-get clean && rm -rf /var/lib/apt/lists/*

RUN pip install uv

WORKDIR /repo

# Python environment + source + weights (baked in)
COPY --from=python-builder /app/python ./agents/document-forensics/python/
RUN cd agents/document-forensics/python && uv sync --no-dev

# Bun dependencies + TypeScript source
COPY --from=bun-builder /repo/node_modules ./node_modules
COPY --from=bun-builder /repo/agents/document-forensics ./agents/document-forensics
COPY --from=bun-builder /repo/tsconfig.json ./

ENV NODE_ENV=production
ENV PORT=4001
ENV PYTHON_BRIDGE_TIMEOUT=120000

EXPOSE 4001
CMD ["bun", "run", "agents/document-forensics/server.ts"]
```

### Why Bake Weights Into the Image?

- Avoids 15-30s cold start delay downloading from S3 at every task launch
- No S3 credentials needed on the task role at runtime
- No risk of S3 failures blocking health checks
- ECR-to-Fargate pulls within the same region are fast and free
- Trade-off: image is ~1.5-2 GB instead of ~300 MB

The deploy script downloads weights from S3 **before** `docker build` and passes them into the build context.

---

## Step 3: Create Pulumi Resources

**File**: `rootstock/resources/ecs-forensics.ts`

Mirrors the exact pattern of `rootstock/resources/ecs-auth.ts` (272 lines). All forensics-related infrastructure in one file.

### Resources Created

#### ECR Repository: `banyan-document-forensics`
```typescript
new aws.ecr.Repository("banyan-document-forensics", {
  name: "banyan-document-forensics",
  imageScanningConfiguration: { scanOnPush: true },
  imageTagMutability: "MUTABLE",
});
// + lifecycle policy: keep last 10 untagged images
```

#### Security Group: `banyan-prod-forensics-sg`
```
Ingress: TCP 4001 from banyan-prod-alb-sg
Egress:  All outbound (0.0.0.0/0)
```
No RDS access needed (unlike auth).

#### CloudWatch Log Group
```
Name: /ecs/banyan-prod/forensics
Retention: 30 days
```

#### Target Group: `banyan-prod-forensics-tg`
```
Port: 4001, HTTP, IP target type
Health check:
  Path: /forensics/health
  Interval: 30s
  Timeout: 10s
  Healthy threshold: 2
  Unhealthy threshold: 5  (gives 2.5 min for model startup)
Deregistration delay: 120s (allow in-flight requests to finish)
```

#### ALB Listener Rule
```
Priority: 200
Path pattern: /forensics/*
Action: forward to banyan-prod-forensics-tg
```
Auth service uses priority 100 for `/auth/*`. Non-overlapping paths.

#### IAM Policy: `banyan-prod-forensics-task-policy`
```json
{
  "Effect": "Allow",
  "Action": ["ssm:GetParameter"],
  "Resource": "arn:aws:ssm:ap-southeast-1:*:parameter/banyan/forensics/*"
}
```
Attached to the shared `banyanTaskRole`.

#### Task Definition: `banyan-prod-forensics`

| Setting | Value |
|---------|-------|
| CPU | 2048 (2 vCPU) |
| Memory | 8192 MB |
| Platform | LINUX / X86_64 |
| Network | awsvpc |
| Container port | 4001 |

**Environment variables:**
```
PORT=4001
NODE_ENV=production
AWS_REGION=ap-southeast-1
PYTHON_BRIDGE_TIMEOUT=120000
```

GEMINI_API_KEY is **not** injected as an ECS secret. Instead, `server.ts` fetches it from SSM at startup using the task role's SSM permissions.

#### ECS Service: `banyan-prod-forensics-service`
```
Cluster: banyan-prod-cluster
Desired count: 1
Launch type: FARGATE
Subnets: private (10.68.10.0/24, 10.68.11.0/24)
Public IP: false
Load balancer: banyan-prod-forensics-tg on port 4001
```

### Imports from Existing Resources

```typescript
import { banyanAlbListener } from "./alb.ts";
import { banyanCluster } from "./ecs-cluster.ts";
import { banyanExecRole, banyanTaskRole } from "./ecs-iam.ts";
import { banyanAlbSg } from "./security-groups.ts";
import { banyanVpc, banyanPrivateSubnets } from "./vpc.ts";
```

---

## Step 4: Update Existing Files

### `rootstock/resources/index.ts`
```typescript
// Add at the end:
export * from "./ecs-forensics.ts";
```

### `rootstock/index.ts`
```typescript
// Add to stackOutputs:
ForensicsEcrRepoUrl: resources.banyanForensicsEcrRepo.repositoryUrl,
```

### `scripts/deploy.sh`

Add `deploy_forensics()` function:

```bash
deploy_forensics() {
  echo ">>> Building document-forensics Docker image..."
  local ECR_URL="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com/banyan-document-forensics"

  # Login to ECR
  aws ecr get-login-password --region "$REGION" \
    | docker login --username AWS --password-stdin "$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

  # Download TruFor weights from S3 if not present
  local WEIGHTS_FILE="$REPO_ROOT/agents/document-forensics/python/weights/trufor/trufor.pth.tar"
  if [ ! -f "$WEIGHTS_FILE" ]; then
    echo ">>> Downloading TruFor weights from S3..."
    mkdir -p "$(dirname "$WEIGHTS_FILE")"
    aws s3 cp s3://banyan-ml-weights/trufor/trufor.pth.tar "$WEIGHTS_FILE"
  fi

  # Build from repo root
  docker build --platform linux/amd64 \
    -t "$ECR_URL:latest" \
    -f "$REPO_ROOT/agents/document-forensics/Dockerfile" \
    "$REPO_ROOT"

  echo ">>> Pushing to ECR..."
  docker push "$ECR_URL:latest"

  echo ">>> Forcing ECS service update..."
  aws ecs update-service \
    --cluster banyan-prod-cluster \
    --service banyan-prod-forensics-service \
    --force-new-deployment \
    --region "$REGION" \
    --query 'service.serviceName' --output text

  echo ">>> Document forensics deployed."
}
```

Add `forensics` to the case statement:
```bash
case "$TARGET" in
  auth)             deploy_auth ;;
  frontend)         deploy_frontend ;;
  investor-portal)  deploy_investor_portal ;;
  forensics)        deploy_forensics ;;
  all)              deploy_auth; deploy_frontend; deploy_investor_portal; deploy_forensics ;;
  *)                echo "Usage: $0 [frontend|auth|investor-portal|forensics|all]"; exit 1 ;;
esac
```

---

## Step 5: Store GEMINI_API_KEY in SSM

```bash
AWS_PROFILE=banyan aws ssm put-parameter \
  --name /banyan/forensics/gemini-api-key \
  --type SecureString \
  --value '<your-gemini-api-key>' \
  --region ap-southeast-1
```

The `server.ts` fetches this on startup via `@aws-sdk/client-ssm`. In local development, the `GEMINI_API_KEY` environment variable takes precedence (no SSM call).

---

## Step 6: Deploy Infrastructure (Pulumi)

```bash
# From rootstock/ directory
export PULUMI_CONFIG_PASSPHRASE=$(AWS_PROFILE=banyan aws ssm get-parameter \
  --name /banyan/pulumi/config-passphrase --with-decryption \
  --region ap-southeast-1 --query Parameter.Value --output text) && \
  eval $(aws configure export-credentials --profile banyan --format env) && \
  pulumi up --yes
```

This creates the ECR repo, security group, log group, target group, ALB rule, task definition, and ECS service.

---

## Step 7: Build and Deploy Container

```bash
AWS_PROFILE=banyan bash scripts/deploy.sh forensics
```

This:
1. Logs into ECR
2. Downloads TruFor weights from S3 (if not already local)
3. Builds the Docker image (~1.5-2 GB)
4. Pushes to ECR
5. Forces ECS to roll out new tasks

---

## Verification Checklist

| Check | Command |
|-------|---------|
| Pulumi preview | `pulumi preview` |
| Docker builds | `docker build --platform linux/amd64 -f agents/document-forensics/Dockerfile .` |
| Local server | `PORT=4001 bun run agents/document-forensics/server.ts` |
| Health (local) | `curl http://localhost:4001/forensics/health` |
| Health (prod) | `curl https://prod.banyan.services.papaya.asia/forensics/health` |
| Analyze (prod) | `curl -X POST .../forensics/analyze -d '{"image_base64":"..."}' ` |
| ECS logs | CloudWatch → `/ecs/banyan-prod/forensics` |
| ECS service | `aws ecs describe-services --cluster banyan-prod-cluster --services banyan-prod-forensics-service` |

---

## Environment Variables

| Variable | Where | Purpose |
|----------|-------|---------|
| `GEMINI_API_KEY` | SSM `/banyan/forensics/gemini-api-key` | Gemini Vision OCR |
| `PORT` | Container env (4001) | HTTP server port |
| `NODE_ENV` | Container env (production) | Runtime mode |
| `AWS_REGION` | Container env (ap-southeast-1) | SSM region for secret fetch |
| `PYTHON_BRIDGE_TIMEOUT` | Container env (120000) | TruFor subprocess timeout (ms) |

---

## Cost Impact

| Component | Monthly Cost |
|-----------|-------------|
| Fargate (1 task: 2 vCPU, 8 GB, x86_64, 24/7) | ~$85 |
| CloudWatch Logs (~5 GB) | ~$2.50 |
| ECR storage (~2 GB image) | ~$0.20 |
| **Total increment** | **~$88/month** |
| **New total infra** | **~$308/month** (from ~$220) |

---

## Performance Expectations

| Operation | Latency (2 vCPU CPU-only) |
|-----------|--------------------------|
| TruFor inference | 30-60s per image |
| Gemini OCR extraction | 3-8s per image |
| Field scoring + verdict | <100ms |
| **Full pipeline** | **35-70s per image** |
| Health check | <10ms |

For faster inference, upgrade to GPU (Fargate GPU or EC2 g4dn) in the future — reduces TruFor to ~2-5s per image.

---

## Security

- **No public IP** — Fargate tasks run in private subnets, accessible only via ALB
- **GEMINI_API_KEY** — stored as SecureString in SSM, fetched at runtime via IAM task role
- **Security group** — only accepts traffic from the ALB on port 4001
- **No RDS access** — forensics service has no database connectivity
- **Outbound** — allows all (needed for Gemini API, ECR pulls, CloudWatch logs)

---

## Future Improvements

- **GPU acceleration** — switch to Fargate GPU or EC2 g4dn for 10x faster TruFor inference
- **Auto-scaling** — add target tracking policy based on CPU utilization or request count
- **CI/CD pipeline** — GitHub Actions workflow triggered on push to `agents/document-forensics/**`
- **Request queue** — SQS queue for async batch processing with DLQ for failures
- **Caching** — cache TruFor results by image hash to avoid re-processing
