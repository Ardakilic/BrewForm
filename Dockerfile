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
FROM denoland/deno:debian-2.7.14 AS deps
WORKDIR /app
COPY deno.json deno.lock package.json ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
RUN deno install --frozen

# --- Stage 2: Build ---
# Full source copy + type check. Used by CI and as the base for the runner.
FROM denoland/deno:debian-2.7.14 AS builder
WORKDIR /app
COPY --from=deps /deno-dir /deno-dir
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate
RUN deno task email-build
RUN deno check apps/api/src/main.ts

# --- Stage 3: Runtime (API only, with entrypoint) ---
# Minimal production image — the entrypoint runs migrations + first-boot seed,
# then execs the Hono API server. The full app tree copied from the builder
# already includes repo-root scripts/ (e.g. scripts/check-users-empty.ts).
FROM denoland/deno:debian-2.7.14 AS runner
WORKDIR /app
COPY --from=builder /deno-dir /deno-dir
COPY --from=builder /app .
COPY docker-entrypoint.sh /app/docker-entrypoint.sh
RUN chmod +x /app/docker-entrypoint.sh
EXPOSE 8000
ENTRYPOINT ["/app/docker-entrypoint.sh"]
# No CMD — the entrypoint execs the API server directly
