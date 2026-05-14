# ============================================================
# BrewForm — Dockerfile
#
# Stages:
#   deps    — install / cache Deno dependencies (used by dev containers)
#   builder — full build + type check (used by CI)
#   runner  — production runtime (API only, used by `make preview` / production)
# ============================================================

# --- Stage 1: Dependencies ---
# Copies only manifest files and caches all Deno/npm dependencies.
# Used as the base for the dev containers (source is volume-mounted at runtime).
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
COPY package.json turbo.json .npmrc deno.json deno.lock ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
RUN deno install --frozen

# --- Stage 2: Build ---
# Full source copy + type check. Used by CI and as the base for the runner.
FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
COPY --from=deps /root/.cache/deno /root/.cache/deno
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate
RUN deno check --unstable-sloppy-imports apps/api/src/main.ts

# --- Stage 3: Runtime (API only) ---
# Minimal production image — runs the Hono API server.
FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
COPY --from=builder /root/.cache/deno /root/.cache/deno
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-sloppy-imports", "--unstable-cron", "apps/api/src/main.ts"]
