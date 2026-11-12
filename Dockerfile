# ============================================================
# BrewForm — Dockerfile (API)
#
# Stages:
#   deps    — install / cache pnpm dependencies (used by dev containers)
#   builder — full build + type check (used by CI)
#   runner  — production runtime (API only, used by `make preview` / production)
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
# already includes the db workspace script (packages/db/src/check-users-empty.ts).
#
# The API runs from TypeScript sources via tsx (there is no tsc emit into
# dist/ — `build` only compiles the email templates), so the runner keeps the
# full install including devDependencies (tsx, drizzle-kit) instead of a pruned
# production deploy.
FROM node:26.13.1-trixie-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN npm install -g --allow-scripts=pnpm pnpm@12.18.0
COPY --from=builder /app /app
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
# No CMD — the entrypoint execs the API server directly
