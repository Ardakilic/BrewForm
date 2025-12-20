# ============================================
# BrewForm API Dockerfile
# Using Node.js 24 with Debian Trixie Slim
# ============================================

# Base stage with pnpm
FROM node:24-trixie-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Development dependencies stage
FROM base AS deps
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json ./apps/api/
COPY packages* ./packages/
RUN pnpm install --frozen-lockfile || pnpm install

# Development stage
FROM base AS development
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
WORKDIR /app/apps/api
RUN pnpm db:generate
EXPOSE 3001
CMD ["pnpm", "dev"]

# Builder stage
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
WORKDIR /app/apps/api
RUN pnpm db:generate && pnpm build

# Production stage
FROM node:24-trixie-slim AS production
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home hono

# Copy production files
COPY --from=builder --chown=hono:nodejs /app/apps/api/dist ./dist
COPY --from=builder --chown=hono:nodejs /app/apps/api/package.json ./
COPY --from=builder --chown=hono:nodejs /app/apps/api/node_modules ./node_modules
COPY --from=builder --chown=hono:nodejs /app/apps/api/prisma ./prisma

USER hono
EXPOSE 3001
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["node", "dist/index.js"]
