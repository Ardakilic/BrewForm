# --- Stage 1: Dependencies ---
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
COPY package.json turbo.json .npmrc deno.json deno.lock ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
RUN deno install --frozen

# --- Stage 2: Build ---
FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate
RUN deno check --unstable-sloppy-imports apps/api/src/main.ts

# --- Stage 3: Runtime (API only) ---
FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
COPY --from=builder /app .
EXPOSE 8000
# compose.yml sets CACHE_DRIVER=memory, so Deno KV is not utilized locally.
# The --allow-kv flag was removed in Deno 2.x and does not exist in 2.7.13.
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-sloppy-imports", "--unstable-cron", "apps/api/src/main.ts"]
