# ============================================================
# BrewForm — Dockerfile (API)
#
# Stages:
#   deps      — install / cache pnpm dependencies (used by dev containers)
#   builder   — email templates + full type check (used by CI). It never runs
#               `drizzle-kit generate`: the committed packages/db/drizzle migrations
#               are authoritative and CI checks their freshness.
#   prod-deps — production dependency closure of @brewform/api (`pnpm install --prod`),
#               with the web app, docs, tests and coverage output removed
#   runner    — production runtime (API only, used by `make preview`,
#               compose.production.yml and Coolify)
#
# The runner holds only package.json, pnpm-workspace.yaml, node_modules, apps/api,
# packages/db, packages/shared and files/ (no pnpm, tsx, drizzle-kit, vitest or
# typescript). It runs as the unprivileged `node` user (UID/GID 1000) under tini:
# `/app/docker-entrypoint.sh [serve|migrate]` runs `node packages/db/src/migrate.ts`,
# the first-boot seed, then `exec node src/main.ts` (Node 26 native type stripping),
# so the API is the one Node process and receives SIGTERM directly.
#
# Health: the image HEALTHCHECK probes READINESS (`/ready`: database reachable and not
# shutting down) with the dependency-free /app/healthcheck.mjs — the image has no curl
# or wget. Docker never restarts an unhealthy container; its health status only gates
# traffic and rollouts (compose `service_healthy`, Coolify, Traefik), which is
# readiness. `/health` (liveness) is for external uptime monitors.
#
# Base image is pinned to node:26.13.0-trixie-slim (Node 26 LTS, see .nvmrc).
# Node 25+ no longer bundles corepack, so pnpm is installed globally via npm;
# keep its version in sync with `packageManager` in package.json.
# ============================================================

# --- Stage 1: Dependencies ---
# Copies only manifest files, prefetches the pnpm store, then copies the full
# source and installs offline. Used as the base for the dev containers (source
# is volume-mounted at runtime; node_modules survives via a named volume).
FROM node:26.13.1-trixie-slim AS deps
WORKDIR /app
RUN npm install -g --allow-scripts=pnpm pnpm@12.18.0
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN pnpm fetch
COPY . .
RUN pnpm install --frozen-lockfile --offline

# --- Stage 2: Build ---
# Email templates + full type check. Used by CI and as the base for prod-deps.
FROM deps AS builder
WORKDIR /app
RUN pnpm run email-build
RUN pnpm run check

# --- Stage 3: Production dependencies ---
# Reinstalls node_modules with production dependencies only (offline, from the
# store fetched in `deps`), limited to @brewform/api and its workspace
# dependencies (@brewform/db, @brewform/shared), then drops everything the API
# never reads at runtime. node_modules is removed first so pnpm does not ask to
# purge it (that prompt fails without a TTY).
FROM builder AS prod-deps
WORKDIR /app
RUN rm -rf node_modules apps/*/node_modules packages/*/node_modules \
  && pnpm install --prod --frozen-lockfile --offline --filter "@brewform/api..." \
  && rm -rf apps/web openspec plans docs \
    coverage apps/api/coverage packages/db/coverage packages/shared/coverage \
    apps/api/src/test-fixtures apps/api/uploads \
  && find apps/api packages -path '*/node_modules' -prune -o -type f \
    \( -name '*.test.ts' -o -name 'test-helpers.ts' -o -name 'test-setup.ts' \) -print \
    | xargs rm -f

# --- Stage 4: Runtime (API only, with entrypoint) ---
# Minimal non-root production image. tini (PID 1, `-g` forwards signals to the
# entrypoint's process group) runs docker-entrypoint.sh, which migrates, seeds a
# fresh database and then execs `node src/main.ts`.
FROM node:26.13.1-trixie-slim AS runner
WORKDIR /app
ENV NODE_ENV=production UPLOAD_DIR=/app/uploads
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini \
  && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/package.json /app/pnpm-workspace.yaml ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=prod-deps /app/apps/api ./apps/api
COPY --from=prod-deps /app/packages/db ./packages/db
COPY --from=prod-deps /app/packages/shared ./packages/shared
COPY --from=prod-deps /app/files ./files
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
COPY apps/api/scripts/healthcheck.mjs /app/healthcheck.mjs
# A fresh named volume mounted at /app/uploads inherits this `node` ownership.
RUN chmod +x /app/docker-entrypoint.sh \
  && mkdir -p /app/uploads \
  && chown node:node /app/uploads
USER node
EXPOSE 8000
# Readiness probe (see the header): exit 0 only on `200` from GET /ready.
HEALTHCHECK --interval=15s --timeout=5s --start-period=180s --start-interval=2s --retries=3 \
  CMD ["node", "/app/healthcheck.mjs", "/ready"]
ENTRYPOINT ["/usr/bin/tini", "-g", "--", "/app/docker-entrypoint.sh"]
# No CMD — the entrypoint defaults to `serve` and execs the API server directly
