# ==============================================================
# Document Forensics — Multi-stage Docker Build
#
# Stage 1: Install Python dependencies (torch, TruFor, EasyOCR)
# Stage 2: Install Bun/Node dependencies
# Stage 3: Runtime — Python 3.10 slim + Bun binary
# ==============================================================

# ── Stage 1: Python dependencies ──────────────────────────────
FROM python:3.12-slim AS python-deps

RUN pip install --no-cache-dir uv

WORKDIR /app/agents/document-forensics/python

# Copy Python project manifest and install deps
COPY agents/document-forensics/python/pyproject.toml ./pyproject.toml
RUN uv sync --no-dev

# Copy all Python source files
COPY agents/document-forensics/python/ ./

# ── Stage 2: Bun / TypeScript dependencies ────────────────────
FROM oven/bun:1 AS bun-builder

WORKDIR /app

# Install root dependencies
COPY package.json bun.lock ./
COPY patches/ ./patches/
RUN bun install --frozen-lockfile --production

# Copy TypeScript source for the forensics service
COPY agents/document-forensics/ ./agents/document-forensics/

# Copy root tsconfig (Bun needs it for path resolution)
COPY tsconfig.json ./tsconfig.json

# ── Stage 3: Runtime ──────────────────────────────────────────
FROM python:3.12-slim AS runtime

# System dependencies for sharp (libvips), OpenCV, and general use
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libvips42 \
      libgl1 \
      libglib2.0-0 \
      ca-certificates \
      curl \
      unzip && \
    rm -rf /var/lib/apt/lists/*

# Install uv (needed at runtime — python-bridge.ts calls `uv run`)
COPY --from=python-deps /usr/local/bin/uv /usr/local/bin/uv
COPY --from=python-deps /usr/local/bin/uvx /usr/local/bin/uvx

# Install Bun
RUN curl -fsSL https://bun.sh/install | bash
ENV PATH="/root/.bun/bin:${PATH}"

WORKDIR /app

# Copy node_modules + TS source from stage 2 FIRST
COPY --from=bun-builder /app/node_modules/ ./node_modules/
COPY --from=bun-builder /app/agents/document-forensics/ ./agents/document-forensics/
COPY --from=bun-builder /app/tsconfig.json ./tsconfig.json
COPY --from=bun-builder /app/package.json ./package.json

# Copy Python venv + source from stage 1 AFTER bun-builder
# (bun-builder includes pyproject.toml — this overwrites with correct version + .venv)
COPY --from=python-deps /app/agents/document-forensics/python/ ./agents/document-forensics/python/

# Copy TruFor weights (baked in during build — must exist in build context)
# The deploy script downloads weights from S3 before docker build.
COPY agents/document-forensics/python/weights/ ./agents/document-forensics/python/weights/

# Environment
ENV NODE_ENV=production
ENV PORT=4001
ENV PYTHON_BRIDGE_TIMEOUT=300000

EXPOSE 4001

CMD ["bun", "run", "agents/document-forensics/server.ts"]
