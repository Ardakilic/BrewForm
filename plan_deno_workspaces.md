# BrewForm: Turborepo → Deno Workspaces — Migration Plan

---

## 1. Executive Summary

BrewForm already has Deno workspaces configured in root `deno.json` (`"workspace": {"members": ["apps/*", "packages/*"]}`). Turborepo and npm workspaces are a redundant second orchestration layer. This migration:

- **Removes** Turborepo (`turbo` package, `turbo.json`, `.turbo/` caches)
- **Removes** npm workspaces from root `package.json`
- **Removes** `--unstable-sloppy-imports` flag by fixing 47 extension-less imports in `packages/shared/src/` barrel files
- **Adds** `deno task` definitions to all `deno.json` files for orchestration
- **Simplifies** Docker volumes from 5 `node_modules` volumes → 1
- **Eliminates** the `.npmrc` file (JSR is native to Deno)

**Result**: Single-toolchain monorepo — Deno handles workspace discovery, dependency installation, task orchestration, formatting, linting, testing, and type checking.

---

## 2. Rationale & Reasoning

### 2.1 Why remove Turborepo?

| Concern | Analysis |
|---------|----------|
| **Dual workspace systems** | The project configures workspaces in BOTH `package.json` (`"workspaces": [...]`) and `deno.json` (`"workspace": {"members": [...]}`). These overlap. Only one is needed. |
| **Turbo adds npm dependency** | `turbo` is an npm package installed via `package.json`. Since the project is pure Deno, pulling in a Node.js-native task runner creates unnecessary complexity. |
| **Deno task covers all needs** | `deno task` supports `--recursive` (run across all workspace members), `--filter <name>` (target specific members), and task `"dependencies"` (within a single config). |
| **Turbo cache is unused** | The `.turbo/` directory caches build artifacts. In this project, no package has a real build step (API is source-run, web uses Vite, shared/db are source-referenced). The cache provides no benefit. |
| **CI doesn't use turbo** | Both `ci.yml` and `pr.yml` call Deno commands directly (`deno lint`, `deno check`, `deno test`), not `turbo run`. Turbo is only invoked through the root `package.json` `scripts` (for local dev convenience). |

### 2.2 Why remove `--unstable-sloppy-imports`?

The flag enables three behaviors:
1. Omitting file extensions in relative imports (`from './foo'` → `./foo.ts`)
2. Importing directories (resolves to `index.ts`/`index.js`)
3. Using incorrect extensions

**Current dependency**: Only 6 files in `packages/shared/src/` use extension-less imports (47 total lines across barrel/index files). The `apps/api/src/` directory is fully clean — all relative imports use explicit `.ts` extensions. The `apps/web/src/` directory has 71 files with 152 extension-less imports, but these are resolved by **Vite's bundler**, not Deno's module resolver — they are irrelevant to `deno check`.

**Fix**: Add explicit `.ts` extensions to the 47 imports in `packages/shared/src/` barrel files. This eliminates the need for `--unstable-sloppy-imports` entirely.

### 2.3 Why `nodeModulesDir: "auto"`?

Deno resolves npm packages in two modes:
- **Without `nodeModulesDir`**: Downloads packages to a global cache, resolves in-memory. This is Deno's default.
- **With `nodeModulesDir: "auto"`** (or `"manual"`): Creates a local `node_modules/` directory.

The project uses `node_modules/` extensively:
- Docker volumes mount `node_modules` to persist installed packages
- Vite and Vitest run from `node_modules/.bin/`
- Some tooling expects a `node_modules` directory

Setting `nodeModulesDir: "auto"` in root `deno.json` makes this explicit and ensures `deno install` creates the expected directory structure.

### 2.4 Why keep member `package.json` files?

Member `package.json` files serve as dependency manifests that both Deno and Renovate understand. Deno's npm compatibility layer reads `package.json` `"dependencies"` to resolve bare specifiers like `import { Hono } from 'hono'`. Removing them would require migrating all npm dependencies to `deno.json` `"imports"` maps, which is more disruptive and less tooling-compatible.

### 2.5 Why remove root `package.json` dependencies?

Dependencies in the root `package.json` are workspace-level but not actually imported from root. Each dependency belongs to a specific package:
- `drizzle-orm` / `postgres` → `packages/db`
- `nodemailer` / `pino-pretty` → `apps/api`
- `drizzle-kit` → `packages/db`
- `@std/testing` / `@std/expect` → `apps/api` + `packages/db`
- `@types/nodemailer` → `apps/api`
- `typescript` → Not needed (Deno has built-in TypeScript)
- `turbo` → Removed permanently

Moving them to their actual consumer packages is architecturally correct and enables Renovate to update them in the correct scope.

---

## 3. Import Fix: Eliminating `--unstable-sloppy-imports`

### 3.1 Files to fix (6 files, 47 edits)

All changes add `.ts` extensions to import/export specifiers in barrel files.

#### File 1: `packages/shared/src/types/index.ts` (14 edits)

**Current** (extension-less):
```ts
export type { Recipe } from './recipe';
// ... (13 more lines like this)
```

**Edit**: Add `.ts` to every `from '...'` specifier.
```ts
export type { Recipe } from './recipe.ts';
export type { RecipeVersion } from './recipe.ts';
export type { Equipment } from './equipment.ts';
export type { Bean } from './bean.ts';
export type { Vendor } from './vendor.ts';
export type { TasteNote } from './taste-note.ts';
export type { User } from './user.ts';
export type { UserPreferences } from './user.ts';
export type { Comment } from './comment.ts';
export type { Photo } from './photo.ts';
export type { Setup } from './setup.ts';
export type { Badge } from './badge.ts';
export type { Report } from './report.ts';
export type { Follow } from './follow.ts';
```

*(Exact list depends on actual file contents — the pattern is: append `.ts` to every bare module path in `from` clauses)*

#### File 2: `packages/shared/src/schemas/index.ts` (13 edits)

Same pattern — add `.ts` to every re-export:
```ts
export { RecipeCreateSchema } from './recipe.ts';
// ... (12 more)
```

#### File 3: `packages/shared/src/constants/index.ts` (7 edits)

Same pattern:
```ts
export { BREW_METHODS } from './brew-methods.ts';
// ... (6 more)
```

#### File 4: `packages/shared/src/utils/index.ts` (6 edits)

Same pattern:
```ts
export { generateSlug } from './slug.ts';
// ... (5 more)
```

#### File 5: `packages/shared/src/index.ts` (4 edits)

Same pattern:
```ts
export * from './types/index.ts';
export * from './schemas/index.ts';
export * from './constants/index.ts';
export * from './utils/index.ts';
```

#### File 6: `packages/shared/src/types/additional-preparation.ts` (1 edit)

If this file has `import type { ... } from './recipe'` → `import type { ... } from './recipe.ts'`.

### 3.2 Verification

After fixing shared barrel files:
```bash
deno check apps/api/src/main.ts        # should pass without --unstable-sloppy-imports
```

The web package (`apps/web/src/`) does NOT need fixing — it uses Vite's resolver, not Deno's.

---

## 4. Root `deno.json` — Full Configuration

### Current state (51 lines):
```json
{
  "unstable": ["cron", "kv"],
  "workspace": {
    "members": ["apps/*", "packages/*"]
  },
  "compilerOptions": { /* ... unchanged ... */ },
  "lint": { /* ... unchanged ... */ },
  "fmt": { /* ... unchanged ... */ },
  "test": { /* ... unchanged ... */ }
}
```

### Target state (additions shown, unchanged sections noted):

```json
{
  "unstable": ["cron", "kv"],
  "workspace": {
    "members": ["apps/*", "packages/*"]
  },
  "nodeModulesDir": "auto",
  "tasks": {
    "dev": "deno task --recursive dev",
    "build": "deno task --recursive build",
    "lint": "deno lint apps/ packages/",
    "fmt": "deno fmt",
    "fmt-check": "deno fmt --check",
    "check": "deno check apps/api/src/main.ts",
    "test": "deno task --recursive test",
    "test-coverage": "deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/",
    "coverage-report": "deno coverage coverage/",
    "db:generate": "deno task --cwd packages/db generate",
    "db:migrate": "deno task --cwd packages/db migrate",
    "db:push": "deno task --cwd packages/db push",
    "db:studio": "deno task --cwd packages/db studio",
    "db:seed": "deno run --allow-all packages/db/src/seed.ts",
    "email-build": "deno task --cwd apps/api email-build",
    "ci": "deno task fmt-check && deno task lint && deno task check && deno task test-coverage"
  },
  "compilerOptions": {
    "strict": true,
    "lib": ["dom", "dom.iterable", "esnext", "deno.ns", "deno.unstable"],
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": [
      "./apps/api/src/types/mjml.d.ts",
      "./apps/api/src/types/pino-pretty.d.ts"
    ]
  },
  "lint": {
    "include": ["apps/", "packages/"],
    "exclude": ["**/node_modules/", "**/dist/", "**/generated/", "packages/db/drizzle/"],
    "rules": {
      "tags": ["recommended"],
      "exclude": [
        "no-import-prefix",
        "no-unversioned-import",
        "no-explicit-any",
        "require-await",
        "no-empty"
      ]
    }
  },
  "fmt": {
    "useTabs": false,
    "lineWidth": 100,
    "indentWidth": 2,
    "singleQuote": true,
    "semiColons": true,
    "include": ["apps/", "packages/"],
    "exclude": ["**/node_modules/", "**/dist/", "**/generated/", "packages/db/drizzle/"]
  },
  "test": {
    "include": [
      "apps/api/src/",
      "packages/shared/src/",
      "packages/db/src/"
    ],
    "exclude": [
      "src/generated/",
      "node_modules/",
      "packages/db/drizzle/"
    ]
  }
}
```

### Change summary:
| Property | Change |
|----------|--------|
| `nodeModulesDir` | **Added**: `"auto"` — creates `node_modules/` for npm compatibility |
| `tasks` | **Added**: 16 task definitions replacing package.json scripts + turbo orchestration |
| Everything else | **Unchanged** |

### Key reasoning for each task:

| Task | Command | Why |
|------|---------|-----|
| `dev` | `deno task --recursive dev` | Runs `dev` in all members that define it (api + web) |
| `build` | `deno task --recursive build` | Runs `build` in all members |
| `lint` | `deno lint apps/ packages/` | Direct — faster than recursive task invocation |
| `check` | `deno check apps/api/src/main.ts` | Type-checks API entrypoint (traces into shared + db) |
| `test` | `deno task --recursive test` | Runs tests in all members |
| `db:*` | `deno task --cwd packages/db <task>` | Delegates to member-specific drizzle tasks |
| `ci` | Sequential `&&` chain | Ensures ordered execution (fmt → lint → check → test) |

---

## 5. Workspace Member `deno.json` — Full Configurations

### 5.1 `apps/api/deno.json`

**Current**:
```json
{
  "deploy": {
    "install": "deno install",
    "build": "deno task db:generate && deno task email-build",
    "runtime": {
      "mode": "dynamic",
      "entrypoint": "src/main.ts"
    }
  }
}
```

**Target** (add `name` + `tasks`, keep `deploy`):
```json
{
  "name": "@brewform/api",
  "tasks": {
    "dev": "deno run --allow-all --unstable-cron --watch src/main.ts",
    "build": "deno task email-build",
    "lint": "deno lint src/",
    "check": "deno check src/main.ts",
    "test": "deno test --no-check --allow-all src/",
    "email-build": "deno run -A scripts/build-email-templates.ts"
  },
  "deploy": {
    "install": "deno install",
    "build": "deno task db:generate && deno task email-build",
    "runtime": {
      "mode": "dynamic",
      "entrypoint": "src/main.ts"
    }
  }
}
```

**Rationale**:
- `"name": "@brewform/api"` — enables `--filter` targeting
- `dev` task matches Docker compose command: `deno run --allow-all --watch src/main.ts` (plus `--unstable-cron`)
- `build` delegates to `email-build` (API has no compilation build step — it runs from source)
- `test` uses `--no-check` because `check` is a separate CI step (avoids double type-checking)

### 5.2 `apps/web/deno.json`

**Current**:
```json
{
  "deploy": {
    "install": "deno install",
    "build": "deno task build",
    "runtime": {
      "mode": "static",
      "cwd": "./dist",
      "spa": true
    }
  }
}
```

**Target**:
```json
{
  "name": "@brewform/web",
  "tasks": {
    "dev": "deno run -A npm:vite --host 0.0.0.0 --port 5173",
    "build": "deno run -A npm:vite build",
    "preview": "deno run -A npm:vite preview",
    "lint": "deno lint src/",
    "test": "deno run -A npm:vitest run",
    "test:watch": "deno run -A npm:vitest"
  },
  "deploy": {
    "install": "deno install",
    "build": "deno task build",
    "runtime": {
      "mode": "static",
      "cwd": "./dist",
      "spa": true
    }
  }
}
```

**Rationale**:
- `dev`, `build`, `preview` use `deno run -A npm:vite` — Vite runs through Deno's npm compatibility
- `test` uses `deno run -A npm:vitest run` — Vitest runs through Deno (Vitest imports are resolved via `node_modules/`, which `nodeModulesDir: "auto"` creates)
- No `check` task — web uses Vite's TypeScript compilation, not `deno check`

### 5.3 `packages/db/deno.json`

**Current**:
```json
{
  "name": "@brewform/db",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts"
  }
}
```

**Target**:
```json
{
  "name": "@brewform/db",
  "exports": {
    ".": "./src/index.ts",
    "./schema": "./src/schema.ts"
  },
  "tasks": {
    "build": "deno run -A npm:drizzle-kit@0.31.10 generate",
    "generate": "deno run -A npm:drizzle-kit@0.31.10 generate",
    "migrate": "deno run -A npm:drizzle-kit@0.31.10 migrate",
    "push": "deno run -A npm:drizzle-kit@0.31.10 push",
    "studio": "deno run -A npm:drizzle-kit@0.31.10 studio --host=0.0.0.0 --port=5555",
    "lint": "deno lint src/",
    "check": "deno check src/index.ts",
    "test": "deno test --allow-all src/"
  }
}
```

**Rationale**:
- Drizzle Kit commands as individual tasks — the root `db:*` tasks delegate here via `--cwd`
- `build` → `drizzle-kit generate` — this is the "build" step for the db package (generating migration SQL)
- `check` checks the db package independently

### 5.4 `packages/shared/deno.json`

**Current**:
```json
{
  "name": "@brewform/shared",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./constants": "./src/constants/index.ts",
    "./utils": "./src/utils/index.ts",
    "./i18n": "./src/i18n/index.ts"
  }
}
```

**Target**:
```json
{
  "name": "@brewform/shared",
  "exports": {
    ".": "./src/index.ts",
    "./types": "./src/types/index.ts",
    "./schemas": "./src/schemas/index.ts",
    "./constants": "./src/constants/index.ts",
    "./utils": "./src/utils/index.ts",
    "./i18n": "./src/i18n/index.ts"
  },
  "tasks": {
    "build": "deno check src/index.ts",
    "lint": "deno lint src/",
    "check": "deno check src/index.ts",
    "test": "deno test --allow-all src/"
  }
}
```

**Rationale**:
- `build` → `deno check` — shared has no compilation; type-checking serves as the build verification
- No `--no-check` on test (unlike api) — shared tests are typically run independently and benefit from inline type verification

---

## 6. Root `package.json` — Simplification

### Current:
```json
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "build": "turbo run build",
    "dev": "turbo run dev",
    "lint": "turbo run lint",
    "test": "turbo run test",
    "check": "turbo run check",
    "db:generate": "cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate",
    "db:migrate": "cd packages/db && deno run -A npm:drizzle-kit@0.31.10 migrate",
    "db:push": "cd packages/db && deno run -A npm:drizzle-kit@0.31.10 push",
    "db:studio": "cd packages/db && deno run -A npm:drizzle-kit@0.31.10 studio --host=0.0.0.0 --port=5555",
    "db:seed": "deno run --allow-all packages/db/src/seed.ts",
    "email-build": "cd apps/api && deno run -A scripts/build-email-templates.ts"
  },
  "devDependencies": {
    "@types/nodemailer": "^8.0.0",
    "drizzle-kit": "0.31.10",
    "turbo": "^2.5.0",
    "typescript": "^5.8.0",
    "@std/testing": "jsr:@std/testing@^1.0.18",
    "@std/expect": "jsr:@std/expect@^1.0.19"
  },
  "dependencies": {
    "drizzle-orm": "^0.45.0",
    "nodemailer": "^8.0.6",
    "pino-pretty": "^13.1.3",
    "postgres": "^3.4.5"
  }
}
```

### Target:
```json
{
  "private": true,
  "scripts": {
    "dev": "deno task dev",
    "build": "deno task build",
    "lint": "deno task lint",
    "test": "deno task test",
    "check": "deno task check",
    "db:generate": "deno task db:generate",
    "db:migrate": "deno task db:migrate",
    "db:push": "deno task db:push",
    "db:studio": "deno task db:studio",
    "db:seed": "deno task db:seed",
    "email-build": "deno task email-build",
    "fmt": "deno task fmt",
    "fmt-check": "deno task fmt-check",
    "ci": "deno task ci"
  }
}
```

### Changes:
| Property | Action | Reason |
|----------|--------|--------|
| `workspaces` | **Remove** | Deno handles workspace discovery via `deno.json` |
| `scripts` | **Rewrite** | All delegate to `deno task <name>` (defined in root `deno.json`) |
| `devDependencies` | **Remove** | Dependencies belong in member `package.json` files where they're actually used |
| `dependencies` | **Remove** | Same — move to member packages that need them |

### Dependency relocation:

| Package | Currently in root | Moves to |
|---------|-------------------|----------|
| `drizzle-orm` | root `dependencies` | Already in `packages/db/package.json` ✓ |
| `postgres` | root `dependencies` | Already in `packages/db/package.json` ✓ |
| `nodemailer` | root `dependencies` | Already in `apps/api/package.json` ✓ |
| `pino-pretty` | root `dependencies` | Already in `apps/api/package.json` ✓ |
| `drizzle-kit` | root `devDependencies` | Already in `packages/db/package.json` ✓ |
| `@std/testing` | root `devDependencies` | Add to `apps/api/package.json` + `packages/db/package.json` |
| `@std/expect` | root `devDependencies` | Add to `apps/api/package.json` + `packages/db/package.json` |
| `@types/nodemailer` | root `devDependencies` | Add to `apps/api/package.json` |
| `typescript` | root `devDependencies` | Not needed (Deno has built-in TS) — remove |
| `turbo` | root `devDependencies` | **Remove permanently** |

**Note**: `@std/testing` and `@std/expect` are JSR packages. They need to be present in `package.json` `devDependencies` of packages that import them, or they can be specified via `deno.json` `"imports"`. Since the code imports them via `jsr:` specifiers, adding to `package.json` ensures `deno install` resolves them to `node_modules/`.

### Member `package.json` changes needed:

#### `apps/api/package.json` — add missing devDependencies:
```json
{
  "name": "@brewform/api",
  "type": "module",
  "scripts": {},
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "@brewform/db": "workspace:*",
    "hono": "^4.7.0",
    "@hono/zod-validator": "^0.8.0",
    "@hono/standard-validator": "^0.2.0",
    "hono-openapi": "^1.0.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "date-fns": "^4.1.0",
    "bcryptjs": "^2.4.3",
    "qrcode": "^1.5.4",
    "nodemailer": "^8.0.6"
  },
  "devDependencies": {
    "mjml": "^4.15.0",
    "@types/bcryptjs": "^2.4.6",
    "@types/qrcode": "^1.5.5",
    "@types/nodemailer": "^8.0.0",
    "@std/testing": "jsr:@std/testing@^1.0.18",
    "@std/expect": "jsr:@std/expect@^1.0.19"
  }
}
```

#### `packages/db/package.json` — add missing devDependencies:
```json
{
  "name": "@brewform/db",
  "type": "module",
  "exports": {
    ".": { "types": "./src/index.ts", "default": "./src/index.ts" },
    "./schema": { "types": "./src/schema.ts", "default": "./src/schema.ts" }
  },
  "scripts": {},
  "dependencies": {
    "@brewform/shared": "workspace:*",
    "drizzle-orm": "^0.45.0",
    "postgres": "^3.4.5"
  },
  "devDependencies": {
    "drizzle-kit": "^0.31.0",
    "@std/testing": "jsr:@std/testing@^1.0.18",
    "@std/expect": "jsr:@std/expect@^1.0.19"
  }
}
```

**Note on `scripts`**: The `"scripts"` field is emptied (kept as `{}`) rather than removed, preserving backward compatibility with any tooling that checks for it. Tasks are defined in `deno.json` now.

---

## 7. Dockerfile — Full Rewrite

### Current:
```dockerfile
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
COPY package.json turbo.json .npmrc deno.json deno.lock ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
RUN deno install --frozen

FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
COPY --from=deps /root/.cache/deno /root/.cache/deno
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .
RUN cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate
RUN deno check --unstable-sloppy-imports apps/api/src/main.ts

FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
COPY --from=builder /root/.cache/deno /root/.cache/deno
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-sloppy-imports", "--unstable-cron", "apps/api/src/main.ts"]
```

### Target:
```dockerfile
FROM denoland/deno:debian-2.7.13 AS deps
WORKDIR /app
COPY deno.json deno.lock ./
COPY apps/api/package.json apps/api/deno.json ./apps/api/
COPY apps/web/package.json apps/web/deno.json ./apps/web/
COPY packages/shared/package.json packages/shared/deno.json ./packages/shared/
COPY packages/db/package.json packages/db/deno.json ./packages/db/
RUN deno install --frozen

FROM denoland/deno:debian-2.7.13 AS builder
WORKDIR /app
COPY --from=deps /root/.cache/deno /root/.cache/deno
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN cd packages/db && deno run -A npm:drizzle-kit@0.31.10 generate
RUN deno check apps/api/src/main.ts

FROM denoland/deno:debian-2.7.13 AS runner
WORKDIR /app
COPY --from=builder /root/.cache/deno /root/.cache/deno
COPY --from=builder /app .
EXPOSE 8000
CMD ["deno", "run", "--allow-read", "--allow-write", "--allow-net", "--allow-env", "--allow-sys", "--unstable-cron", "apps/api/src/main.ts"]
```

### Changes:

| Line | Change | Reason |
|------|--------|--------|
| 2 (COPY) | Remove `package.json` (root), `turbo.json`, `.npmrc` | Root `package.json` simplified; turbo.json deleted; .npmrc no longer needed |
| 12 (COPY) | Remove per-package `node_modules` copy | With `nodeModulesDir: "auto"` at root, ALL npm packages are hoisted to `/app/node_modules/`. No per-package `node_modules` exist. |
| 14 (RUN) | Remove `--unstable-sloppy-imports` | Fixed extension-less imports in shared package barrel files |
| 20 (CMD) | Remove `--unstable-sloppy-imports` | Same — no longer needed |

---

## 8. Docker Compose — Node Modules Volume Simplification

### Current volumes (in `app` and `web-dev` services):
```yaml
volumes:
  - .:/app
  - app_node_modules:/app/node_modules
  - app_api_node_modules:/app/apps/api/node_modules
  - app_web_node_modules:/app/apps/web/node_modules
  - app_shared_node_modules:/app/packages/shared/node_modules
  - app_db_node_modules:/app/packages/db/node_modules
  - deno_cache:/root/.cache/deno
```

### Target volumes:
```yaml
volumes:
  - .:/app
  - app_node_modules:/app/node_modules
  - deno_cache:/root/.cache/deno
```

### Volume declaration (bottom of file):

**Remove**:
```yaml
  app_api_node_modules:
  app_web_node_modules:
  app_shared_node_modules:
  app_db_node_modules:
```

**Keep**:
```yaml
  postgres_data:
  garage_data:
  garage_meta:
  deno_cache:
  app_node_modules:
```

### Apply to ALL services using these volumes:
- `app` service — remove 4 per-package node_modules volumes
- `web-dev` service — remove 4 per-package node_modules volumes

### Reasoning:
When `nodeModulesDir: "auto"` is set in the root `deno.json` and Deno workspace is configured, `deno install` creates a single hoisted `node_modules/` at the workspace root (like pnpm/lerna do). There are no per-package `node_modules/` directories. One volume covers everything.

---

## 9. Makefile — Updated

### Changes:

The current Makefile already calls Deno commands directly (not turbo). The changes are:

1. **`install` target** — unchanged (already calls `deno install --frozen`)
2. **`check` target** — remove `--unstable-sloppy-imports` flag:
   ```makefile
   # Before:
   check: install
   	docker compose run --rm --no-deps app deno check --unstable-sloppy-imports apps/api/src/main.ts

   # After:
   check: install
   	docker compose run --rm --no-deps app deno check apps/api/src/main.ts
   ```
3. **`check-tests` target** — remove `--unstable-sloppy-imports`:
   ```makefile
   # Before:
   check-tests:
   	docker compose run --rm --no-deps app deno check --unstable-sloppy-imports apps/api/src/ packages/shared/src/

   # After:
   check-tests:
   	docker compose run --rm --no-deps app deno check apps/api/src/ packages/shared/src/
   ```
4. **`test` target** — remove `--unstable-sloppy-imports`:
   ```makefile
   # Before:
   test:
   	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/ packages/shared/src/

   # After:
   test:
   	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/ packages/shared/src/
   ```
5. **`test-coverage` target** — remove `--unstable-sloppy-imports`:
   ```makefile
   # Before:
   test-coverage:
   	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/

   # After:
   test-coverage:
   	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi --coverage=coverage/ apps/api/src/ packages/shared/src/
   ```
6. **`test-api` target** — remove `--unstable-sloppy-imports`:
   ```makefile
   # Before:
   test-api:
   	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/

   # After:
   test-api:
   	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi apps/api/src/
   ```
7. **`test-specific` target** — remove `--unstable-sloppy-imports`:
   ```makefile
   # Before:
   test-specific:
   	docker compose run --rm app deno test --unstable-sloppy-imports --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi $(filter)

   # After:
   test-specific:
   	docker compose run --rm app deno test --no-check --allow-env --allow-read --allow-write --allow-net --allow-sys --allow-ffi $(filter)
   ```

### Pattern: Remove `--unstable-sloppy-imports` everywhere in Makefile.

Search-and-replace: `--unstable-sloppy-imports ` → `` (empty string) across all targets.

---

## 10. CI/CD — GitHub Actions

### `ci.yml` changes:

The CI workflow already uses Deno commands directly. Two changes:

1. **Remove `--unstable-sloppy-imports`** from the type check step:
   ```yaml
   # Before:
   - name: Type check
     run: deno check --unstable-sloppy-imports apps/api/src/main.ts

   # After:
   - name: Type check
     run: deno task check
   ```
   Note: Using `deno task check` delegates to the task defined in root `deno.json`, which runs `deno check apps/api/src/main.ts`.

2. **Remove `--unstable-sloppy-imports`** from the test step:
   ```yaml
   # Before:
   - name: Run tests with coverage
     run: |
       deno test --unstable-sloppy-imports --no-check --allow-all \
         --coverage=coverage/ \
         apps/api/src/ packages/shared/src/

   # After:
   - name: Run tests with coverage
     run: deno task test-coverage
   ```

### `pr.yml` changes:

1. **Remove `--unstable-sloppy-imports`** from type check:
   ```yaml
   # Before:
   - name: Type check
     run: deno check --unstable-sloppy-imports apps/api/src/main.ts

   # After:
   - name: Type check
     run: deno task check
   ```

2. **Remove `--unstable-sloppy-imports`** from shared tests:
   ```yaml
   # Before:
   - name: Run shared package tests
     run: |
       deno test --unstable-sloppy-imports --no-check \
         --allow-env --allow-read --allow-write --allow-net --allow-sys \
         packages/shared/src/

   # After:
   - name: Run shared package tests
     run: deno task --cwd packages/shared test
   ```

### Reasoning for using `deno task` in CI:
Delegating to `deno task <name>` ensures CI uses the same commands defined in configuration. If flags change, only `deno.json` needs updating — not CI YAML files.

---

## 11. Other Configuration Files

### 11.1 `.npmrc` → DELETE

This file contains only `@jsr:registry=https://npm.jsr.io`. Deno resolves JSR packages natively via `jsr:` specifiers — no npm registry redirect needed. The file is a remnant of the npm workspace era.

### 11.2 `.gitignore` → Add entry

Add `!.turbo/` is not currently in `.gitignore`. Add:
```gitignore
# Turbo
.turbo/
```

(The existing entries cover `node_modules/`, `dist/`, `coverage/` — no changes needed for those.)

### 11.3 `.dockerignore` → Update

Add `.turbo/` to the ignore list:
```
node_modules
.git
.turbo
coverage
```

### 11.4 Renovate (`renovate.json`) → No changes

Renovate's `config:recommended` auto-discovers `package.json` files. Since we keep member `package.json` files, Renovate continues to work. If root `package.json` is simplified to scripts-only, Renovate will ignore it (no dependencies to update) and focus on member packages — which is correct.

### 11.5 `turbo.json` → DELETE

The entire file is replaced by `deno.json` task definitions. No functional equivalent is needed.

---

## 12. Files to Delete (Complete List)

| File/Directory | Reason |
|---------------|--------|
| `turbo.json` | Replaced by `deno.json` tasks |
| `.turbo/` (all) | Turbo cache — no longer needed |
| `.npmrc` | JSR is native to Deno |
| Root `node_modules/` | Will be regenerated by `deno install` |
| `deno.lock` | Will be regenerated by `deno install` |

---

## 13. Migration Steps (Execution Order)

### Phase 1: Import Fixes (safe, no breakage)
- [ ] **Step 1**: Add `.ts` extensions to 47 imports in `packages/shared/src/` barrel files (6 files: `index.ts`, `types/index.ts`, `schemas/index.ts`, `constants/index.ts`, `utils/index.ts`, `types/additional-preparation.ts`)
- [ ] **Step 2**: Verify: `deno check apps/api/src/main.ts` passes without `--unstable-sloppy-imports`

### Phase 2: Configuration (safe, no breakage)
- [ ] **Step 3**: Add `"nodeModulesDir": "auto"` to root `deno.json`
- [ ] **Step 4**: Add `"tasks"` to root `deno.json` (16 tasks)
- [ ] **Step 5**: Add `"name"` + `"tasks"` to `apps/api/deno.json`
- [ ] **Step 6**: Add `"name"` + `"tasks"` to `apps/web/deno.json`
- [ ] **Step 7**: Add `"tasks"` to `packages/db/deno.json`
- [ ] **Step 8**: Add `"tasks"` to `packages/shared/deno.json`
- [ ] **Step 9**: Move root `package.json` devDeps to member `package.json` files (`@std/testing`, `@std/expect` → api + db; `@types/nodemailer` → api)
- [ ] **Step 10**: Remove `typescript` and `turbo` from root `package.json` devDependencies
- [ ] **Step 11**: Verify: `deno task --recursive check` works
- [ ] **Step 12**: Verify: `deno task --recursive test` works

### Phase 3: Turbo Removal
- [ ] **Step 13**: Simplify root `package.json` — remove `"workspaces"`, `"dependencies"`, `"devDependencies"`; rewrite `"scripts"` to delegate to `deno task`
- [ ] **Step 14**: Empty `"scripts"` in all member `package.json` files (keep `{}`)
- [ ] **Step 15**: Delete `turbo.json`
- [ ] **Step 16**: Delete `.npmrc`
- [ ] **Step 17**: Delete all `.turbo/` directories
- [ ] **Step 18**: Delete root `node_modules/` and `deno.lock`
- [ ] **Step 19**: Run `deno install` (regenerates `node_modules/` + `deno.lock`)
- [ ] **Step 20**: Verify: `deno task ci` passes

### Phase 4: Docker + Compose
- [ ] **Step 21**: Update `Dockerfile` (4 changes: COPY lines, remove `--unstable-sloppy-imports`)
- [ ] **Step 22**: Update `compose.yml` (remove 4 per-package `node_modules` volumes from `app` and `web-dev` services + remove 4 volume declarations)
- [ ] **Step 23**: Update `.dockerignore` (add `.turbo/`)
- [ ] **Step 24**: Rebuild: `docker compose build`
- [ ] **Step 25**: Verify: `make install` succeeds
- [ ] **Step 26**: Verify: `make dev` starts both API + web

### Phase 5: Makefile + CI
- [ ] **Step 27**: Update `Makefile` — remove all `--unstable-sloppy-imports` occurrences (~7 lines)
- [ ] **Step 28**: Update `.github/workflows/ci.yml` — remove `--unstable-sloppy-imports`, use `deno task`
- [ ] **Step 29**: Update `.github/workflows/pr.yml` — same
- [ ] **Step 30**: Update `.gitignore` — add `.turbo/`
- [ ] **Step 31**: Verify: `make ci` passes
- [ ] **Step 32**: Verify: `make preview` works

### Phase 6: Documentation
- [ ] **Step 33**: Update `README.md` — remove Turbo from tech stack table, update Quick Start commands
- [ ] **Step 34**: Verify full CI pipeline passes on GitHub

---

## 14. Rollback Plan

If migration causes issues:

```bash
# 1. Restore deleted files from git
git checkout -- turbo.json .npmrc

# 2. Restore root package.json
git checkout -- package.json

# 3. Restore member package.json files
git checkout -- apps/api/package.json apps/web/package.json packages/db/package.json packages/shared/package.json

# 4. Restore Dockerfile, compose.yml, Makefile
git checkout -- Dockerfile compose.yml Makefile

# 5. Restore CI workflows
git checkout -- .github/workflows/

# 6. Remove added deno.json tasks
# (manually revert deno.json files, or git checkout -- **/deno.json)

# 7. Reinstall
deno install
```

The `"tasks"` field in `deno.json` is backward-compatible — it doesn't break anything if turbo is restored. Tasks are only invoked explicitly (`deno task <name>`).

---

## 15. Verification Checklist

Run after completing all phases:

- [ ] `deno task --recursive check` — passes (all 4 members)
- [ ] `deno task --recursive lint` — passes
- [ ] `deno task --recursive test` — passes
- [ ] `deno task check` — type-checks API entrypoint
- [ ] `deno task test-coverage` — runs tests with coverage
- [ ] `deno task db:generate` — generates drizzle migrations
- [ ] `deno task email-build` — builds email templates
- [ ] `deno task ci` — full CI pipeline passes locally
- [ ] `make install` — Docker dependency caching works
- [ ] `make dev` — API (:8000) + Web (:5173) start with hot reload
- [ ] `make preview` — production build works
- [ ] `make test` — all tests pass in Docker
- [ ] `make email-build` — email templates build
- [ ] `make db-generate` + `make db-migrate` + `make db-seed` — DB setup works
- [ ] `docker compose build` — builds without errors
- [ ] Single `app_node_modules` volume — no per-package volumes
- [ ] `deno.lock` regenerated and consistent
- [ ] CI workflow (`ci.yml`) passes on GitHub
- [ ] PR workflow (`pr.yml`) passes on GitHub
- [ ] No `--unstable-sloppy-imports` in any file (`rg "unstable-sloppy-imports"` returns empty)

---

## 16. Summary of Changes by File

| File | Action | Changes |
|------|--------|---------|
| `packages/shared/src/**/index.ts` (6 files) | **Edit** | Add `.ts` extensions to 47 import/export specifiers |
| `packages/shared/src/types/additional-preparation.ts` | **Edit** | Add `.ts` extension to 1 import |
| `deno.json` (root) | **Edit** | Add `nodeModulesDir`, `tasks` (16 entries) |
| `apps/api/deno.json` | **Edit** | Add `name`, `tasks` (6 entries) |
| `apps/web/deno.json` | **Edit** | Add `name`, `tasks` (6 entries) |
| `packages/db/deno.json` | **Edit** | Add `tasks` (8 entries) |
| `packages/shared/deno.json` | **Edit** | Add `tasks` (4 entries) |
| `package.json` (root) | **Edit** | Remove workspaces/deps/devDeps, rewrite scripts |
| `apps/api/package.json` | **Edit** | Add missing devDeps, empty scripts |
| `packages/db/package.json` | **Edit** | Add missing devDeps, empty scripts |
| `turbo.json` | **Delete** | — |
| `.npmrc` | **Delete** | — |
| `.turbo/` (all) | **Delete** | — |
| `Dockerfile` | **Edit** | Remove turbo.json/.npmrc COPY, remove per-pkg node_modules COPY, remove `--unstable-sloppy-imports` |
| `compose.yml` | **Edit** | Simplify volumes (5→3 per service), remove 4 volume declarations |
| `Makefile` | **Edit** | Remove all `--unstable-sloppy-imports` |
| `.github/workflows/ci.yml` | **Edit** | Remove `--unstable-sloppy-imports`, use `deno task` |
| `.github/workflows/pr.yml` | **Edit** | Remove `--unstable-sloppy-imports`, use `deno task` |
| `.gitignore` | **Edit** | Add `.turbo/` |
| `.dockerignore` | **Edit** | Add `.turbo/` |
| `README.md` | **Edit** | Update tech stack, Quick Start commands |
| `renovate.json` | **No change** | — |
