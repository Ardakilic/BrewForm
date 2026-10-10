# ============================================================
# BrewForm — Dockerfile (API)
#
# Stages:
#   deps    — install / cache pnpm dependencies (used by dev containers)
#   builder — full build + type check (used by CI)
#   runner  — production runtime (API only, used by `make preview` / production)
#
# Base image is pinned to node:24.21.0-bookworm-slim to match local Node
# v24.21.0 (see .nvmrc).
# ============================================================

# --- Stage 1: Dependencies ---
# Copies only manifest files, prefetches the pnpm store, then copies the full
# source and installs offline. Used as the base for the dev containers (source
# is volume-mounted at runtime; node_modules survives via a named volume).
FROM node:24.21.0-bookworm-slim AS deps
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline

# --- Stage 2: Build ---
# Migration generation + email templates + full type check. Used by CI and as
# the base for the runner.
FROM deps AS builder
WORKDIR /app
RUN pnpm --filter @brewform/db run generate
RUN pnpm run email-build
RUN pnpm run check

# --- Stage 3: Runtime (API only, with entrypoint) ---
# Minimal production image — the entrypoint runs migrations + first-boot seed,
# then execs the Hono API server. The full app tree copied from the builder
# already includes repo-root scripts/ (e.g. scripts/check-users-empty.ts).
#
# The API runs from TypeScript sources via tsx (there is no tsc emit into
# dist/ — `build` only compiles the email templates), so the runner keeps the
# full install including devDependencies (tsx, drizzle-kit) instead of a pruned
# production deploy.
FROM node:24.21.0-bookworm-slim AS runner
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0 \
  NODE_ENV=production
RUN corepack enable && corepack prepare pnpm@12.10.1 --activate
COPY --from=builder /app /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
# No CMD — the entrypoint execs the API server directly
