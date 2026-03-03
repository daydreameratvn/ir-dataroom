# GPU Forensics Instance — On-Demand, Scale-to-Zero

## Context

The CPU Fargate forensics service (2 vCPU / 8 GB) takes ~200s per image on prod vs ~20s locally. This is because Fargate runs CPU-only PyTorch on x86_64 — no GPU, no MPS. We need a GPU instance that can be turned on/off to save money.

**Approach**: Add a g4dn.xlarge (NVIDIA T4) EC2 instance behind the same `/forensics/*` ALB path, managed by ECS EC2 capacity provider with scale-to-zero. Keep CPU Fargate as always-on fallback. Toggle GPU via simple shell scripts.

**Traffic routing**: ALB weighted forward action — when GPU is on, script switches to 100% GPU. When GPU is off, 100% goes to CPU Fargate.

## Architecture

```
                    ┌──────────────────────────────────────┐
                    │           ALB (/forensics/*)          │
                    │      Weighted Forward Action          │
                    └─────┬──────────────────┬─────────────┘
                          │ weight=0         │ weight=100
                          ▼                  ▼
               ┌──────────────────┐  ┌──────────────────┐
               │  CPU Target Group │  │  GPU Target Group │
               │    (always-on)    │  │   (on-demand)     │
               └────────┬─────────┘  └────────┬──────────┘
                        │                     │
                        ▼                     ▼
               ┌──────────────────┐  ┌──────────────────┐
               │ Fargate Service   │  │ EC2 GPU Service   │
               │ 2 vCPU / 8 GB    │  │ g4dn.xlarge       │
               │ ~200s/image       │  │ 4 vCPU/16GB/T4    │
               │ $85/mo always-on  │  │ ~20s/image        │
               └──────────────────┘  │ $0.63/hr on-demand │
                                     │ $0 when off        │
                                     └──────────────────┘
                                            │
                                     ┌──────┴──────┐
                                     │ Auto Scaling │
                                     │ Group (0-1)  │
                                     └─────────────┘
```

The `forensics-gpu.sh` toggle script manages ALB weights: `on` sets GPU=100/CPU=0, `off` sets CPU=100/GPU=0.

## Files to Create

| File | Purpose |
|------|---------|
| `rootstock/resources/ecs-forensics-gpu.ts` | Pulumi: IAM, launch template, ASG, capacity provider, GPU target group, task def, ECS service, cluster capacity providers |
| `agents/document-forensics/Dockerfile.gpu` | Multi-stage Docker build with CUDA 12.1 PyTorch |
| `agents/document-forensics/python/pyproject.gpu.toml` | pyproject.toml variant pointing to CUDA PyTorch index |
| `scripts/forensics-gpu.sh` | Toggle script: `on` / `off` / `status` |

## Files to Modify

| File | Change |
|------|--------|
| `rootstock/resources/ecs-forensics.ts` | Move listener rule out (avoid circular dep) |
| `rootstock/resources/index.ts` | Add `export * from "./ecs-forensics-gpu.ts"` |
| `rootstock/index.ts` | Add `ForensicsGpuEcrRepoUrl` stack output |
| `scripts/deploy.sh` | Add `forensics-gpu` deploy target |
| `rootstock/overview.md` | Add GPU forensics section |

## Pulumi Resources (ecs-forensics-gpu.ts)

### EC2 Instance Role + Profile
- IAM Role with `ec2.amazonaws.com` trust
- `AmazonEC2ContainerServiceforEC2Role` (ECS agent pulls images, registers)
- `AmazonSSMManagedInstanceCore` (SSM access for debugging)
- Instance profile wrapping the role

### GPU Host Security Group
- `banyan-prod-forensics-gpu-host-sg`
- Egress: all outbound (ECS agent → cluster, ECR, CloudWatch)
- No inbound (ECS tasks use awsvpc mode with their own ENI + forensics SG)

### Launch Template
- `banyan-prod-forensics-gpu-lt`
- AMI: ECS GPU-optimized AL2023 (`al2023-ami-ecs-gpu-hvm-*-x86_64`)
- Instance type: **g4dn.xlarge** (4 vCPU, 16 GB RAM, 1 NVIDIA T4 GPU)
- EBS: 80 GB gp3 root volume (GPU Docker images are large)
- User data: `ECS_CLUSTER=banyan-prod-cluster`, `ECS_ENABLE_GPU_SUPPORT=true`

### Auto Scaling Group
- `banyan-prod-forensics-gpu-asg`
- Single AZ: `banyanPrivateSubnets[0]` (ap-southeast-1a)
- **min=0, max=1, desired=0** (starts at zero cost)
- `protectFromScaleIn: true` (ECS managed termination)

### ECS Capacity Provider
- `banyan-prod-forensics-gpu-cp`
- Managed scaling: enabled, targetCapacity=100, warmup=300s
- Managed termination protection + draining: enabled

### Cluster Capacity Providers
- `aws.ecs.ClusterCapacityProviders` (separate resource, additive)
- Preserves existing `FARGATE` + `FARGATE_SPOT`
- Adds GPU capacity provider
- Default strategy: FARGATE (existing services unaffected)

### GPU Target Group
- `banyan-prod-forensics-gpu-tg`
- Port 4001, HTTP, IP target type (awsvpc on EC2)
- Health check: `/forensics/health`, interval 30s, healthy 2, unhealthy 3

### GPU ECR Repository
- `banyan-document-forensics-gpu`, lifecycle: keep last 5 untagged

### GPU Task Definition
- Family: `banyan-prod-forensics-gpu`
- CPU: 3584 (3.5 vCPU), Memory: 14336 MB (14 GB)
- Compatibility: **EC2** (not FARGATE)
- GPU: `resourceRequirements: [{ type: "GPU", value: "1" }]`
- Env: `PYTHON_BRIDGE_TIMEOUT=300000` (first call loads model into VRAM), `NVIDIA_VISIBLE_DEVICES=all`

### GPU ECS Service
- `banyan-prod-forensics-gpu-service`
- **Desired count: 0** (starts off)
- Capacity provider: GPU capacity provider
- Network: private subnet, forensics SG, no public IP
- `deploymentMinimumHealthyPercent: 0` (allow desired=0)

### ALB Listener Rule (weighted)
Moved here from `ecs-forensics.ts` to avoid circular imports:

Default weights: CPU=100, GPU=0. The `forensics-gpu.sh on` script flips to CPU=0, GPU=100 after the GPU target is healthy. `off` restores CPU=100, GPU=0.

## Docker GPU Image

### `pyproject.gpu.toml`

Same as `pyproject.toml` but uses CUDA 12.1 PyTorch index:

```toml
[[tool.uv.index]]
name = "pytorch-cuda"
url = "https://download.pytorch.org/whl/cu121"
explicit = true

[tool.uv.sources]
torch = [{ index = "pytorch-cuda" }]
torchvision = [{ index = "pytorch-cuda" }]
```

### `Dockerfile.gpu`

Three-stage build:

| Stage | Base Image | Purpose |
|-------|-----------|---------|
| python-deps | `nvidia/cuda:12.1.1-devel-ubuntu22.04` | CUDA PyTorch + Python deps |
| bun-builder | `oven/bun:1` | TS deps (same as CPU) |
| runtime | `nvidia/cuda:12.1.1-runtime-ubuntu22.04` | CUDA runtime + Python + Bun |

Key differences from CPU Dockerfile:
- NVIDIA CUDA base images instead of `python:3.10-slim`
- `pyproject.gpu.toml` → CUDA PyTorch wheels (~2.5 GB vs ~800 MB CPU)
- `NVIDIA_VISIBLE_DEVICES=all`, `NVIDIA_DRIVER_CAPABILITIES=compute,utility`
- `PYTHON_BRIDGE_TIMEOUT=300000` (first TruFor call loads model into VRAM, needs time)
- Estimated image size: ~5-6 GB

**Critical build detail**: The `COPY` order matters. Python source must be copied FIRST, then `pyproject.gpu.toml` overwrites `pyproject.toml`, then `uv.lock` is removed, then `uv sync --no-dev` runs. This ensures CUDA PyTorch is installed (not CPU). The CPU `uv.lock` would cause `uv` to install CPU torch.

The Python `resolve_device('auto')` detects CUDA via `torch.cuda.is_available()` — no code changes needed.

## Toggle Script

```
scripts/forensics-gpu.sh on|off|status
```

Includes cross-platform lock (`mkdir` atomic) to prevent concurrent on/off runs.

### `on`
1. Check for stale instances, clean up if found (deregister CIs, remove scale-in protection, force terminate)
2. Set ASG desired capacity to 1
3. Wait for EC2 instance to register with ECS cluster (poll, up to 5 min)
4. Set GPU ECS service desired count to 1
5. Wait for GPU target to become healthy in TG
6. Switch ALB weights to GPU=100, CPU=0

### `off`
1. Switch ALB weights to CPU=100, GPU=0 (immediate, stops new GPU requests)
2. Set GPU ECS service desired count to 0
3. Wait for running tasks to drain
4. Deregister container instances from ECS cluster (releases lifecycle hooks)
5. Remove scale-in protection from ASG instances
6. Set ASG desired capacity to 0
7. Wait for instances to terminate (force-terminates via EC2 API if stuck after 90s)

### `status`
1. ASG instance count + lifecycle state
2. GPU service desired/running/pending
3. ECS container instances
4. GPU target group health
5. ALB routing weights

## Deploy Script Addition

`scripts/deploy.sh forensics-gpu`:
1. ECR login
2. Download TruFor weights from S3 if missing
3. `docker build --platform linux/amd64 -f Dockerfile.gpu`
4. Push to `banyan-document-forensics-gpu` ECR
5. Force ECS redeployment (if desired > 0)

## Verification

1. `pulumi preview` — verify new resources, no disruption to existing
2. `pulumi up` — create infrastructure (GPU starts at 0, $0 cost)
3. `bash scripts/deploy.sh forensics-gpu` — build + push GPU image
4. `curl .../forensics/health` — CPU still healthy (GPU off)
5. `bash scripts/forensics-gpu.sh on` — start GPU (~3-5 min cold start)
6. `bun scripts/forensics-test-prod.ts case-03` — expect ~20-30s per image
7. `bash scripts/forensics-gpu.sh off` — stop GPU
8. Re-test CPU fallback still works

## Cost Impact

| State | Cost |
|-------|------|
| GPU OFF (default) | **$0/mo** (ASG 0 instances) |
| GPU ON, on-demand | ~$0.63/hr (~$460/mo if 24/7) |
| GPU ON, 8 hrs/day × 20 days | ~$100/mo |
| ECR storage (~5 GB GPU image) | ~$0.50/mo |
| CPU Fargate (always-on, unchanged) | $85/mo |

Toggle model saves **80-95%** vs always-on GPU.

## Performance Comparison (Measured)

Tested with case-03 (2 images: 423 fields + 66 fields):

| Step | CPU Fargate | GPU g4dn.xlarge (warm) | Speedup |
|------|------------|----------------------|---------|
| EasyOCR (66 fields) | ~60s | **8.5s** | 7x |
| EasyOCR (423 fields) | ~55s | **12.7s** | 4x |
| TruFor inference | ~120-200s | **7-8.5s** | 15-25x |
| **Total (66 fields)** | **~200s** | **18s** | **11x** |
| **Total (423 fields)** | **~130s** | **21s** | **6x** |

Runtime info: `device=cuda`, `torch=2.5.1+cu121`, `gpu=Tesla T4`.

| Metric | CPU Fargate | GPU g4dn.xlarge |
|--------|------------|----------------|
| Cold start | 0s (always on) | ~3-5 min (EC2 + ECS + health check) |
| Cost when idle | $85/mo | $0/mo |
| Cost per hour | $0.12/hr | $0.63/hr |
