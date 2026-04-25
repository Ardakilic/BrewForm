# BrewForm Phase 1 — Complete Implementation Plan

This file contains the full specification for every file that needs to be created in Phase 1.

## Status: READY (blocked by write permissions)

## File Inventory (26 files)

### Root Configuration Files

#### 1. `.gitignore` (update existing)
```
# Dependencies
node_modules/

# Build outputs
dist/
*.tsbuildinfo

# Coverage
coverage/
*.lcov

# Deno
.deno/

# Environment
.env
.env.local
.env.*.local

# IDE
.vscode/
.idea/
*.swp
*.swo
*~

# OS
.DS_Store
Thumbs.db

# Prisma
packages/db/prisma/migrations/migration_lock.toml
!packages/db/prisma/migrations/

# Logs
*.log

# Docker
docker-compose.override.yml

# Generated
packages/db/src/generated/
```

#### 2. `package.json`
```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "check": "turbo run check"
  },
  "devDependencies": {
    "turbo": "^2.5.0",
    "typescript": "^5.8.0"
  }
}
```

#### 3. `turbo.json`
```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "lint": {},
    "check": {},
    "test": {
      "dependsOn": ["^build"]
    }
  }
}
```

#### 4. `deno.json`
```json
{
  "compilerOptions": {
    "strict": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react"
  },
  "lint": {
    "include": ["src/"],
    "exclude": ["src/generated/"],
    "rules": {
      "tags": ["recommended"]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": true,
    "semiColons": true,
    "include": ["src/"],
    "exclude": ["src/generated/"]
  },
  "test": {
    "include": ["src/"],
    "exclude": ["src/generated/"]
  }
}
```

#### 5. `.env.example`
```
# ============================================
# BrewForm — Environment Configuration
# ============================================
# Copy this file to .env and fill in your values.
# The app must build without any .env file present.

# --- Application ---
APP_PORT=8000
APP_ENV=development

# --- Database (PostgreSQL) ---
DATABASE_URL=postgresql://brewform:brewform@localhost:5432/brewform?connection_limit=10&pool_timeout=30
DATABASE_PROVIDER=postgresql

# --- Cache Driver ---
CACHE_DRIVER=deno-kv

# --- Authentication ---
JWT_SECRET=change-me-to-a-random-secret-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# --- CORS ---
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

# --- Email ---
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@brewform.local

# --- OpenAPI ---
OPENAPI_ENABLED=true

# --- pgAdmin ---
PGADMIN_DEFAULT_EMAIL=admin@brewform.local
PGADMIN_DEFAULT_PASSWORD=admin

# --- PostgreSQL ---
POSTGRES_USER=brewform
POSTGRES_PASSWORD=brewform
POSTGRES_DB=brewform
```

#### 6. `Dockerfile`
```dockerfile
# --- Stage 1: Dependencies ---
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
COPY package.json package-lock.json turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
RUN npm install

# --- Stage 2: Build ---
FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY --from=deps /app/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=deps /app/packages/db/node_modules ./packages/db/node_modules
COPY . .
RUN npx prisma generate --schema=packages/db/prisma/schema.prisma
RUN deno check apps/api/src/main.ts

# --- Stage 3: Runtime (API only) ---
FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-all", "--env-file", "apps/api/src/main.ts"]
```

#### 7. `docker-compose.yml`
```yaml
services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8000:8000"
    environment:
      - DATABASE_URL=postgresql://brewform:brewform@postgres:5432/brewform?connection_limit=10&pool_timeout=30
      - CACHE_DRIVER=deno-kv
      - JWT_SECRET=dev-secret-change-me
      - JWT_ACCESS_EXPIRY=15m
      - JWT_REFRESH_EXPIRY=7d
      - CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000
      - SMTP_HOST=mailpit
      - SMTP_PORT=1025
      - EMAIL_FROM=noreply@brewform.local
      - OPENAPI_ENABLED=true
      - APP_ENV=development
      - APP_PORT=8000
    depends_on:
      postgres:
        condition: service_healthy
      mailpit:
        condition: service_started
    volumes:
      - .:/app
      - /app/node_modules
      - /app/apps/api/node_modules
      - /app/apps/web/node_modules
      - /app/packages/shared/node_modules
      - /app/packages/db/node_modules

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_USER: brewform
      POSTGRES_PASSWORD: brewform
      POSTGRES_DB: brewform
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U brewform"]
      interval: 5s
      timeout: 5s
      retries: 5

  mailpit:
    image: axllent/mailpit:latest
    ports:
      - "1025:1025"
      - "8025:8025"

  pgadmin:
    image: elestio/pgadmin:latest
    environment:
      PGADMIN_DEFAULT_EMAIL: admin@brewform.local
      PGADMIN_DEFAULT_PASSWORD: admin
    ports:
      - "5050:80"
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres_data:
```

#### 8. `Makefile`
```makefile
# ============================================================
# BrewForm — Makefile (Turborepo Monorepo)
# All commands run through Docker. No local Deno/Node required.
# ============================================================

# --- App Lifecycle ---

up:
	docker compose up -d

down:
	docker compose down

build:
	docker compose build

logs:
	docker compose logs -f app

restart:
	docker compose restart app

# --- Dependencies ---

install:
	docker compose run --rm app npm install

# --- Turbo Tasks (standalone — runs across all workspaces) ---

turbo-build:
	docker compose run --rm app npx turbo run build

turbo-test:
	docker compose run --rm app npx turbo run test

turbo-lint:
	docker compose run --rm app npx turbo run lint

turbo-check:
	docker compose run --rm app npx turbo run check

# --- Code Quality (standalone — no running stack needed) ---

lint:
	docker compose run --rm app deno lint

fmt:
	docker compose run --rm app deno fmt

fmt-check:
	docker compose run --rm app deno fmt --check

check:
	docker compose run --rm app deno check apps/api/src/main.ts

# --- Testing (standalone — no running stack needed) ---

test:
	docker compose run --rm app deno test --coverage=coverage/

coverage:
	docker compose run --rm app deno coverage coverage/

test-coverage: test coverage

# --- Database (needs DB running — paths relative to packages/db) ---

db-migrate:
	docker compose exec app npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

db-generate:
	docker compose run --rm app npx prisma generate --schema=packages/db/prisma/schema.prisma

db-seed:
	docker compose exec app deno run --allow-all packages/db/prisma/seed.ts

db-studio:
	docker compose exec app npx prisma studio --schema=packages/db/prisma/schema.prisma

db-reset:
	docker compose exec app npx prisma migrate reset --force --schema=packages/db/prisma/schema.prisma

# --- Admin Setup ---

setup:
	docker compose exec app deno run --allow-all apps/api/src/setup.ts

# --- Frontend (standalone) ---

web-build:
	docker compose run --rm app npx turbo run build --filter=@brewform/web

web-dev:
	docker compose run --rm --service-ports app npx turbo run dev --filter=@brewform/web

# --- All-in-one CI check (standalone) ---

ci: fmt-check lint check test-coverage

# --- Dev (API with hot reload) ---

dev-api:
	docker compose run --rm --service-ports app deno run --allow-all --watch apps/api/src/main.ts

# --- Dev (Full stack) ---

dev:
	docker compose up -d postgres mailpit pgadmin && docker compose run --rm --service-ports app npx turbo run dev
```

### Workspace Package Files

#### 9. `apps/api/package.json`
```json
{
  "name": "@brewform/api",
  "type": "module",
  "scripts": {
    "dev": "deno run --allow-all --watch src/main.ts",
    "build": "echo 'API build handled by Docker'",
    "lint": "deno lint src/",
    "check": "deno check src/main.ts",
    "test": "deno test src/"
  },
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "@brewform/db": "workspace:*",
    "hono": "^4.7.0",
    "@hono/zod-validator": "^0.5.0",
    "hono-openapi": "^1.0.0",
    "pino": "^9.6.0",
    "date-fns": "^4.1.0",
    "mjml": "^4.15.0",
    "bcryptjs": "^2.4.3",
    "qrcode": "^1.5.4"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/qrcode": "^1.5.5"
  }
}
```

#### 10. `apps/api/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "jsx": "react-jsx",
    "types": ["deno"]
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 11. `apps/api/src/main.ts`
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';

const app = new Hono();

app.use('*', cors({
  origin: ['http://localhost:5173', 'http://localhost:8000'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  credentials: true,
  maxAge: 600,
}));

app.use('*', requestId());

app.get('/health', (c) => c.json({ status: 'ok' }));
app.get('/ready', (c) => c.json({ status: 'ready' }));

app.get('/api/v1', (c) => c.json({
  success: true,
  data: { name: 'BrewForm API', version: '1.0.0' },
  meta: { requestId: c.get('requestId') },
}));

const port = parseInt(Deno.env.get('APP_PORT') || '8000');
console.log(`BrewForm API running on http://localhost:${port}`);
Deno.serve({ port }, app.fetch);
```

#### 12. `apps/web/package.json`
```json
{
  "name": "@brewform/web",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "lint": "echo 'Web lint handled by Deno at root level'",
    "check": "echo 'Web check handled by Deno at root level'",
    "test": "echo 'Web test handled by Deno at root level'"
  },
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "react-router": "^7.5.0",
    "@base-ui-components/react": "^1.0.0-alpha.7"
  },
  "devDependencies": {
    "vite": "^6.3.0",
    "@vitejs/plugin-react": "^4.4.0",
    "tailwindcss": "^4.1.0",
    "@tailwindcss/vite": "^4.1.0",
    "typescript": "^5.8.0",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0"
  }
}
```

#### 13. `apps/web/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["src/**/*", "vite-env.d.ts"],
  "exclude": ["node_modules", "dist"]
}
```

#### 14. `apps/web/vite.config.ts`
```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
});
```

#### 15. `apps/web/index.html`
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>BrewForm</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

#### 16. `apps/web/src/main.tsx`
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/globals.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

#### 17. `apps/web/src/App.tsx`
```tsx
export default function App() {
  return (
    <div className="min-h-screen bg-stone-50 text-stone-900">
      <header className="border-b border-stone-200 px-6 py-4">
        <h1 className="text-2xl font-bold">☕ BrewForm</h1>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">
        <p className="text-lg text-stone-600">
          Coffee brewing recipes and tasting notes — coming soon.
        </p>
      </main>
    </div>
  );
}
```

#### 18. `apps/web/src/styles/globals.css`
```css
@import 'tailwindcss';
```

#### 19. `apps/web/vite-env.d.ts`
```typescript
/// <reference types="vite/client" />
```

### Shared Package

#### 20. `packages/shared/package.json`
```json
{
  "name": "@brewform/shared",
  "type": "module",
  "exports": {
    "./types": { "types": "./src/types/index.ts", "default": "./src/types/index.ts" },
    "./schemas": { "types": "./src/schemas/index.ts", "default": "./src/schemas/index.ts" },
    "./constants": { "types": "./src/constants/index.ts", "default": "./src/constants/index.ts" },
    "./utils": { "types": "./src/utils/index.ts", "default": "./src/utils/index.ts" },
    "./i18n": { "types": "./src/i18n/index.ts", "default": "./src/i18n/index.ts" }
  },
  "dependencies": {
    "zod": "^3.24.0",
    "date-fns": "^4.1.0"
  },
  "scripts": {
    "build": "echo 'Shared package uses TypeScript source directly'",
    "lint": "deno lint src/",
    "check": "deno check src/index.ts",
    "test": "deno test src/"
  }
}
```

#### 21. `packages/shared/tsconfig.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

#### 22. `packages/shared/src/index.ts`
```typescript
export * from './types/index.ts';
export * from './schemas/index.ts';
export * from './constants/index.ts';
export * from './utils/index.ts';
```

#### 23. `packages/shared/src/types/index.ts`
```typescript
export type { ApiResponse, ApiError, PaginationMeta } from './api.ts';
export type { Recipe, RecipeVersion, RecipeCreate, RecipeUpdate } from './recipe.ts';
export type { Equipment, Portafilter, Grinder } from './equipment.ts';
export type { TasteNote, TasteHierarchy } from './taste.ts';
export type { User, UserProfile, UserPreferences } from './user.ts';
```

#### 24-27. Type stubs (api.ts, recipe.ts, equipment.ts, taste.ts, user.ts)

#### 28. `packages/shared/src/schemas/index.ts`
```typescript
export { RecipeCreateSchema, RecipeUpdateSchema, RecipeFilterSchema } from './recipe.ts';
export { EquipmentCreateSchema } from './equipment.ts';
export { AuthLoginSchema, AuthRegisterSchema } from './auth.ts';
export { UserPreferencesSchema } from './user.ts';
```

#### 29-32. Schema stubs

#### 33. `packages/shared/src/constants/index.ts`
```typescript
export { BREW_METHODS } from './brew-methods.ts';
export { DRINK_TYPES } from './drink-types.ts';
export { EMOJI_TAGS } from './emoji-tags.ts';
export { UNIT_CONVERSIONS } from './units.ts';
```

#### 34-37. Constant stubs

#### 38. `packages/shared/src/utils/index.ts`
```typescript
export { convertGramsToOunces, convertOuncesToGrams, convertMlToFlOz, convertFlOzToMl, convertCtoF, convertFtoC } from './conversion.ts';
export { computeBrewRatio, computeFlowRate } from './metrics.ts';
export { validateGrindDateNotBeforeRoastDate, validatebrewMethodCompatibility } from './validation.ts';
export { formatDate, isDateBefore } from './date.ts';
```

#### 39-42. Utils stubs

#### 43. `packages/shared/src/i18n/en.json` and `packages/shared/src/i18n/index.ts`

### DB Package

#### 44. `packages/db/package.json`
```json
{
  "name": "@brewform/db",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" }
  },
  "dependencies": {
    "@prisma/client": "^6.7.0",
    "@brewform/shared": "workspace:*"
  },
  "devDependencies": {
    "prisma": "^6.7.0"
  },
  "scripts": {
    "build": "echo 'DB package uses Prisma generate'",
    "lint": "deno lint src/",
    "check": "deno check src/index.ts",
    "test": "deno test src/"
  }
}
```

#### 45. `packages/db/tsconfig.json`

#### 46. `packages/db/prisma/schema.prisma` (initial stub)

#### 47. `packages/db/src/index.ts` (Prisma client singleton)

### SCAA Data

#### 48. `files/scaa-2.json` (downloaded from https://notbadcoffee.com/flavor-wheel/scaa-2.json)

### Progress Tracking

#### 49. `state.md` (implementation progress tracker)

---

## Next Steps

Once write permissions are enabled:
1. Create all files listed above
2. Run `docker compose build` to verify the Docker setup
3. Run `docker compose run --rm app npm install` to install dependencies
4. Verify the project structure is correct
5. Move to Phase 2 (Database Schema)