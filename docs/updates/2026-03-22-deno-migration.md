# Migration: Node.js → Deno 2

**Date:** 2026-03-22  
**Type:** Runtime migration  
**Scope:** Full stack (API + Web)

## Summary

The project runtime was migrated from **Node.js 24 + pnpm** to **Deno 2.7.7**. All tests pass after migration.

## Motivation

- Deno 2 provides native TypeScript execution without a build step for the API
- Simplified toolchain: one runtime handles TypeScript, linting hints, task running, and dependency management
- Deno's built-in security model (`--allow-*` flags)
- Deno is fully backward-compatible with Node.js and npm packages

## Changes

### New files
| File | Purpose |
|---|---|
| `deno.json` | Root Deno config (tasks: format, check) |
| `apps/api/deno.json` | API tasks replacing `package.json` scripts |
| `apps/web/deno.json` | Web tasks replacing `package.json` scripts |
| `apps/api/deno.lock` | Dependency lockfile for API |
| `apps/web/deno.lock` | Dependency lockfile for Web |
| `apps/api/prisma.config.ts` | Prisma 7 datasource config (URL moved out of schema.prisma) |
| `apps/api/src/types/deno.d.ts` | Minimal Deno ambient declarations for IDE TypeScript LSP |

### Removed files
| File | Reason |
|---|---|
| `pnpm-workspace.yaml` | No longer needed |
| `pnpm-lock.yaml` | Replaced by `deno.lock` per app |
| `pnpm-lock.yml` | Stale blank file |

### Modified files

**`apps/api/src/index.ts`**
- Removed `@hono/node-server` import
- Replaced `serve({ fetch: app.fetch, port })` with `Deno.serve({ port }, app.fetch)`
- Replaced `process.on('SIGTERM'/'SIGINT')` with `Deno.addSignalListener`
- Replaced `process.exit(0)` with `Deno.exit(0)`

**`apps/api/prisma/schema.prisma`**
- Removed `url = env("DATABASE_URL")` from datasource block (Prisma 7 breaking change)
- URL is now in `apps/api/prisma.config.ts`

**`apps/api/Dockerfile` / `apps/web/Dockerfile`**
- Base image: `node:24-trixie-slim` → `denoland/deno:debian-2.7.7`
- Replaced `pnpm install --frozen-lockfile` with `deno install --allow-scripts`
- Replaced `pnpm build` / `pnpm dev` with `deno task build` / `deno task dev`
- API no longer needs a build step — Deno runs TypeScript directly

**`apps/web/vite.config.ts` + `apps/web/vitest.config.ts`**
- `import { resolve } from 'path'` → `import { resolve } from 'node:path'`  
  (Deno requires explicit `node:` prefix for built-in modules)

**`docker-compose.yml`**
- Removed `pnpm-workspace.yaml` bind-mount
- Removed root `package.json` bind-mount (each app mounts its own directory)
- Added `./deno.json:/app/deno.json` bind-mount

**`Makefile`**
- All `pnpm` commands replaced with `deno task` or `deno run --allow-all`
- `make install` uses `deno install --allow-scripts=<packages> --lock=deno.lock`

**`package.json` (root)**
- Removed `workspaces`, `scripts`, `turbo` devDependency
- Kept minimal: `@biomejs/biome` + `typescript` for IDE tooling

**`.github/workflows/ci.yml`**
- Replaced `pnpm/action-setup` + `actions/setup-node` with `denoland/setup-deno@v2`
- All steps use `deno install` / `deno task`

## Prisma 7 Breaking Change

Prisma 7 removed the `url` property from the `datasource` block in `schema.prisma`. The connection URL must now be declared in `prisma.config.ts`:

```typescript
// apps/api/prisma.config.ts
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations', seed: 'deno run --allow-all prisma/seed.ts' },
  datasource: { url: process.env.DATABASE_URL ?? '' },
});
```

## Known Notes

- **Deno globals in IDE**: `src/index.ts` uses `Deno.serve`, `Deno.addSignalListener`, `Deno.exit`. The IDE TypeScript LSP shows errors for these unless the Deno VS Code extension is installed. `src/types/deno.d.ts` provides minimal ambient declarations as a fallback.
- **Prisma engines build scripts**: `deno install --allow-scripts=npm:@prisma/engines,npm:prisma` correctly lists the packages, but Deno 2.7.7 may still warn about ignored build scripts for Prisma. The Docker image build uses `--allow-scripts` which downloads engines correctly. For local IDE setup, run `make db-generate` after `make install` to regenerate the Prisma client inside the container (where engines are available from the image).
- **`nodeModulesDir`**: Set to `"auto"` in each app's `deno.json`. The warning `"nodeModulesDir" field can only be specified in workspace root` is benign — Deno still resolves packages correctly.

## Web Test Infrastructure Fixes

After migrating from Vitest to Deno's native test runner, several web test failures required targeted fixes. All 20 web test files now pass.

### `@testing-library/dom` `screen` early evaluation

`screen.js` captures `document.body` at **module evaluation time**. The original `setup.ts` imported `@testing-library/react` statically, which caused `@testing-library/dom` to load and evaluate `screen` before `setup.ts`'s own code ran (which creates the JSDOM and sets `globalThis.document`). Result: all `screen.*` queries threw `TypeError: For queries bound to document.body a global document has to be available`.

**Fix:** Removed the static `import { cleanup } from '@testing-library/react'` from `setup.ts` and replaced it with a dynamic import inside `afterEach`:

```typescript
afterEach(async () => {
  const { cleanup } = await import('@testing-library/react');
  cleanup();
});
```

This ensures `@testing-library/dom` loads only after `globalThis.document` is already set.

### `@std/expect` incompatibility with `@testing-library/jest-dom`

`@testing-library/jest-dom` matchers follow Jest's calling convention: `matcher.call(context, received, ...args)` — `this` is the context, first argument is the received value.

`@std/expect` uses a different convention: `matcher(context, ...args)` where `context.value` is the received value (no `this` binding). Calling `expect.extend(jestDomMatchers)` made `this` undefined inside jest-dom matchers, causing crashes in `GenericTypeError` when it accessed `context.utils.matcherHint`.

**Fix:** Replaced the jest-dom import with a minimal custom `toBeInTheDocument` matcher written in `@std/expect`'s calling convention (`apps/web/src/test/setup.ts`):

```typescript
expect.extend({
  toBeInTheDocument(context: { value: unknown; isNot: boolean }) {
    const el = context.value as Element | null;
    const pass =
      el !== null &&
      el !== undefined &&
      (el as any).ownerDocument?.body?.contains?.(el) === true;
    return {
      pass,
      message: () =>
        pass
          ? 'Expected element NOT to be in the document, but it was found'
          : 'Expected element to be in the document, but it was not found',
    };
  },
});
```

### i18n mock lacked real translations

With an empty `{}` translation resource, `t('errors.generic.title')` returned the raw key `'errors.generic.title'` and `t('errors.generic.retry')` returned `'errors.generic.retry'`. A test querying `/error|something went wrong|oops/i` matched both (both start with "errors"), causing `getMultipleElementsFoundError`. Similarly, tests expecting `'Fruity'`, `'Espresso'`, `'Lungo'`, etc. found nothing.

**Fix:** Added real English translations to `apps/web/src/test/mocks/i18n.ts` for the keys exercised by tests: `errors.generic`, `recipe.tags`, `recipe.drinkTypes`, `recipe.brewMethods`.

### SWR mock missing `mutate` named export

`RecipeDetailPage.tsx` imports `import useSWR, { mutate } from 'swr'`. The SWR mock only exported the default `useSWR`. Deno's strict module resolution threw a `SyntaxError` on the missing named export.

**Fix:** Added `export const mutate = mockFn(() => Promise.resolve(undefined))` to `apps/web/src/test/mocks/swr.ts`.

### `ThemeProvider` missing from global `TestWrapper`

Components using `useTheme()` threw `useTheme must be used within ThemeProvider` because the global `TestWrapper` in `apps/web/src/test/test-utils.tsx` did not include `ThemeProvider`.

**Fix:** Wrapped the `TestWrapper` JSX tree with `<ThemeProvider>`.

---

## Verification

```bash
make install     # Install dependencies, generate deno.lock
make test        # All tests pass: API + Web
```

Test results post-migration:
- **API**: All test suites pass
- **Web**: 20 test files, 96 test steps — all pass
