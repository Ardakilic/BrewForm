# ============================================
# BrewForm API Dockerfile
# Using Deno 2.7.7 with Debian
# ============================================

# Base stage
FROM denoland/deno:debian-2.7.7 AS base
WORKDIR /app

# Dependencies stage — install npm packages for the API
FROM base AS deps
COPY apps/api/package.json apps/api/deno.json apps/api/prisma.config.ts ./apps/api/
COPY apps/api/prisma ./apps/api/prisma
RUN cd apps/api && deno install --allow-scripts
RUN cd apps/api && deno task db:generate

# Development stage
FROM base AS development
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["deno", "task", "dev"]

# Production stage — no compilation needed; Deno runs TypeScript directly
FROM denoland/deno:debian-2.7.7 AS production
WORKDIR /app

# Create non-root user
RUN groupadd --gid 1001 nodejs && \
    useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home hono

# Copy installed packages and source
COPY --from=deps --chown=hono:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --chown=hono:nodejs apps/api/src ./apps/api/src
COPY --from=deps --chown=hono:nodejs /app/apps/api/prisma ./apps/api/prisma
COPY --chown=hono:nodejs apps/api/deno.json apps/api/package.json apps/api/prisma.config.ts ./apps/api/
COPY --chown=hono:nodejs package.json deno.json ./

USER hono
WORKDIR /app/apps/api
EXPOSE 3001
ENV NODE_ENV=production

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3001/health || exit 1

CMD ["deno", "run", "--allow-all", "src/index.ts"]
