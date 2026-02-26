FROM oven/bun:1 AS builder

WORKDIR /app

# Build context is repo root — copy auth service files
COPY auth/package.json auth/bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY auth/src/ ./src/
COPY auth/tsconfig.json ./

# Include Fatima knowledge base
COPY platform/docs/oasis-guide.md ./oasis-guide.md

FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./
COPY --from=builder /app/oasis-guide.md ./oasis-guide.md

ENV NODE_ENV=production
ENV PORT=4000
ENV OASIS_GUIDE_PATH=/app/oasis-guide.md

EXPOSE 4000

USER bun
CMD ["bun", "run", "src/index.ts"]
