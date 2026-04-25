# BrewForm Phase 1 — Project Infrastructure & Scaffolding

## Status: READY

## Overview
Set up the complete monorepo structure, Docker infrastructure, configuration files, and minimal entry points for all 4 workspace packages.

---

## File Inventory

### 1. `.gitignore` (UPDATE existing)
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

# Uploads
uploads/
```

### 2. `package.json` (root)
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

### 3. `turbo.json`
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

### 4. `deno.json`
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

### 5. `.env.example`
```
# === Application ===
APP_PORT=8000
APP_ENV=development

# === Database (PostgreSQL) ===
DATABASE_URL=postgresql://brewform:brewform@localhost:5432/brewform?connection_limit=10&pool_timeout=30
DATABASE_PROVIDER=postgresql

# === Cache Driver ===
CACHE_DRIVER=deno-kv

# === Authentication ===
JWT_SECRET=change-me-to-a-random-secret-in-production
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# === CORS ===
CORS_ALLOWED_ORIGINS=http://localhost:5173,http://localhost:8000

# === Email (SMTP) ===
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=noreply@brewform.local

# === OpenAPI ===
OPENAPI_ENABLED=true

# === PostgreSQL ===
POSTGRES_USER=brewform
POSTGRES_PASSWORD=brewform
POSTGRES_DB=brewform

# === pgAdmin ===
PGADMIN_DEFAULT_EMAIL=admin@brewform.local
PGADMIN_DEFAULT_PASSWORD=admin
```

### 6. `Dockerfile`
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

### 7. `docker-compose.yml`
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

### 8. `Makefile`
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

# --- Turbo Tasks (standalone) ---

turbo-build:
	docker compose run --rm app npx turbo run build

turbo-test:
	docker compose run --rm app npx turbo run test

turbo-lint:
	docker compose run --rm app npx turbo run lint

turbo-check:
	docker compose run --rm app npx turbo run check

# --- Code Quality ---

lint:
	docker compose run --rm app deno lint

fmt:
	docker compose run --rm app deno fmt

fmt-check:
	docker compose run --rm app deno fmt --check

check:
	docker compose run --rm app deno check apps/api/src/main.ts

# --- Testing ---

test:
	docker compose run --rm app deno test --coverage=coverage/

coverage:
	docker compose run --rm app deno coverage coverage/

test-coverage: test coverage

# --- Database ---

db-migrate:
	docker compose exec app npx prisma migrate deploy --schema=packages/db/prisma/schema.prisma

db-generate:
	docker compose run --rm app npx prisma generate --schema=packages/db/prisma/schema.prisma

db-dev-migrate:
	docker compose exec app npx prisma migrate dev --schema=packages/db/prisma/schema.prisma

db-seed:
	docker compose exec app deno run --allow-all packages/db/prisma/seed.ts

db-studio:
	docker compose exec app npx prisma studio --schema=packages/db/prisma/schema.prisma

db-reset:
	docker compose exec app npx prisma migrate reset --force --schema=packages/db/prisma/schema.prisma

# --- Admin Setup ---

setup:
	docker compose exec app deno run --allow-all apps/api/src/setup.ts

# --- Frontend ---

web-build:
	docker compose run --rm app npx turbo run build --filter=@brewform/web

web-dev:
	docker compose run --rm --service-ports app npx turbo run dev --filter=@brewform/web

# --- CI ---

ci: fmt-check lint check test-coverage

# --- Dev ---

dev-api:
	docker compose run --rm --service-ports app deno run --allow-all --watch apps/api/src/main.ts

dev:
	docker compose up -d postgres mailpit pgadmin && docker compose run --rm --service-ports app npx turbo run dev
```

---

### 9. `apps/api/package.json`
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

### 10. `apps/api/tsconfig.json`
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
    "jsx": "react-jsx"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

### 11. `apps/api/src/main.ts`
```typescript
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { requestId } from 'hono/request-id';

const app = new Hono();

app.use('*', cors({
  origin: (origin) => origin || '*',
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

### 12. `apps/web/package.json`
```json
{
  "name": "@brewform/web",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
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

### 13. `apps/web/tsconfig.json`
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

### 14. `apps/web/vite.config.ts`
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

### 15. `apps/web/index.html`
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

### 16. `apps/web/vite-env.d.ts`
```typescript
/// <reference types="vite/client" />
```

### 17. `apps/web/src/main.tsx`
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

### 18. `apps/web/src/App.tsx`
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

### 19. `apps/web/src/styles/globals.css`
```css
@import 'tailwindcss';
```

---

### 20. `packages/shared/package.json`
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

### 21. `packages/shared/tsconfig.json`
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

### 22. `packages/shared/src/index.ts`
```typescript
export * from './types/index.ts';
export * from './schemas/index.ts';
export * from './constants/index.ts';
export * from './utils/index.ts';
```

### 23. `packages/shared/src/types/index.ts`
```typescript
export type { ApiResponse, ApiError, PaginationMeta } from './api.ts';
export type { User, UserProfile, UserPreferences } from './user.ts';
export type { Recipe, RecipeVersion, RecipeCreateInput, RecipeUpdateInput } from './recipe.ts';
export type { Equipment, Portafilter, Basket, PuckScreen, PaperFilter, Tamper } from './equipment.ts';
export type { TasteNote, TasteHierarchy } from './taste.ts';
export type { Bean, Vendor } from './bean.ts';
export type { Setup } from './setup.ts';
export type { Comment } from './comment.ts';
export type { Follow } from './follow.ts';
export type { Badge, UserBadge } from './badge.ts';
export type { Photo } from './photo.ts';
```

### 24. `packages/shared/src/types/api.ts`
```typescript
export interface ApiResponse<T> {
  success: true;
  data: T;
  meta?: {
    requestId?: string;
    pagination?: PaginationMeta;
  };
}

export interface ApiError {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Array<{
      field: string;
      message: string;
    }>;
    requestId?: string;
  };
}

export interface PaginationMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface PaginationQuery {
  page?: number;
  perPage?: number;
}
```

### 25. `packages/shared/src/types/user.ts`
```typescript
export type Theme = 'light' | 'dark' | 'coffee';
export type UnitSystem = 'metric' | 'imperial';
export type DateFormat = 'DD/MM/YYYY' | 'MM/DD/YYYY' | 'YYYY-MM-DD';

export interface UserPreferences {
  unitSystem: UnitSystem;
  temperatureUnit: 'celsius' | 'fahrenheit';
  theme: Theme;
  locale: string;
  timezone: string;
  dateFormat: DateFormat;
  emailNotifications: {
    newFollower: boolean;
    recipeLiked: boolean;
    recipeCommented: boolean;
    followedUserPosted: boolean;
  };
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  preferences: UserPreferences;
  onboardingCompleted: boolean;
  isAdmin: boolean;
  isBanned: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface UserProfile {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  bio: string | null;
  publicRecipeCount: number;
  followerCount: number;
  followingCount: number;
  badges: Array<{ id: string; name: string; icon: string }>;
  featuredRecipes: Array<{
    id: string;
    slug: string;
    title: string;
    photoUrl: string | null;
    rating: number | null;
  }>;
  createdAt: Date;
}
```

### 26. `packages/shared/src/types/recipe.ts`
```typescript
export type Visibility = 'draft' | 'private' | 'unlisted' | 'public';
export type BrewMethod =
  | 'espresso_machine'
  | 'v60'
  | 'french_press'
  | 'aeropress'
  | 'turkish_coffee'
  | 'drip_coffee'
  | 'chemex'
  | 'kalita_wave'
  | 'moka_pot'
  | 'cold_brew'
  | 'siphon';

export type DrinkType =
  | 'espresso'
  | 'americano'
  | 'flat_white'
  | 'latte'
  | 'cappuccino'
  | 'cortado'
  | 'macchiato'
  | 'turkish_coffee'
  | 'pour_over'
  | 'cold_brew'
  | 'french_press';

export type EmojiTag = '🔥' | '🚀' | '👍' | '😐' | '👎' | '🤢';

export interface Recipe {
  id: string;
  slug: string;
  title: string;
  authorId: string;
  visibility: Visibility;
  currentVersionId: string;
  likeCount: number;
  commentCount: number;
  forkCount: number;
  forkedFromId: string | null;
  featured: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface RecipeVersion {
  id: string;
  recipeId: string;
  versionNumber: number;
  productName: string | null;
  coffeeBrand: string | null;
  coffeeProcessing: string | null;
  vendorId: string | null;
  roastDate: Date | null;
  packageOpenDate: Date | null;
  grindDate: Date | null;
  brewDate: Date;
  brewMethod: BrewMethod;
  drinkType: DrinkType;
  brewerDetails: string | null;
  grinder: string | null;
  grindSize: string | null;
  groundWeightGrams: number | null;
  extractionTimeSeconds: number | null;
  extractionVolumeMl: number | null;
  temperatureCelsius: number | null;
  brewRatio: number | null;
  flowRate: number | null;
  personalNotes: string | null;
  isFavourite: boolean;
  rating: number | null;
  emojiTag: EmojiTag | null;
  createdAt: Date;
}

export interface RecipeCreateInput {
  title: string;
  visibility?: Visibility;
  productName?: string;
  coffeeBrand?: string;
  coffeeProcessing?: string;
  vendorId?: string;
  roastDate?: string;
  packageOpenDate?: string;
  grindDate?: string;
  brewDate?: string;
  brewMethod: BrewMethod;
  drinkType: DrinkType;
  brewerDetails?: string;
  grinder?: string;
  grindSize?: string;
  groundWeightGrams?: number;
  extractionTimeSeconds?: number;
  extractionVolumeMl?: number;
  temperatureCelsius?: number;
  personalNotes?: string;
  isFavourite?: boolean;
  rating?: number;
  emojiTag?: EmojiTag;
  setupId?: string;
  tasteNoteIds?: string[];
  equipmentIds?: string[];
  additionalPreparations?: AdditionalPreparation[];
}

export interface AdditionalPreparation {
  name: string;
  type: string;
  inputAmount: string;
  preparationType: string;
}

export interface RecipeUpdateInput extends Partial<RecipeCreateInput> {
  bumpVersion?: boolean;
}
```

### 27. `packages/shared/src/types/equipment.ts`
```typescript
export type EquipmentType =
  | 'portafilter'
  | 'basket'
  | 'puck_screen'
  | 'paper_filter'
  | 'tamper'
  | 'gooseneck_kettle'
  | 'mesh_filter'
  | 'cezve'
  | 'scale'
  | 'thermometer'
  | 'other';

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  brand: string | null;
  model: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Portafilter {
  id: string;
  name: string;
  type: 'portafilter';
  brand: string | null;
  details: string;
}

export interface Basket {
  id: string;
  name: string;
  type: 'basket';
  brand: string | null;
  details: string;
}

export interface PuckScreen {
  id: string;
  name: string;
  type: 'puck_screen';
  brand: string | null;
  details: string;
}

export interface PaperFilter {
  id: string;
  name: string;
  type: 'paper_filter';
  brand: string | null;
  details: string;
}

export interface Tamper {
  id: string;
  name: string;
  type: 'tamper';
  brand: string | null;
  details: string;
}
```

### 28. `packages/shared/src/types/taste.ts`
```typescript
export interface TasteNote {
  id: string;
  name: string;
  parentId: string | null;
  color: string | null;
  definition: string | null;
  depth: number;
  createdAt: Date;
}

export interface TasteHierarchy {
  id: string;
  name: string;
  color: string | null;
  definition: string | null;
  children: TasteHierarchy[];
}

export interface TasteSelection {
  tasteNoteId: string;
  recipeVersionId: string;
}
```

### 29. `packages/shared/src/types/bean.ts`
```typescript
export interface Bean {
  id: string;
  name: string;
  brand: string | null;
  vendorId: string | null;
  roaster: string | null;
  roastLevel: string | null;
  processing: string | null;
  origin: string | null;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface Vendor {
  id: string;
  name: string;
  website: string | null;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### 30. `packages/shared/src/types/setup.ts`
```typescript
export interface Setup {
  id: string;
  name: string;
  userId: string;
  brewerDetails: string | null;
  grinder: string | null;
  portafilterId: string | null;
  basketId: string | null;
  puckScreenId: string | null;
  paperFilterId: string | null;
  tamperId: string | null;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### 31. `packages/shared/src/types/comment.ts`
```typescript
export interface Comment {
  id: string;
  recipeId: string;
  authorId: string;
  content: string;
  parentCommentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}
```

### 32. `packages/shared/src/types/follow.ts`
```typescript
export interface Follow {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: Date;
}
```

### 33. `packages/shared/src/types/badge.ts`
```typescript
export type BadgeRule =
  | 'first_brew'
  | 'decade_brewer'
  | 'centurion'
  | 'first_fork'
  | 'fan_favourite'
  | 'community_star'
  | 'conversationalist'
  | 'precision_brewer'
  | 'explorer'
  | 'influencer';

export interface Badge {
  id: string;
  name: string;
  icon: string;
  description: string;
  rule: BadgeRule;
  threshold: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserBadge {
  id: string;
  userId: string;
  badgeId: string;
  awardedAt: Date;
}
```

### 34. `packages/shared/src/types/photo.ts`
```typescript
export interface Photo {
  id: string;
  recipeId: string;
  url: string;
  thumbnailUrl: string;
  alt: string | null;
  sortOrder: number;
  createdAt: Date;
  deletedAt: Date | null;
}
```

---

### 35. `packages/shared/src/schemas/index.ts`
```typescript
export { RecipeCreateSchema, RecipeUpdateSchema, RecipeFilterSchema } from './recipe.ts';
export { EquipmentCreateSchema, EquipmentUpdateSchema } from './equipment.ts';
export { AuthRegisterSchema, AuthLoginSchema, AuthRefreshSchema, PasswordResetSchema } from './auth.ts';
export { UserPreferencesSchema, UserProfileUpdateSchema } from './user.ts';
export { TasteNoteFilterSchema } from './taste.ts';
export { PaginationSchema } from './common.ts';
```

### 36. `packages/shared/src/schemas/common.ts`
```typescript
import { z } from 'zod';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
});

export const SortOrderSchema = z.enum(['asc', 'desc']).default('desc');

export const UuidSchema = z.string().uuid();

export const SlugSchema = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
```

### 37. `packages/shared/src/schemas/auth.ts`
```typescript
import { z } from 'zod';

export const AuthRegisterSchema = z.object({
  email: z.string().email(),
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_-]+$/),
  password: z.string().min(8).max(128),
  displayName: z.string().max(50).optional(),
});

export const AuthLoginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export const AuthRefreshSchema = z.object({
  refreshToken: z.string(),
});

export const PasswordResetSchema = z.object({
  email: z.string().email(),
});

export const PasswordResetConfirmSchema = z.object({
  token: z.string(),
  newPassword: z.string().min(8).max(128),
});
```

### 38. `packages/shared/src/schemas/recipe.ts`
```typescript
import { z } from 'zod';

const BrewMethodEnum = z.enum([
  'espresso_machine', 'v60', 'french_press', 'aeropress',
  'turkish_coffee', 'drip_coffee', 'chemex', 'kalita_wave',
  'moka_pot', 'cold_brew', 'siphon',
]);

const DrinkTypeEnum = z.enum([
  'espresso', 'americano', 'flat_white', 'latte',
  'cappuccino', 'cortado', 'macchiato', 'turkish_coffee',
  'pour_over', 'cold_brew', 'french_press',
]);

const VisibilityEnum = z.enum(['draft', 'private', 'unlisted', 'public']);
const EmojiTagEnum = z.enum(['🔥', '🚀', '👍', '😐', '👎', '🤢']);

const AdditionalPreparationSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
  inputAmount: z.string().min(1).max(50),
  preparationType: z.string().min(1).max(100),
});

export const RecipeCreateSchema = z.object({
  title: z.string().min(1).max(200),
  visibility: VisibilityEnum.default('draft'),
  productName: z.string().max(200).optional(),
  coffeeBrand: z.string().max(200).optional(),
  coffeeProcessing: z.string().max(200).optional(),
  vendorId: z.string().uuid().optional(),
  roastDate: z.string().date().optional(),
  packageOpenDate: z.string().date().optional(),
  grindDate: z.string().date().optional(),
  brewDate: z.string().date().optional(),
  brewMethod: BrewMethodEnum,
  drinkType: DrinkTypeEnum,
  brewerDetails: z.string().max(200).optional(),
  grinder: z.string().max(200).optional(),
  grindSize: z.string().max(100).optional(),
  groundWeightGrams: z.number().positive().optional(),
  extractionTimeSeconds: z.number().positive().optional(),
  extractionVolumeMl: z.number().positive().optional(),
  temperatureCelsius: z.number().min(-40).max(100).optional(),
  personalNotes: z.string().max(10000).optional(),
  isFavourite: z.boolean().default(false),
  rating: z.number().min(1).max(10).optional(),
  emojiTag: EmojiTagEnum.optional(),
  setupId: z.string().uuid().optional(),
  tasteNoteIds: z.array(z.string().uuid()).optional(),
  equipmentIds: z.array(z.string().uuid()).optional(),
  additionalPreparations: z.array(AdditionalPreparationSchema).optional(),
}).refine(
  (data) => {
    if (data.grindDate && data.roastDate) {
      return data.grindDate >= data.roastDate;
    }
    return true;
  },
  { message: 'Grind date cannot be earlier than roast date', path: ['grindDate'] },
);

export const RecipeUpdateSchema = RecipeCreateSchema.partial().extend({
  bumpVersion: z.boolean().default(false),
});

export const RecipeFilterSchema = z.object({
  brewMethod: BrewMethodEnum.optional(),
  drinkType: DrinkTypeEnum.optional(),
  visibility: VisibilityEnum.optional(),
  authorId: z.string().uuid().optional(),
  grinder: z.string().optional(),
  search: z.string().optional(),
  page: z.coerce.number().int().positive().default(1),
  perPage: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.enum(['createdAt', 'likeCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});
```

### 39. `packages/shared/src/schemas/equipment.ts`
```typescript
import { z } from 'zod';

const EquipmentTypeEnum = z.enum([
  'portafilter', 'basket', 'puck_screen', 'paper_filter',
  'tamper', 'gooseneck_kettle', 'mesh_filter', 'cezve',
  'scale', 'thermometer', 'other',
]);

export const EquipmentCreateSchema = z.object({
  name: z.string().min(1).max(200),
  type: EquipmentTypeEnum,
  brand: z.string().max(200).optional(),
  model: z.string().max(200).optional(),
  description: z.string().max(1000).optional(),
});

export const EquipmentUpdateSchema = EquipmentCreateSchema.partial();
```

### 40. `packages/shared/src/schemas/user.ts`
```typescript
import { z } from 'zod';

export const UserPreferencesSchema = z.object({
  unitSystem: z.enum(['metric', 'imperial']).default('metric'),
  temperatureUnit: z.enum(['celsius', 'fahrenheit']).default('celsius'),
  theme: z.enum(['light', 'dark', 'coffee']).default('light'),
  locale: z.string().default('en'),
  timezone: z.string().default('UTC'),
  dateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('YYYY-MM-DD'),
  emailNotifications: z.object({
    newFollower: z.boolean().default(true),
    recipeLiked: z.boolean().default(true),
    recipeCommented: z.boolean().default(true),
    followedUserPosted: z.boolean().default(true),
  }).default({}),
});

export const UserProfileUpdateSchema = z.object({
  displayName: z.string().max(50).optional(),
  bio: z.string().max(500).optional(),
  avatarUrl: z.string().url().optional(),
});
```

### 41. `packages/shared/src/schemas/taste.ts`
```typescript
import { z } from 'zod';

export const TasteNoteFilterSchema = z.object({
  search: z.string().min(3).optional(),
  parentId: z.string().uuid().optional(),
  depth: z.enum(['0', '1', '2']).optional(),
});
```

---

### 42. `packages/shared/src/constants/index.ts`
```typescript
export { BREW_METHODS } from './brew-methods.ts';
export { DRINK_TYPES } from './drink-types.ts';
export { EMOJI_TAGS } from './emoji-tags.ts';
export { UNIT_CONVERSIONS, CANONICAL_UNITS } from './units.ts';
export { VISIBILITY_STATES } from './visibility.ts';
export { BADGE_RULES } from './badges.ts';
```

### 43. `packages/shared/src/constants/brew-methods.ts`
```typescript
export const BREW_METHODS = [
  { value: 'espresso_machine', label: 'Espresso Machine', equipmentTypes: ['portafilter', 'basket', 'tamper', 'puck_screen'] },
  { value: 'v60', label: 'V60', equipmentTypes: ['paper_filter', 'gooseneck_kettle', 'scale'] },
  { value: 'french_press', label: 'French Press', equipmentTypes: ['mesh_filter', 'scale'] },
  { value: 'aeropress', label: 'AeroPress', equipmentTypes: ['paper_filter', 'scale'] },
  { value: 'turkish_coffee', label: 'Turkish Coffee (Cezve)', equipmentTypes: ['cezve'] },
  { value: 'drip_coffee', label: 'Drip Coffee', equipmentTypes: ['paper_filter', 'scale'] },
  { value: 'chemex', label: 'Chemex', equipmentTypes: ['paper_filter', 'gooseneck_kettle', 'scale'] },
  { value: 'kalita_wave', label: 'Kalita Wave', equipmentTypes: ['paper_filter', 'gooseneck_kettle', 'scale'] },
  { value: 'moka_pot', label: 'Moka Pot', equipmentTypes: ['scale'] },
  { value: 'cold_brew', label: 'Cold Brew', equipmentTypes: ['mesh_filter', 'scale'] },
  { value: 'siphon', label: 'Siphon', equipmentTypes: ['scale', 'thermometer'] },
] as const;

export type BrewMethodValue = (typeof BREW_METHODS)[number]['value'];
```

### 44. `packages/shared/src/constants/drink-types.ts`
```typescript
export const DRINK_TYPES = [
  { value: 'espresso', label: 'Espresso', compatibleMethods: ['espresso_machine'] },
  { value: 'americano', label: 'Americano', compatibleMethods: ['espresso_machine'] },
  { value: 'flat_white', label: 'Flat White', compatibleMethods: ['espresso_machine'] },
  { value: 'latte', label: 'Latte', compatibleMethods: ['espresso_machine'] },
  { value: 'cappuccino', label: 'Cappuccino', compatibleMethods: ['espresso_machine'] },
  { value: 'cortado', label: 'Cortado', compatibleMethods: ['espresso_machine'] },
  { value: 'macchiato', label: 'Macchiato', compatibleMethods: ['espresso_machine'] },
  { value: 'turkish_coffee', label: 'Turkish Coffee', compatibleMethods: ['turkish_coffee'] },
  { value: 'pour_over', label: 'Pour Over', compatibleMethods: ['v60', 'chemex', 'kalita_wave'] },
  { value: 'cold_brew', label: 'Cold Brew', compatibleMethods: ['cold_brew'] },
  { value: 'french_press', label: 'French Press', compatibleMethods: ['french_press'] },
] as const;

export type DrinkTypeValue = (typeof DRINK_TYPES)[number]['value'];
```

### 45. `packages/shared/src/constants/emoji-tags.ts`
```typescript
export const EMOJI_TAGS = [
  { emoji: '🔥', label: 'Amazing', value: '🔥' },
  { emoji: '🚀', label: 'Super Good', value: '🚀' },
  { emoji: '👍', label: 'Good', value: '👍' },
  { emoji: '😐', label: 'Okay', value: '😐' },
  { emoji: '👎', label: 'Bad', value: '👎' },
  { emoji: '🤢', label: 'Horrible', value: '🤢' },
] as const;
```

### 46. `packages/shared/src/constants/units.ts`
```typescript
export const CANONICAL_UNITS = {
  weight: 'grams',
  volume: 'milliliters',
  temperature: 'celsius',
  time: 'seconds',
} as const;

export const UNIT_CONVERSIONS = {
  gramsToOunces: (g: number) => g / 28.3495,
  ouncesToGrams: (oz: number) => oz * 28.3495,
  mlToFlOz: (ml: number) => ml / 29.5735,
  flOzToMl: (flOz: number) => flOz * 29.5735,
  celsiusToFahrenheit: (c: number) => (c * 9) / 5 + 32,
  fahrenheitToCelsius: (f: number) => ((f - 32) * 5) / 9,
} as const;
```

### 47. `packages/shared/src/constants/visibility.ts`
```typescript
export const VISIBILITY_STATES = [
  { value: 'draft', label: 'Draft', description: 'Work in progress, not visible to anyone else' },
  { value: 'private', label: 'Private', description: 'Only visible to the owner' },
  { value: 'unlisted', label: 'Unlisted', description: 'Accessible via direct link only' },
  { value: 'public', label: 'Public', description: 'Visible to everyone, searchable, indexable' },
] as const;
```

### 48. `packages/shared/src/constants/badges.ts`
```typescript
export const BADGE_RULES = [
  { rule: 'first_brew', name: 'First Brew', icon: '☕', description: 'Logged your first recipe', threshold: 1 },
  { rule: 'decade_brewer', name: 'Decade Brewer', icon: '🔟', description: '10 recipes logged', threshold: 10 },
  { rule: 'centurion', name: 'Centurion', icon: '💯', description: '100 recipes logged', threshold: 100 },
  { rule: 'first_fork', name: 'First Fork', icon: '🍴', description: 'Forked your first recipe', threshold: 1 },
  { rule: 'fan_favourite', name: 'Fan Favourite', icon: '⭐', description: 'One of your recipes received 10+ likes', threshold: 10 },
  { rule: 'community_star', name: 'Community Star', icon: '🌟', description: 'One of your recipes received 50+ likes', threshold: 50 },
  { rule: 'conversationalist', name: 'Conversationalist', icon: '💬', description: 'Left 10+ comments', threshold: 10 },
  { rule: 'precision_brewer', name: 'Precision Brewer', icon: '🎯', description: 'Logged 10 recipes with all optional fields filled', threshold: 10 },
  { rule: 'explorer', name: 'Explorer', icon: '🌍', description: 'Brewed with 5+ different brew methods', threshold: 5 },
  { rule: 'influencer', name: 'Influencer', icon: '👥', description: 'Gained 25+ followers', threshold: 25 },
] as const;
```

---

### 49. `packages/shared/src/utils/index.ts`
```typescript
export {
  convertGramsToOunces,
  convertOuncesToGrams,
  convertMlToFlOz,
  convertFlOzToMl,
  convertCtoF,
  convertFtoC,
  formatWeight,
  formatVolume,
  formatTemperature,
} from './conversion.ts';

export { computeBrewRatio, computeFlowRate } from './metrics.ts';
export { validateGrindDateNotBeforeRoastDate, validateBrewMethodCompatibility, validateSoftWarnings } from './validation.ts';
export { formatDate, isDateBefore } from './date.ts';
```

### 50. `packages/shared/src/utils/conversion.ts`
```typescript
import { UNIT_CONVERSIONS } from '../constants/units.ts';

export function convertGramsToOunces(grams: number): number {
  return UNIT_CONVERSIONS.gramsToOunces(grams);
}

export function convertOuncesToGrams(ounces: number): number {
  return UNIT_CONVERSIONS.ouncesToGrams(ounces);
}

export function convertMlToFlOz(ml: number): number {
  return UNIT_CONVERSIONS.mlToFlOz(ml);
}

export function convertFlOzToMl(flOz: number): number {
  return UNIT_CONVERSIONS.flOzToMl(flOz);
}

export function convertCtoF(celsius: number): number {
  return UNIT_CONVERSIONS.celsiusToFahrenheit(celsius);
}

export function convertFtoC(fahrenheit: number): number {
  return UNIT_CONVERSIONS.fahrenheitToCelsius(fahrenheit);
}

export function formatWeight(grams: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    return `${convertGramsToOunces(grams).toFixed(1)} oz`;
  }
  return `${grams.toFixed(1)} g`;
}

export function formatVolume(ml: number, system: 'metric' | 'imperial'): string {
  if (system === 'imperial') {
    return `${convertMlToFlOz(ml).toFixed(1)} fl oz`;
  }
  return `${ml.toFixed(0)} ml`;
}

export function formatTemperature(celsius: number, unit: 'celsius' | 'fahrenheit'): string {
  if (unit === 'fahrenheit') {
    return `${convertCtoF(celsius).toFixed(1)}°F`;
  }
  return `${celsius.toFixed(1)}°C`;
}
```

### 51. `packages/shared/src/utils/metrics.ts`
```typescript
export function computeBrewRatio(doseGrams: number, yieldGrams: number): number | null {
  if (!doseGrams || !yieldGrams || doseGrams <= 0) return null;
  return yieldGrams / doseGrams;
}

export function computeFlowRate(yieldGrams: number, extractionTimeSeconds: number): number | null {
  if (!yieldGrams || !extractionTimeSeconds || extractionTimeSeconds <= 0) return null;
  return yieldGrams / extractionTimeSeconds;
}
```

### 52. `packages/shared/src/utils/validation.ts`
```typescript
import { BREW_METHODS } from '../constants/brew-methods.ts';
import { DRINK_TYPES } from '../constants/drink-types.ts';
import type { BrewMethodValue, DrinkTypeValue } from '../constants/brew-methods.ts';

export function validateGrindDateNotBeforeRoastDate(grindDate: string, roastDate: string): boolean {
  return new Date(grindDate) >= new Date(roastDate);
}

export function validateBrewMethodCompatibility(brewMethod: string, drinkType: string): boolean {
  const method = BREW_METHODS.find((m) => m.value === brewMethod);
  if (!method) return false;
  const drink = DRINK_TYPES.find((d) => d.value === drinkType);
  if (!drink) return false;
  return drink.compatibleMethods.includes(brewMethod as BrewMethodValue);
}

export interface SoftWarning {
  field: string;
  message: string;
}

export function validateSoftWarnings(data: {
  brewMethod?: string;
  extractionTimeSeconds?: number;
  temperatureCelsius?: number;
  groundWeightGrams?: number;
  extractionVolumeMl?: number;
  drinkType?: string;
  additionalPreparations?: Array<{ name: string; type: string }>;
}): SoftWarning[] {
  const warnings: SoftWarning[] = [];

  if (data.brewMethod === 'espresso_machine' && data.groundWeightGrams && data.extractionVolumeMl) {
    const ratio = data.extractionVolumeMl / data.groundWeightGrams;
    if (ratio < 1.5) {
      warnings.push({ field: 'extractionVolumeMl', message: 'Espresso ratio is below typical range (< 1:1.5)' });
    } else if (ratio > 3) {
      warnings.push({ field: 'extractionVolumeMl', message: 'Espresso ratio is above typical range (> 1:3)' });
    }
  }

  if (data.brewMethod === 'espresso_machine' && data.extractionTimeSeconds) {
    if (data.extractionTimeSeconds < 15) {
      warnings.push({ field: 'extractionTimeSeconds', message: 'Extraction time is unusually short for espresso' });
    } else if (data.extractionTimeSeconds > 60) {
      warnings.push({ field: 'extractionTimeSeconds', message: 'Extraction time is unusually long for espresso' });
    }
  }

  if (data.brewMethod === 'espresso_machine' && data.temperatureCelsius) {
    if (data.temperatureCelsius < 88 || data.temperatureCelsius > 96) {
      warnings.push({ field: 'temperatureCelsius', message: 'Brew temperature is outside common range for espresso (88-96°C)' });
    }
  }

  return warnings;
}
```

### 53. `packages/shared/src/utils/date.ts`
```typescript
import { format, parseISO, isBefore, isValid } from 'date-fns';

export function formatDate(date: Date | string, dateFormat: string = 'yyyy-MM-dd'): string {
  const d = typeof date === 'string' ? parseISO(date) : date;
  if (!isValid(d)) return '';
  return format(d, dateFormat);
}

export function isDateBefore(date1: Date | string, date2: Date | string): boolean {
  const d1 = typeof date1 === 'string' ? parseISO(date1) : date1;
  const d2 = typeof date2 === 'string' ? parseISO(date2) : date2;
  return isBefore(d1, d2);
}
```

---

### 54. `packages/shared/src/i18n/index.ts`
```typescript
import en from './en.json' with { type: 'json' };
import tr from './tr.json' with { type: 'json' };

const locales: Record<string, Record<string, string>> = {
  en,
  tr,
};

export function t(key: string, locale: string = 'en'): string {
  return locales[locale]?.[key] || locales['en']?.[key] || key;
}

export function getAvailableLocales(): string[] {
  return Object.keys(locales);
}

export { en, tr };
```

### 55. `packages/shared/src/i18n/en.json`
```json
{
  "app.name": "BrewForm",
  "app.tagline": "Coffee brewing recipes and tasting notes",
  "nav.home": "Home",
  "nav.recipes": "Recipes",
  "nav.profile": "Profile",
  "nav.settings": "Settings",
  "nav.login": "Log In",
  "nav.register": "Sign Up",
  "nav.logout": "Log Out",
  "auth.login": "Log In",
  "auth.register": "Sign Up",
  "auth.email": "Email",
  "auth.password": "Password",
  "auth.confirmPassword": "Confirm Password",
  "auth.username": "Username",
  "auth.forgotPassword": "Forgot Password?",
  "auth.resetPassword": "Reset Password",
  "recipe.create": "New Recipe",
  "recipe.edit": "Edit Recipe",
  "recipe.fork": "Fork Recipe",
  "recipe.compare": "Compare",
  "recipe.version": "Version",
  "recipe.versions": "Versions",
  "recipe.delete": "Delete",
  "recipe.visibility": "Visibility",
  "recipe.brewMethod": "Brew Method",
  "recipe.drinkType": "Drink Type",
  "recipe.grinder": "Grinder",
  "recipe.dose": "Dose",
  "recipe.yield": "Yield",
  "recipe.ratio": "Ratio",
  "recipe.time": "Time",
  "recipe.temperature": "Temperature",
  "recipe.tasteNotes": "Taste Notes",
  "recipe.photos": "Photos",
  "recipe.comments": "Comments",
  "recipe.likes": "Likes",
  "recipe.forks": "Forks",
  "taste.search": "Search taste notes...",
  "taste.reference": "SCAA Flavor Wheel Reference",
  "setup.myEquipments": "My Equipment",
  "setup.myBeans": "My Beans",
  "preferences.title": "Preferences",
  "preferences.unitSystem": "Unit System",
  "preferences.temperature": "Temperature Unit",
  "preferences.theme": "Theme",
  "preferences.locale": "Language",
  "preferences.timezone": "Timezone",
  "preferences.dateFormat": "Date Format",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.coffee": "Coffee",
  "unit.metric": "Metric",
  "unit.imperial": "Imperial",
  "visibility.draft": "Draft",
  "visibility.private": "Private",
  "visibility.unlisted": "Unlisted",
  "visibility.public": "Public",
  "badge.firstBrew": "First Brew",
  "badge.decadeBrewer": "Decade Brewer",
  "badge.centurion": "Centurion",
  "error.404": "Page not found",
  "error.500": "Something went wrong",
  "common.save": "Save",
  "common.cancel": "Cancel",
  "common.delete": "Delete",
  "common.edit": "Edit",
  "common.search": "Search",
  "common.loading": "Loading...",
  "common.noResults": "No results found",
  "cookie.consent": "We use cookies to improve your experience",
  "cookie.accept": "Accept",
  "cookie.reject": "Reject"
}
```

### 56. `packages/shared/src/i18n/tr.json`
```json
{
  "app.name": "BrewForm",
  "app.tagline": "Kahve demleme tarifleri ve tadım notları",
  "nav.home": "Ana Sayfa",
  "nav.recipes": "Tarifler",
  "nav.profile": "Profil",
  "nav.settings": "Ayarlar",
  "nav.login": "Giriş Yap",
  "nav.register": "Kayıt Ol",
  "nav.logout": "Çıkış Yap",
  "auth.login": "Giriş Yap",
  "auth.register": "Kayıt Ol",
  "auth.email": "E-posta",
  "auth.password": "Şifre",
  "auth.confirmPassword": "Şifre Tekrarı",
  "auth.username": "Kullanıcı Adı",
  "auth.forgotPassword": "Şifremi Unuttum",
  "auth.resetPassword": "Şifreyi Sıfırla",
  "recipe.create": "Yeni Tarif",
  "recipe.edit": "Tarifi Düzenle",
  "recipe.fork": "Tarifi Çatalla",
  "recipe.compare": "Karşılaştır",
  "recipe.version": "Sürüm",
  "recipe.versions": "Sürümler",
  "recipe.delete": "Sil",
  "recipe.visibility": "Görünürlük",
  "recipe.brewMethod": "Demleme Yöntemi",
  "recipe.drinkType": "İçecek Türü",
  "recipe.grinder": "Öğütücü",
  "recipe.dose": "Doz",
  "recipe.yield": "Verim",
  "recipe.ratio": "Oran",
  "recipe.time": "Süre",
  "recipe.temperature": "Sıcaklık",
  "recipe.tasteNotes": "Tat Notları",
  "recipe.photos": "Fotoğraflar",
  "recipe.comments": "Yorumlar",
  "recipe.likes": "Beğeniler",
  "recipe.forks": "Çatallar",
  "taste.search": "Tat notlarını ara...",
  "taste.reference": "SCAA Lezzet Tekerleği Referansı",
  "setup.myEquipments": "Ekipmanlarım",
  "setup.myBeans": "Çekirdeklerim",
  "preferences.title": "Tercihler",
  "preferences.unitSystem": "Birim Sistemi",
  "preferences.temperature": "Sıcaklık Birimi",
  "preferences.theme": "Tema",
  "preferences.locale": "Dil",
  "preferences.timezone": "Zaman Dilimi",
  "preferences.dateFormat": "Tarih Formatı",
  "theme.light": "Açık",
  "theme.dark": "Koyu",
  "theme.coffee": "Kahve",
  "unit.metric": "Metrik",
  "unit.imperial": "İmperyal",
  "visibility.draft": "Taslak",
  "visibility.private": "Özel",
  "visibility.unlisted": "Liste Dışı",
  "visibility.public": "Herkese Açık",
  "badge.firstBrew": "İlk Demleme",
  "badge.decadeBrewer": "Onlu Demleyici",
  "badge.centurion": "Yüzlü",
  "error.404": "Sayfa bulunamadı",
  "error.500": "Bir şeyler ters gitti",
  "common.save": "Kaydet",
  "common.cancel": "İptal",
  "common.delete": "Sil",
  "common.edit": "Düzenle",
  "common.search": "Ara",
  "common.loading": "Yükleniyor...",
  "common.noResults": "Sonuç bulunamadı",
  "cookie.consent": "Deneyiminizi iyileştirmek için çerezler kullanıyoruz",
  "cookie.accept": "Kabul Et",
  "cookie.reject": "Reddet"
}
```

---

### 57. `packages/db/package.json`
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

### 58. `packages/db/tsconfig.json`
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
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "prisma"]
}
```

### 59. `packages/db/src/index.ts`
```typescript
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

export const prisma = globalForPrisma.prisma || new PrismaClient();

if (Deno.env.get('APP_ENV') !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;
```

---

### 60. `files/scaa-2.json`
Download from https://notbadcoffee.com/flavor-wheel/scaa-2.json (will be fetched during execution).

---

### 61. `state.md` — Progress Tracker
See separate state tracking file.

---

## Verification Steps
1. `docker compose build` — should succeed
2. `docker compose run --rm app npm install` — should install all dependencies
3. `docker compose run --rm app deno check apps/api/src/main.ts` — should pass type check
4. `docker compose up -d postgres` — database should start
5. `docker compose run --rm app npx prisma generate --schema=packages/db/prisma/schema.prisma` — should generate client

## Key Design Decisions
- Deno v2.7.13 (as specified in plan, confirmed latest)
- No import maps — all imports use explicit specifiers
- Tailwind CSS v4 for frontend styling
- BaseUI for headless React components
- All commands run through Docker
- Workspace protocol for inter-package dependencies