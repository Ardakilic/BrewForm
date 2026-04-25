# --- Stage 1: Dependencies ---
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*
COPY package.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN npm install

# --- Stage 2: Build ---
FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN deno check apps/api/src/main.ts

# --- Stage 3: Runtime (API only) ---
FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
RUN apt-get update && apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-all", "--env-file", "apps/api/src/main.ts"]