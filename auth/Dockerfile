FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

COPY src/ ./src/
COPY tsconfig.json ./

FROM oven/bun:1-slim

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src ./src
COPY --from=builder /app/package.json ./

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

USER bun
CMD ["bun", "run", "src/index.ts"]
