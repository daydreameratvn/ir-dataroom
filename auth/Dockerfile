FROM oven/bun:1 AS builder

WORKDIR /repo

# Install auth service dependencies
COPY auth/package.json ./auth/
RUN cd auth && bun install --production

# Install root dependencies (needed by agents imported from auth routes)
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Copy source
COPY auth/src/ ./auth/src/
COPY auth/tsconfig.json ./auth/
COPY agents/ ./agents/

# Include local @papaya/graphql shim (used by agents)
COPY packages/graphql/ ./node_modules/@papaya/graphql/

# Include Fatima knowledge base
COPY platform/docs/oasis-guide.md ./platform/docs/oasis-guide.md

FROM oven/bun:1-slim

# Install ffmpeg for video watermarking
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /repo

COPY --from=builder /repo/auth/node_modules ./auth/node_modules
COPY --from=builder /repo/node_modules ./node_modules
COPY --from=builder /repo/auth/src ./auth/src
COPY --from=builder /repo/auth/package.json ./auth/
COPY --from=builder /repo/agents ./agents
COPY --from=builder /repo/platform/docs/oasis-guide.md ./platform/docs/oasis-guide.md

ENV NODE_ENV=production
ENV PORT=4000
ENV OASIS_GUIDE_PATH=/repo/platform/docs/oasis-guide.md

EXPOSE 4000

USER bun
CMD ["bun", "run", "auth/src/index.ts"]
