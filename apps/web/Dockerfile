# ============================================
# BrewForm Web Dockerfile
# Using Deno 2.7.11 with Debian (build stages)
# Nginx for production static serving
# ============================================

# Base stage
FROM denoland/deno:debian-2.7.11 AS base
WORKDIR /app

# Dependencies stage — install npm packages for the web app
FROM base AS deps
COPY deno.json ./deno.json
COPY apps/web/deno.json apps/web/deno.lock apps/web/vite.config.ts ./apps/web/
RUN cd /app/apps/web && deno install --allow-scripts && mkdir -p /app/node_modules

# Development stage
FROM base AS development
COPY --from=deps /app/node_modules ./apps/web/node_modules
COPY . .
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["deno", "task", "dev"]

# Builder stage
FROM base AS builder
COPY --from=deps /app/node_modules ./apps/web/node_modules
COPY . .
WORKDIR /app/apps/web
RUN deno task build

# Production stage - serve with nginx
FROM nginx:trixie AS production

# Copy custom nginx config
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
